// src/game/game.gateway.ts
import {
  ConnectedSocket, MessageBody, OnGatewayInit, SubscribeMessage, WebSocketGateway, WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { UseGuards, NotFoundException } from '@nestjs/common';
import { AuthGuardSocket } from 'src/auth/auth-socket.guard';
import { RealtimeService } from 'src/realtime/realtime.service';
import { LobbyService } from 'src/lobby/lobby.service';
import { BiddingService } from 'src/bidding/bidding.service';
import { PrismaService } from 'src/prisma/prisma.service';

@WebSocketGateway({ cors: true })
@UseGuards(AuthGuardSocket)
export class GameGateway implements OnGatewayInit {
  @WebSocketServer() server: Server;
  constructor(
    private readonly rt: RealtimeService,
    private readonly lobbyService: LobbyService,
    private readonly biddingService: BiddingService,
    private readonly prisma: PrismaService,
  ) { }
  afterInit(server: Server) {
    this.rt.setServer(server);
    console.log('[WS] Gateway afterInit: server set in RealtimeService');
  }

  @SubscribeMessage('joinPartie')
  async joinPartie(
    @ConnectedSocket() client: Socket & { user: { sub: number; username?: string } },
    @MessageBody() data: { partieId: number },
  ) {
    const joueurId = client.user.sub;
    const { partieId } = data;

    // ✅ Vérifie l’appartenance du joueur à la partie
    const info = await this.lobbyService.findPartieWithEquipe(partieId, joueurId);
    const mancheId = info.partie.mancheCourante?.id ?? null;
    if (!mancheId) throw new NotFoundException(`Aucune manche active pour la partie ${partieId}.`);

    // Room + registre le client pour les envois ciblés
    client.join(`partie-${partieId}`);
    this.rt.registerClient(client, joueurId);

    // Confirme au client qu'il a rejoint + donne manche courante
    client.emit('joinedPartie', {
      partieId,
      joueurId,
      mancheId,
      at: new Date().toISOString(),
    });

    // 🔁 envoie l’état d’enchères initial
    const st = await this.biddingService.getState(mancheId);
    this.rt.emitToJoueur(joueurId, 'bidding:state', {
      mancheId: st.mancheId,
      joueurActuelId: st.joueurActuelId,
      tourActuel: st.tourActuel as 1 | 2,
      encheres: st.historique.map(e => ({
        joueurId: e.joueur.id,
        type: e.type,
        couleurAtoutId: e.couleurAtoutId ?? undefined,
        encherePoints: undefined,
        createdAt: e.at.toISOString(),
      })),
    });
    this.rt.emitToJoueur(joueurId, 'bidding:state', {
      mancheId: st.mancheId,
      joueurActuelId: st.joueurActuelId,
      tourActuel: st.tourActuel as 1 | 2,
      encheres: st.historique.map(e => ({
        joueurId: e.joueur.id,
        type: e.type,
        couleurAtoutId: e.couleurAtoutId ?? undefined,
        encherePoints: undefined,
        createdAt: e.at.toISOString(),
      })),
      carteRetournee: st.carteRetournee
        ? { id: st.carteRetournee.id, valeur: st.carteRetournee.valeur, couleurId: st.carteRetournee.couleurId }
        : null,
    });

    // 🔁 envoie la main privée du joueur
    const hand = await this.prisma.main.findMany({
      where: { mancheId, joueurId, jouee: false },
      include: { carte: true },
      orderBy: { id: 'asc' },
    });
    this.rt.emitHandTo(joueurId, {
      mancheId,
      cartes: hand.map(m => ({ id: m.carteId, valeur: m.carte.valeur, couleurId: m.carte.couleurId })),
    });

    return { success: true };
  }
}
