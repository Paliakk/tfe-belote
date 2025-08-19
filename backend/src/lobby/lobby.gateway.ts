// src/lobby/lobby.gateway.ts
import {
  WebSocketGateway, WebSocketServer, SubscribeMessage,
  MessageBody, ConnectedSocket, OnGatewayConnection, OnGatewayDisconnect
} from '@nestjs/websockets';
import { UseGuards, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { WsJwtGuard } from 'src/auth/ws-jwt.guard';
import { PrismaService } from 'src/prisma/prisma.service';
import { RealtimeService } from 'src/realtime/realtime.service';

@WebSocketGateway({ cors: true })
@UseGuards(WsJwtGuard)
@Injectable()
export class LobbyGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server: Server;
  private readonly logger = new Logger('LobbyGateway');

  constructor(
    private readonly prisma: PrismaService,
    private readonly rt: RealtimeService,
  ) { }

  afterInit() {
    // Enregistrer le server dans le RealtimeService (clé du pattern)
    this.rt.setServer(this.server);
  }

  async handleConnection(client: Socket) {
    const token = client.handshake.auth?.token || (client.handshake.query?.token as string | undefined);
    if (!token) {
      this.logger.warn(`WS lobby sans token: ${client.id} (connexion autorisée mais non identifiée)`);
      return;
    }
    // ici tu peux juste logger; l’auth stricte reste faite par le guard sur chaque event
    this.logger.log(`WS lobby connecté (token fourni): ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`WS lobby déconnecté: ${client.id}`);
  }

  // --- Events côté WS (facultatifs mais utiles) ---

  /** Un client veut écouter un lobby en particulier */
  @SubscribeMessage('lobby:joinRoom')
  async joinRoom(
    @MessageBody() data: { lobbyId: number },
    @ConnectedSocket() client: Socket,
  ) {
    if (!data?.lobbyId) throw new UnauthorizedException('lobbyId manquant');
    await client.join(`lobby-${data.lobbyId}`);
    client.emit('lobby:joinedRoom', { lobbyId: data.lobbyId });
  }

  /** Quitter la room du lobby */
  @SubscribeMessage('lobby:leaveRoom')
  async leaveRoom(
    @MessageBody() data: { lobbyId: number },
    @ConnectedSocket() client: Socket,
  ) {
    if (!data?.lobbyId) return;
    await client.leave(`lobby-${data.lobbyId}`);
    client.emit('lobby:leftRoom', { lobbyId: data.lobbyId });
  }

  /** Petit chat dans le lobby */
  @SubscribeMessage('lobby:chat')
  async lobbyChat(
    @MessageBody() data: { lobbyId: number; message: string },
    @ConnectedSocket() client: Socket,
  ) {
    const user = client.data.user;
    if (!user) throw new UnauthorizedException();
    this.server.to(`lobby-${data.lobbyId}`).emit('lobby:chatMessage', {
      lobbyId: data.lobbyId,
      from: user.nickname || user.email || user.sub,
      message: data.message,
      at: new Date().toISOString(),
    });
  }
}
