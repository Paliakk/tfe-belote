import {
  ConnectedSocket, MessageBody, OnGatewayInit, SubscribeMessage,
  WebSocketGateway, WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { UseGuards } from '@nestjs/common';
import { AuthGuardSocket } from 'src/auth/auth-socket.guard';
import { JwtPayload } from 'src/auth/jwt.strategy';
import { RealtimeService } from 'src/realtime/realtime.service';
import { LobbyService } from 'src/lobby/lobby.service';
import { GameEvent, JoinedPartiePayload } from 'src/realtime/game-event';

@WebSocketGateway({ cors: true })
@UseGuards(AuthGuardSocket)
export class LobbyGateway implements OnGatewayInit {
  @WebSocketServer() server: Server;

  constructor(
    private readonly rt: RealtimeService,
    private readonly lobbyService: LobbyService,
  ) {}

  afterInit(server: Server) {
    this.rt.setServer(server);
    console.log('[WS] Gateway afterInit: server set in RealtimeService');
  }
  
  @SubscribeMessage('lobby:create')
  async handleLobbyCreate(
    @MessageBody() data: { nom: string; password?: string },
    @ConnectedSocket() client: Socket & { user: JwtPayload },
  ) {
    const lobby = await this.lobbyService.create(data, client.user.sub);
    client.join(`lobby-${lobby.id}`);
    this.rt.registerClient(client, client.user.sub);

    // informer le créateur
    client.emit('lobby:joined', { lobbyId: lobby.id });

    // état initial pour tous
    const members = [{ id: client.user.sub, username: lobby.createur.username }];
    this.rt.emitLobbyState(lobby.id, members);

    return {
      lobbyId: lobby.id,
      nom: lobby.nom,
      createurId: lobby.createurId,
      membres: members,
    };
  }

  @SubscribeMessage('lobby:joinByName')
  async handleJoinByName(
    @ConnectedSocket() client: Socket & { user: JwtPayload },
    @MessageBody() data: { nom: string },
  ) {
    const joueurId = client.user.sub;
    const lobby = await this.lobbyService.joinByName(data.nom, joueurId);

    client.join(`lobby-${lobby.id}`);
    this.rt.registerClient(client, joueurId);
    client.emit('lobby:joined', { lobbyId: lobby.id });

    // évènement court + état complet pour assurer la synchro chez tout le monde
    this.rt.emitLobbyEvent(lobby.id, 'join', client.user.username);
    this.rt.emitLobbyState(lobby.id, lobby.membres);

    return { message: `Rejoint le lobby ${lobby.nom}`, lobbyId: lobby.id, membres: lobby.membres };
  }

  @SubscribeMessage('lobby:joinRoom')
  async handleJoinLobbyRoom(
    @ConnectedSocket() client: Socket & { user: JwtPayload },
    @MessageBody() data: { lobbyId: number; password?: string },
  ) {
    const lobby = await this.lobbyService.join({ lobbyId: data.lobbyId, password: data.password }, client.user.sub);
    client.join(`lobby-${lobby.id}`);
    this.rt.registerClient(client, client.user.sub);
    client.emit('lobby:joined', { lobbyId: lobby.id });

    this.rt.emitLobbyEvent(lobby.id, 'join', client.user.username);
    this.rt.emitLobbyState(lobby.id, lobby.membres);

    return { success: true, lobbyId: lobby.id, membres: lobby.membres };
  }

  @SubscribeMessage('lobby:leaveRoom')
  async handleLeaveLobbyRoom(
    @ConnectedSocket() client: Socket & { user: JwtPayload },
    @MessageBody() data: { lobbyId: number },
  ) {
    const lobbyId = data?.lobbyId;
    if (!lobbyId) return { error: 'lobbyId requis.' };

    const joueurId = client.user.sub;
    const result = await this.lobbyService.leaveSocket(lobbyId, joueurId);

    try {
      const lobbyInfo = await this.lobbyService.listMembers(lobbyId);

      // autres membres
      this.rt.emitLobbyEvent(lobbyId, 'leave', client.user.username);
      this.rt.emitLobbyState(lobbyId, lobbyInfo.membres);

      // le joueur qui quitte (avant de sortir de la room)
      this.rt.emitLobbyStateToClient(client, lobbyId, lobbyInfo.membres);
    } catch {
      // lobby supprimé → prévenir tout le monde (et l'utilisateur)
      this.rt.emitLobbyClosed(lobbyId);
      client.emit('lobby:closed', { lobbyId });
    }

    client.leave(`lobby-${lobbyId}`);
    return result;
  }

  @SubscribeMessage('lobby:startGame')
  async handleStartGame(
    @ConnectedSocket() client: Socket & { user: JwtPayload },
    @MessageBody() data: { lobbyId: number; scoreMax?: number },
  ) {
    const joueurId = client.user.sub;
    const { lobbyId, scoreMax } = data;
    const result = await this.lobbyService.startGame(lobbyId, joueurId, scoreMax);

    // notifier tout le monde et pousser l’URL de redirection
    this.rt.emitGameStarted(lobbyId, result.partie.id)

    return result;
  }

  // (la partie joinPartie reste inchangée)
}
