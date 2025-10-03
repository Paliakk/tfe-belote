import {
  ConnectedSocket,
  MessageBody,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { UseGuards, NotFoundException } from '@nestjs/common';
import { AuthGuardSocket } from 'src/auth/auth-socket.guard';
import { RealtimeService } from 'src/realtime/realtime.service';
import {
  GameEvent,
  BiddingPlacedPayload,
  BiddingStatePayload,
} from 'src/realtime/ws-events';
import { BiddingService } from 'src/bidding/bidding.service';
import { BidType } from 'src/bidding/dto/create-bid.dto';
import { PrismaService } from 'src/prisma/prisma.service';
import { PlayQueriesService } from 'src/play/play.queries';
import type { SocketWithUser } from 'src/types/ws';

@WebSocketGateway({
  cors: {
    origin: [
      'http://localhost:5173',
      'https://scintillating-reverence-production.up.railway.app'
    ],
    credentials: true
  }
})
@UseGuards(AuthGuardSocket)
export class BiddingGateway implements OnGatewayInit {
  @WebSocketServer()
  server: Server;

  constructor(
    private readonly rt: RealtimeService,
    private readonly biddingService: BiddingService,
    private readonly prisma: PrismaService,
    private readonly playQueries: PlayQueriesService,
  ) {}

  afterInit(server: Server) {
    // OK si déjà appelé ailleurs : on s’assure que RealtimeService a bien le server
    this.rt.setServer(server);
    console.log('[WS] BiddingGateway afterInit: server set in RealtimeService');
  }

  /** Utilitaire: retrouver la partie à partir de la manche */
  private async getPartieIdFromManche(mancheId: number): Promise<number> {
    const manche = await this.prisma.manche.findUnique({
      where: { id: mancheId },
      select: { partieId: true },
    });
    if (!manche) throw new NotFoundException(`Manche ${mancheId} introuvable.`);
    return manche.partieId;
  }

  // === Lire l'état des enchères (renvoyé au demandeur, et optionnellement à la room si tu veux) ===
  @SubscribeMessage('bidding:getState')
  async getState(
    @MessageBody() data: { mancheId: number },
    @ConnectedSocket() client: SocketWithUser,
  ) {
    if (client?.user?.sub) this.rt.registerClient(client, client.user.sub)
    const state = await this.biddingService.getState(data.mancheId);
    const seats = await this.biddingService.getSeatsForManche(data.mancheId);
    const payload: BiddingStatePayload & {
      seats: { seat: number; joueurId: number; username: string }[];
      carteRetournee?: { id: number; valeur: string; couleurId: number } | null;
    } = {
      mancheId: state.mancheId,
      joueurActuelId: state.joueurActuelId,
      tourActuel: state.tourActuel as 1 | 2,
      encheres: state.historique.map((e) => ({
        joueurId: e.joueur.id,
        type: e.type,
        couleurAtoutId: e.couleurAtoutId ?? undefined,
        encherePoints: undefined,
        createdAt: e.at.toISOString(),
      })),
      seats,
      carteRetournee: state.carteRetournee
        ? {
            id: state.carteRetournee.id,
            valeur: state.carteRetournee.valeur,
            couleurId: state.carteRetournee.couleurId,
          }
        : null,
    };
    client.emit(GameEvent.BiddingState, payload);

    // (Option) tu peux aussi diffuser à toute la table si tu veux resynchroniser tout le monde :
    // const partieId = await this.getPartieIdFromManche(data.mancheId);
    // this.rt.emitToPartie(partieId, GameEvent.BiddingState, payload);
  }

  // === Poser une enchère (diffusée à TOUTE la room de la partie) ===
  @SubscribeMessage('bidding:place')
  async placeBid(
    @MessageBody()
    data: {
      mancheId: number;
      type: 'pass' | 'take_card' | 'choose_color';
      couleurAtoutId?: number;
    },
    @ConnectedSocket() client: Socket & { user?: { sub: number } },
  ) {
    const joueurId = client.user!.sub;
    const res = await this.biddingService.placeBid(data.mancheId, joueurId, {
      type: data.type as BidType,
      couleurAtoutId: data.couleurAtoutId,
    });

    const partieId = await this.getPartieIdFromManche(data.mancheId);

    // event "court" (UX)
    this.rt.emitToPartie(partieId, GameEvent.BiddingPlaced, {
      mancheId: data.mancheId,
      joueurId,
      type: data.type,
      couleurAtoutId: data.couleurAtoutId ?? undefined,
      encherePoints: undefined,
      tour: 1,
      at: new Date().toISOString(),
    });

    // état complet à toute la table
    const updated = await this.biddingService.getState(data.mancheId);
    const seats = await this.biddingService.getSeatsForManche(data.mancheId);
    this.rt.emitToPartie(partieId, GameEvent.BiddingState, {
      mancheId: updated.mancheId,
      joueurActuelId: updated.joueurActuelId,
      tourActuel: updated.tourActuel as 1 | 2,
      encheres: updated.historique.map((e) => ({
        joueurId: e.joueur.id,
        type: e.type,
        couleurAtoutId: e.couleurAtoutId ?? undefined,
        encherePoints: undefined,
        createdAt: e.at.toISOString(),
      })),
      seats,
      carteRetournee: updated.carteRetournee
        ? {
            id: updated.carteRetournee.id,
            valeur: updated.carteRetournee.valeur,
            couleurId: updated.carteRetournee.couleurId,
          }
        : null,
    });

    // 👉 Cas 1: prise (TAKE_CARD / CHOOSE_COLOR) -> redistrib finale: mains à jour pour chacun
    if (res.message?.startsWith('Preneur fixé')) {
      await this.rt.emitHandsForPartie(this.prisma, partieId, data.mancheId);

      // 1) Déterminer qui commence le 1er pli
      // Si tu as déjà la logique quelque part, utilise-la. Sinon, prends ce que ta DB indique.
      let firstToPlayId = (
        await this.prisma.manche.findUnique({
          where: { id: data.mancheId },
          select: { joueurActuelId: true },
        })
      )?.joueurActuelId;

      // Si non défini, appelle ta logique métier (à adapter à tes règles)
      // ex: firstToPlayId = await this.playService.getFirstPlayerId(data.mancheId);
      if (!firstToPlayId) {
        // Fallback ultra simple: rester sur joueurActuelId déjà décidé par ton service d'enchères
        firstToPlayId = updated.joueurActuelId;
        // Et on peut persister si nécessaire:
        await this.prisma.manche.update({
          where: { id: data.mancheId },
          data: { joueurActuelId: firstToPlayId },
        });
      }

      // 2) Diffuser à toute la table qui doit jouer
      this.rt.emitToPartie(partieId, 'turn:state', {
        mancheId: data.mancheId,
        joueurActuelId: firstToPlayId,
      });

      // 3) Envoyer les cartes jouables AU SEUL joueur actif
      const playable = await this.playQueries.getPlayable(
        data.mancheId,
        firstToPlayId,
      );
      // Normalise si besoin: le front accepte {carteIds}/playable/cartes[…]
      this.rt.emitToJoueur(firstToPlayId, 'play:playable', playable);

      // 4) Signal fin enchères pour l’UI (tu l’avais déjà)
      this.rt.emitToPartie(partieId, 'bidding:ended', {
        mancheId: data.mancheId,
        preneurId: joueurId,
        atoutId:
          data.type === 'take_card'
            ? updated.carteRetournee?.couleurId
            : data.couleurAtoutId,
      });
      return;
    }

    // 👉 Cas 2: relance
    if (res.newMancheId) {
      // avertir toute la table
      this.rt.emitToPartie(partieId, 'donne:relancee', {
        oldMancheId: data.mancheId,
        newMancheId: res.newMancheId,
        numero: res.numero,
      });
      // pousser les nouvelles mains pour la nouvelle donne
      await this.rt.emitHandsForPartie(this.prisma, partieId, res.newMancheId);
      // et pousser l’état d’enchères initial de la nouvelle donne
      const st2 = await this.biddingService.getState(res.newMancheId);
      this.rt.emitToPartie(partieId, GameEvent.BiddingState, {
        mancheId: st2.mancheId,
        joueurActuelId: st2.joueurActuelId,
        tourActuel: st2.tourActuel as 1 | 2,
        encheres: st2.historique.map((e) => ({
          joueurId: e.joueur.id,
          type: e.type,
          couleurAtoutId: e.couleurAtoutId ?? undefined,
          encherePoints: undefined,
          createdAt: e.at.toISOString(),
        })),
      });
    }
  }
}
