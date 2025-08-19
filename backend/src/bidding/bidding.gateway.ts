import {
  WebSocketGateway, WebSocketServer, SubscribeMessage,
  MessageBody, ConnectedSocket, OnGatewayConnection, OnGatewayDisconnect
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Injectable, Logger, UnauthorizedException, NotFoundException, UseGuards } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { WsJwtGuard } from 'src/auth/ws-jwt.guard';
import { BiddingService } from './bidding.service';
import { WsPlaceBidDto } from './dto/ws-bid.dto';

@UseGuards(WsJwtGuard)
@WebSocketGateway({ cors: true })
@Injectable()
export class BiddingGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server: Server;
  private readonly logger = new Logger('BiddingGateway');

  constructor(
    private readonly prisma: PrismaService,
    private readonly bidding: BiddingService,
  ) {}

  private async resolveJoueur(client: Socket) {
    // WsJwtGuard met déjà le payload décodé sur client.data.user
    const sub = client.data?.user?.sub || client.data?.user?.auth0Sub;
    if (!sub) throw new UnauthorizedException('Auth0 sub manquant');
    const joueur = await this.prisma.joueur.findUnique({ where: { auth0Sub: sub } });
    if (!joueur) throw new UnauthorizedException('Joueur inconnu (provision manquante)');
    return joueur;
  }

  async handleConnection(client: Socket) {
    this.logger.log(`WS connect: ${client.id}`);
  }

  async handleDisconnect(client: Socket) {
    this.logger.log(`WS disconnect: ${client.id}`);
  }

  /**
   * Rejoindre la "room" de la manche pour recevoir l'état et les événements d’enchères.
   * Room: `manche-<id>`
   */
  @SubscribeMessage('bidding:joinManche')
  async joinManche(@MessageBody() data: { mancheId: number }, @ConnectedSocket() client: Socket) {
    if (!data?.mancheId) throw new UnauthorizedException('mancheId requis');
    await client.join(`manche-${data.mancheId}`);
    client.emit('bidding:joinedManche', { mancheId: data.mancheId });
    return { ok: true, joined: `manche-${data.mancheId}` };
  }

  /**
   * Demander l’état courant des enchères (utile au chargement d’écran)
   */
  @SubscribeMessage('bidding:getState')
  async getState(@MessageBody() data: { mancheId: number }) {
    if (!data?.mancheId) throw new UnauthorizedException('mancheId requis');
    const state = await this.bidding.getState(data.mancheId);
    return state;
  }

  /**
   * Poser une enchère (pass / take_card / choose_color)
   * Payload: { mancheId, type, couleurAtoutId? }
   */
  @SubscribeMessage('bidding:place')
  async place(@MessageBody() dto: WsPlaceBidDto, @ConnectedSocket() client: Socket) {
    const joueur = await this.resolveJoueur(client);

    // Appelle le service domaine avec le joueurId issu du token
    const res = await this.bidding.placeBid(dto.mancheId, joueur.id, {
      // le service attend un CreateBidDto, sans se soucier du token
      joueurId: joueur.id, // ne sera pas utilisé s’il ignore, sinon innocuous
      type: dto.type,
      couleurAtoutId: dto.couleurAtoutId,
    } as any);

    // Après action, on renvoie l'état à tous les clients de la manche
    const newState = await this.bidding.getState(dto.mancheId);
    this.server.to(`manche-${dto.mancheId}`).emit('bidding:state', newState);

    // Petits événements granulaires (optionnel mais pratique côté UI)
    this.server.to(`manche-${dto.mancheId}`).emit('bidding:placed', {
      by: { id: joueur.id, username: joueur.username },
      result: res,
      at: new Date().toISOString(),
    });

    // Cas spécial: relance de donne (UC14) — ton service renvoie { newMancheId } ou similaire
    if ((res as any)?.newMancheId) {
      const { newMancheId } = res as any;

      // Notifier la fin des enchères sans preneur et la nouvelle manche
      this.server.to(`manche-${dto.mancheId}`).emit('bidding:noTakerRelance', {
        oldMancheId: dto.mancheId,
        newMancheId,
      });

      // Éventuellement, faire quitter l’ancienne room et inviter à rejoindre la nouvelle
      // (le front pourra ré-exécuter 'bidding:joinManche' avec newMancheId)
    }

    return { ok: true };
  }
}
