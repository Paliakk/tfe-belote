import {
  ConnectedSocket,
  MessageBody,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server } from 'socket.io';
import { UseGuards } from '@nestjs/common';
import { AuthGuardSocket } from 'src/auth/auth-socket.guard';
import { RealtimeService } from 'src/realtime/realtime.service';
import { LobbyService } from 'src/lobby/lobby.service';
import { FriendsService } from 'src/friends/friends.service';
import type { SocketWithUser } from 'src/types/ws';

@WebSocketGateway({ cors: true })
@UseGuards(AuthGuardSocket)
export class LobbyGateway implements OnGatewayInit {
  @WebSocketServer() server: Server;

  constructor(
    private readonly rt: RealtimeService,
    private readonly lobbyService: LobbyService,
    private readonly friends: FriendsService,
  ) { }

  afterInit(server: Server) {
    this.rt.setServer(server);
    console.log('[WS] Gateway afterInit: server set in RealtimeService');
  }

  @SubscribeMessage('lobby:create')
  async handleLobbyCreate(
    @MessageBody() data: { nom: string; password?: string },
    @ConnectedSocket() client: SocketWithUser,
  ) {
    // Sécurité: si jamais user n’est pas présent, on coupe court
    if (!client.user?.sub) return { error: 'unauthorized' };

    const lobby = await this.lobbyService.create(data, client.user.sub);
    client.join(`lobby-${lobby.id}`);
    this.rt.registerClient(client, client.user.sub);
    await this.notifyFriendsLobbyChanged(client.user.sub, lobby.id)

    // informer le créateur
    client.emit('lobby:joined', { lobbyId: lobby.id });

    // état initial pour tous
    const members = [
      { id: client.user.sub, username: lobby.createur.username },
    ];
    this.rt.emitLobbyState(lobby.id, members, lobby.nom);

    return {
      lobbyId: lobby.id,
      nom: lobby.nom,
      createurId: lobby.createurId,
      membres: members,
    };
  }

  @SubscribeMessage('lobby:joinByName')
  async handleJoinByName(
    @ConnectedSocket() client: SocketWithUser,
    @MessageBody() data: { nom: string },
  ) {
    if (!client.user?.sub) return { error: 'unauthorized' };

    const joueurId = client.user.sub;
    const lobby = await this.lobbyService.joinByName(data.nom, joueurId);

    client.join(`lobby-${lobby.id}`);
    this.rt.registerClient(client, joueurId);
    client.emit('lobby:joined', { lobbyId: lobby.id });
    await this.notifyFriendsLobbyChanged(joueurId, lobby.id)

    // évènement court + état complet pour assurer la synchro chez tout le monde
    this.rt.emitLobbyEvent(lobby.id, 'join', client.user.username ?? `J${joueurId}`);
    this.rt.emitLobbyState(lobby.id, lobby.membres, lobby.nom);

    return {
      message: `Rejoint le lobby ${lobby.nom}`,
      lobbyId: lobby.id,
      membres: lobby.membres,
    };
  }

  @SubscribeMessage('lobby:joinRoom')
  async handleJoinLobbyRoom(
    @ConnectedSocket() client: SocketWithUser,
    @MessageBody() data: { lobbyId: number; password?: string },
  ) {
    if (!client.user?.sub) return { error: 'unauthorized' };

    const lobby = await this.lobbyService.join(
      { lobbyId: data.lobbyId, password: data.password },
      client.user.sub,
    );
    client.join(`lobby-${lobby.id}`);
    this.rt.registerClient(client, client.user.sub);
    await this.notifyFriendsLobbyChanged(client.user.sub, lobby.id)
    client.emit('lobby:joined', { lobbyId: lobby.id });

    this.rt.emitLobbyEvent(lobby.id, 'join', client.user.username ?? `J${client.user.sub}`);
    this.rt.emitLobbyState(lobby.id, lobby.membres, lobby.nom);


    return { success: true, lobbyId: lobby.id, membres: lobby.membres };
  }

