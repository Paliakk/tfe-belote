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
import { GameEvent, BiddingPlacedPayload, BiddingStatePayload } from 'src/realtime/game-event';
import { BiddingService } from 'src/bidding/bidding.service';
import { BidType } from 'src/bidding/dto/create-bid.dto';
import { PrismaService } from 'src/prisma/prisma.service';

@WebSocketGateway({ cors: true })
@UseGuards(AuthGuardSocket)
export class BiddingGateway implements OnGatewayInit {
  @WebSocketServer()
  server: Server;

  constructor(
    private readonly rt: RealtimeService,
    private readonly biddingService: BiddingService,
    private readonly prisma: PrismaService,
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
    @ConnectedSocket() client: Socket & { user?: { sub: number } },
  ) {
    const state = await this.biddingService.getState(data.mancheId);

    const payload: BiddingStatePayload = {
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
    };

    // ➜ au demandeur (pratique pour un “refresh” ciblé)
    client.emit(GameEvent.BiddingState, payload);

    // (Option) tu peux aussi diffuser à toute la table si tu veux resynchroniser tout le monde :
    // const partieId = await this.getPartieIdFromManche(data.mancheId);
    // this.rt.emitToPartie(partieId, GameEvent.BiddingState, payload);
  }

  // === Poser une enchère (diffusée à TOUTE la room de la partie) ===
  @SubscribeMessage('bidding:place')
  async placeBid(
    @MessageBody() data: {
      mancheId: number;
      type: 'pass' | 'take_card' | 'choose_color';
      couleurAtoutId?: number;
    },
    @ConnectedSocket() client: Socket & { user?: { sub: number } },
  ) {
    const joueurId = client.user!.sub;

    // 1) Action métier
    await this.biddingService.placeBid(data.mancheId, joueurId, {
      type: data.type as BidType,
      couleurAtoutId: data.couleurAtoutId,
    });

    // 2) Identifier la room de diffusion
    const partieId = await this.getPartieIdFromManche(data.mancheId);

    // 3) “event court” pour l’UX (qui a joué quoi)
    const placedPayload: BiddingPlacedPayload = {
      mancheId: data.mancheId,
      joueurId,
      type: data.type,
      couleurAtoutId: data.couleurAtoutId ?? undefined,
      encherePoints: undefined, // pas utilisé ici
      tour: 1, // ou calcule si tu l’as côté service
      at: new Date().toISOString(),
    };
    this.rt.emitToPartie(partieId, GameEvent.BiddingPlaced, placedPayload);

    // 4) “état complet” pour que tout le monde se resynchronise exactement
    const updated = await this.biddingService.getState(data.mancheId);
    const statePayload: BiddingStatePayload = {
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
    };
    this.rt.emitToPartie(partieId, GameEvent.BiddingState, statePayload);
  }
}