  @SubscribeMessage('lobby:leaveRoom')
  async handleLeaveLobbyRoom(
    @ConnectedSocket() client: SocketWithUser,
    @MessageBody() data: { lobbyId: number },
  ) {
    const lobbyId = data?.lobbyId;
    if (!lobbyId) return { error: 'lobbyId requis.' };

    const joueurId = client.user!.sub;

    // 👇 SNAPSHOT des membres AVANT potentielle suppression
    const membersBefore = await this.lobbyService.getMemberIds(lobbyId).catch(() => []);

    const result = await this.lobbyService.leaveSocket(lobbyId, joueurId);

    try {
      const lobbyInfo = await this.lobbyService.listMembers(lobbyId);
      const light = await this.lobbyService.getLobbyLight(lobbyId);
      this.rt.emitLobbyEvent(lobbyId, 'leave', client.user!.username!);
      this.rt.emitLobbyState(lobbyId, lobbyInfo.membres, light?.nom ?? undefined);

      // le joueur qui quitte (avant de sortir de la room)
      this.rt.emitLobbyStateToClient(client, lobbyId, lobbyInfo.membres);

      // Notifie les amis du QUITTANT (lobby toujours vivant)
      await this.notifyFriendsLobbyChanged(joueurId, null);

    } catch {
      // 🔥 Lobby supprimé → prévenir tout le monde (room) et l'utilisateur
      this.rt.emitLobbyClosed(lobbyId);
      client.emit('lobby:closed', { lobbyId });

      // ✅ Notifie les amis de TOUS les ex-membres (y compris le créateur)
      if (membersBefore.length) {
        await this.notifyFriendsLobbyDeleted(membersBefore);
      } else {
        // au pire, notifie au moins les amis du quittant
        await this.notifyFriendsLobbyChanged(joueurId, null);
      }
    }

    client.leave(`lobby-${lobbyId}`);
    return result;
  }


  @SubscribeMessage('lobby:startGame')
  async handleStartGame(
    @ConnectedSocket() client: SocketWithUser,
    @MessageBody() data: { lobbyId: number; scoreMax?: number },
  ) {
    if (!client.user?.sub) return { error: 'unauthorized' };

    const joueurId = client.user.sub;
    const { lobbyId, scoreMax } = data;
    const result = await this.lobbyService.startGame(
      lobbyId,
      joueurId,
      scoreMax,
    );

    // notifier tout le monde et pousser l’URL de redirection
    this.rt.emitGameStarted(lobbyId, result.partie.id);

    return result;
  }

  @SubscribeMessage('friends:list')
  async friendsList(@ConnectedSocket() client: SocketWithUser) {
    if (client.user?.sub) this.rt.registerClient(client, client.user.sub);
    const list = await this.friends.listFriends(client.user!.sub);
    client.emit('friends:list', list);
  }

  @SubscribeMessage('presence:hello')
  hello(@ConnectedSocket() client: SocketWithUser) {
    if (client.user?.sub) this.rt.registerClient(client, client.user.sub);
    return { ok: true };
  }

  @SubscribeMessage('presence:snapshot')
  presenceSnapshot(@ConnectedSocket() client: SocketWithUser) {
    // Utilise RealtimeService pour récupérer les IDs des joueurs en ligne
    const onlineIds = this.rt.getOnlineJoueurs(); // number[]
    // On renvoie uniquement à CE client
    client.emit('presence:snapshot', { online: onlineIds });
    return { ok: true, count: onlineIds.length };
  }
  @SubscribeMessage('lobby:invite')
  async lobbyInvite(
    @ConnectedSocket() client: SocketWithUser,
    @MessageBody() data: { lobbyId: number; toId: number },
  ) {
    if (!client.user?.sub) return { error: 'unauthorized' };

    const inv = await this.lobbyService.invite(data.lobbyId, client.user.sub, data.toId);
    // notifie le destinataire
    this.rt.emitToJoueur(inv.toId, 'lobby:invited', {
      lobbyId: inv.lobbyId,
      fromId: client.user.sub,
      fromUsername: client.user.username ?? `J${client.user.sub}`,
    });
    return { ok: true };
  }

  @SubscribeMessage('lobby:acceptInvite')
  async lobbyAcceptInvite(
    @ConnectedSocket() client: SocketWithUser,
    @MessageBody() data: { lobbyId: number },
  ) {
    if (!client.user?.sub) return { error: 'unauthorized' };

    const res = await this.lobbyService.acceptInvite(data.lobbyId, client.user.sub);
    // tu peux renvoyer un état au demandeur si tu veux
    client.emit('lobby:joined', { lobbyId: data.lobbyId });
    // broadcast état
    this.rt.emitLobbyEvent(data.lobbyId, 'join', client.user.username ?? `J${client.user.sub}`);
    const members = await this.lobbyService.listMembers(data.lobbyId);
    const light = await this.lobbyService.getLobbyLight(data.lobbyId);
    this.rt.emitLobbyState(data.lobbyId, members.membres, light?.nom ?? undefined)
    this.rt.emitLobbyState(data.lobbyId, members.membres);
    await this.notifyFriendsLobbyChanged(client.user.sub, data.lobbyId)
    return res;
  }
  @SubscribeMessage('lobby:rehydrate')
  async lobbyRehydrate(@ConnectedSocket() client: SocketWithUser) {
    if (!client.user?.sub) return { ok: false, reason: 'unauthorized' };

    const lobby = await this.lobbyService.findCurrentLobbyFor(client.user.sub);
    if (!lobby) return { ok: true, lobbyId: null };

    client.join(`lobby-${lobby.id}`);
    this.rt.registerClient(client, client.user.sub); // idempotent
    const info = await this.lobbyService.listMembers(lobby.id);
    this.rt.emitLobbyStateToClient(client, lobby.id, info.membres);
    client.emit('lobby:joined', { lobbyId: lobby.id });
    return { ok: true, lobbyId: lobby.id };
  }
  private async notifyFriendsLobbyChanged(userId: number, inLobbyId: number | null) {
    const friendIds = await this.friends.getFriendIds(userId);

    let inLobbyName: string | null = null;
    if (inLobbyId != null) {
      const lobby = await this.lobbyService.getLobbyLight(inLobbyId); // helper ci-dessous
      inLobbyName = lobby?.nom ?? null;
    }

    for (const fid of friendIds) {
      this.rt.emitToJoueur(fid, 'presence:lobbyChanged', { userId, inLobbyId, inLobbyName });
    }
  }
  @SubscribeMessage('lobby:attach')
  async lobbyAttach(
    @ConnectedSocket() client: SocketWithUser,
    @MessageBody() data?: { lobbyId?: number },
  ) {
    if (!client.user?.sub) return { ok: false, reason: 'unauthorized' };
    const userId = client.user.sub;

    // 1) Déterminer le lobby à attacher
    let lobbyId = data?.lobbyId; // number | undefined
    if (lobbyId == null) {
      const found = await this.lobbyService.findCurrentLobbyFor(userId);
      lobbyId = found?.id; // number | undefined
    }

    // 2) Aucun lobby courant → nettoyer l'UI
    if (lobbyId == null) {
      client.emit('lobby:closed', { lobbyId: null });
      return { ok: true, lobbyId: null };
    }

    // 3) Sécurité: vérifier l'appartenance
    const isMember = await this.lobbyService.isMemberOfLobby(lobbyId, userId);
    if (!isMember) return { ok: false, reason: 'not-member', lobbyId };

    // 4) Attacher le socket à la room (sans logique métier join)
    client.join(`lobby-${lobbyId}`);
    this.rt.registerClient(client, userId); // idempotent

    // 5) État complet au seul client
    const info = await this.lobbyService.listMembers(lobbyId);
    const light = await this.lobbyService.getLobbyLight(lobbyId);
    this.rt.emitLobbyStateToClient(client, lobbyId, info.membres, light?.nom ?? undefined);

    // 6) Informer l'UI locale et log
    client.emit('lobby:joined', { lobbyId });
    console.log('[WS][lobby:attach] user=%d attached to lobby=%d (members=%d)',
      userId, lobbyId, info.membres?.length ?? 0);

    return { ok: true, lobbyId };
  }

  private async notifyFriendsLobbyDeleted(memberIds: number[]) {
    for (const uid of memberIds) {
      await this.notifyFriendsLobbyChanged(uid, null);
    }
  }
}
