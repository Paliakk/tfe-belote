// src/friends/friends.service.ts
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { RealtimeService } from 'src/realtime/realtime.service';
import { AuthUserMapService } from 'src/auth/auth-user-map.service';
import { NotificationsService } from 'src/notifications/notifications.service';
import { NotificationType } from '@prisma/client';

@Injectable()
export class FriendsService {
  constructor(
    private prisma: PrismaService,
    private rt: RealtimeService,
    private map: AuthUserMapService,
    private notificationsService: NotificationsService
  ) { }

  // ---------- API "ForUser" (prend req.user) ----------
  async listForUser(principal: any) {
    const userId = await this.map.ensureJoueurId(principal);
    return this.listFriends(userId);
  }

  async listIncomingRequestsForUser(principal: any) {
    const userId = await this.map.ensureJoueurId(principal);
    return this.listIncomingRequests(userId);
  }

  async listOutgoingRequestsForUser(principal: any) {
    const userId = await this.map.ensureJoueurId(principal);
    return this.listOutgoingRequests(userId);
  }

  async sendRequestForUser(principal: any, toUsername: string) {
    const fromId = await this.map.ensureJoueurId(principal);
    return this.sendRequest(fromId, toUsername);
  }

  async acceptRequestForUser(principal: any, requestId: number) {
    const userId = await this.map.ensureJoueurId(principal);
    return this.acceptRequest(userId, requestId);
  }

  // ---------- Cœur métier ----------
  async sendRequest(fromId: number, toUsername: string) {
    const [from, to] = await Promise.all([
      this.prisma.joueur.findUnique({ where: { id: fromId }, select: { id: true, username: true } }),
      this.prisma.joueur.findUnique({ where: { username: toUsername }, select: { id: true, username: true } }),
    ]);
    if (!from || !to) throw new NotFoundException('user_not_found');
    if (from.id === to.id) throw new BadRequestException('invalid_target');

    // 1) déjà amis ?
    const a = Math.min(from.id, to.id);
    const b = Math.max(from.id, to.id);
    const existingFriendship = await this.prisma.friendship.findFirst({
      where: { OR: [{ aId: a, bId: b }, { aId: b, bId: a }] },
      select: { id: true },
    });
    if (existingFriendship) {
      // inutile d’envoyer une nouvelle demande
      return { ok: true, alreadyFriends: true };
    }

    // 2) demande pending existante dans un sens ou l’autre ?
    const existingPending = await this.prisma.friendRequest.findFirst({
      where: {
        status: 'pending',
        OR: [
          { fromId: from.id, toId: to.id },
          { fromId: to.id, toId: from.id },
        ],
      },
      select: { id: true, fromId: true, toId: true },
    });
    if (existingPending) {
      return { ok: true, alreadyPending: true, requestId: existingPending.id };
    }

    // 3) crée la demande
    const req = await this.prisma.friendRequest.create({
      data: { fromId: from.id, toId: to.id, status: 'pending' },
      select: { id: true, fromId: true, toId: true, createdAt: true },
    });

    // 4) notification persistante + push temps réel
    await this.notificationsService.createNotification(
      NotificationType.FRIEND_REQUEST,
      from.id,
      to.id,
      `${from.username} souhaite vous ajouter en ami`,
      { requestId: req.id, fromId: from.id, fromUsername: from.username },
    );

    // (optionnel) petit event court legacy
    this.rt.emitToJoueur(to.id, 'friend:request', {
      requestId: req.id, fromId: from.id, fromUsername: from.username,
    });

    return { ok: true, requestId: req.id };
  }


  async acceptRequest(requestId: number, accepterId: number) {
    const req = await this.prisma.friendRequest.findUnique({
      where: { id: requestId },
      select: { id: true, fromId: true, toId: true, status: true },
    });
    if (!req || req.toId !== accepterId) throw new NotFoundException('request_not_found');

    // 1) Créer l’amitié (ordre canonique a<=b)
    await this.prisma.friendship.create({
      data: { aId: Math.min(req.fromId, req.toId), bId: Math.max(req.fromId, req.toId) },
    });

    // 2) Supprimer la demande (⚠️ évite le conflit d'unicité (fromId,toId,status))
    await this.prisma.friendRequest.delete({ where: { id: req.id } });

    // 3) Marquer la notif liée comme lue (si vous stockez requestId dans data)
    await this.notificationsService.markFriendRequestAsRead(accepterId, req.id);

    // 4) Pousser la MAJ aux deux côtés (le front fait loadFriends() sur friends:changed)
    this.rt.emitToJoueur(req.fromId, 'friend:accepted', { userId: req.toId });
    this.rt.emitToJoueur(req.toId, 'friend:accepted', { userId: req.fromId });
    this.notifyFriendsChanged([req.fromId, req.toId], 'accepted', {
      otherId: req.fromId === accepterId ? req.toId : req.fromId
    });

    // 5) (optionnel) notif “accepté”
    await this.notificationsService.createNotification(
      NotificationType.FRIEND_ACCEPTED,
      req.toId,       // senderId (l'accepteur)
      req.fromId,     // receiverId (l’émetteur initial)
      `Votre demande d'ami a été acceptée`,
      { requestId: req.id, accepterId }
    );

    return { ok: true };
  }

  async listFriends(joueurId: number) {
    const friendIds = await this.getFriendIds(joueurId);
    if (!friendIds.length) return [];

    // profils de base
    const users = await this.prisma.joueur.findMany({
      where: { id: { in: friendIds } },
      select: { id: true, username: true },
      orderBy: { username: 'asc' },
    });

    // lobby courant pour chacun
    const memberships = await this.prisma.lobbyJoueur.findMany({
      where: { joueurId: { in: friendIds } },
      select: {
        joueurId: true,
        lobby: { select: { id: true, nom: true } },
      },
    });

    const lobbyByUser = new Map<number, { id: number; nom: string }>();
    for (const m of memberships) {
      if (m.lobby) lobbyByUser.set(m.joueurId, { id: m.lobby.id, nom: m.lobby.nom });
    }

    return users.map(u => {
      const l = lobbyByUser.get(u.id);
      return {
        id: u.id,
        username: u.username,
        inLobbyId: l?.id ?? null,
        inLobbyName: l?.nom ?? null,
      };
    });
  }

  async listIncomingRequests(userId: number) {
    const rows = await this.prisma.friendRequest.findMany({
      where: { toId: userId, status: 'pending' },
      orderBy: { createdAt: 'desc' },
      include: { from: { select: { id: true, username: true } } },
    });
    return rows.map(r => ({ id: r.id, from: r.from, createdAt: r.createdAt }));
  }

  async listOutgoingRequests(userId: number) {
    const rows = await this.prisma.friendRequest.findMany({
      where: { fromId: userId, status: 'pending' },
      orderBy: { createdAt: 'desc' },
      include: { to: { select: { id: true, username: true } } },
    });
    return rows.map(r => ({ id: r.id, to: r.to, createdAt: r.createdAt }));
  }

  async areFriends(a: number, b: number) {
    const [x, y] = a < b ? [a, b] : [b, a];
    const row = await this.prisma.friendship.findUnique({ where: { aId_bId: { aId: x, bId: y } } });
    return !!row;
  }

  private async username(id: number): Promise<string> {
    try {
      const u = await this.prisma.joueur.findUnique({
        where: { id },
        select: { username: true }
      });
      return u?.username ?? `J${id}`;
    } catch (error) {
      console.error(`Erreur lors de la récupération du username pour l'id ${id}:`, error);
      return `J${id}`;
    }
  }
  async declineRequest(requestId: number, declinerId: number) {
    const req = await this.prisma.friendRequest.findUnique({
      where: { id: requestId },
      select: { id: true, fromId: true, toId: true, status: true },
    });
    if (!req || req.toId !== declinerId) throw new NotFoundException('request_not_found');

    // Supprimer (évite l’accumulation d’états et tout risque P2002)
    await this.prisma.friendRequest.delete({ where: { id: req.id } });

    // Marquer la notif “demande d’ami” comme lue côté déclineur
    await this.notificationsService.markFriendRequestAsRead(declinerId, req.id);

    // Informer le demandeur (optionnel)
    this.rt.emitToJoueur(req.fromId, 'friend:rejected', { userId: req.toId });

    // Vous pouvez aussi émettre friends:changed si votre UI en dépend
    this.notifyFriendsChanged([req.fromId, req.toId], 'rejected', { otherId: req.fromId });

    return { ok: true };
  }
  async getFriendIds(joueurId: number): Promise<number[]> {
    const rows = await this.prisma.friendship.findMany({
      where: { OR: [{ aId: joueurId }, { bId: joueurId }] },
      select: { aId: true, bId: true },
    });
    return rows.map(r => (r.aId === joueurId ? r.bId : r.aId));
  }
  async unfriend(userId: number, friendId: number) {
    if (userId === friendId) throw new NotFoundException('invalid_target');

    const a = Math.min(userId, friendId);
    const b = Math.max(userId, friendId);

    // supprime l’amitié + éventuelles requêtes en attente dans les 2 sens
    await this.prisma.$transaction([
      this.prisma.friendship.deleteMany({ where: { aId: a, bId: b } }),
      this.prisma.friendRequest.deleteMany({
        where: {
          status: 'pending',
          OR: [
            { fromId: userId, toId: friendId },
            { fromId: friendId, toId: userId },
          ],
        },
      }),
    ]);


    this.notifyFriendsChanged([userId, friendId], 'removed', { otherId: userId === friendId ? undefined : userId });
    return { ok: true }
  }

  private notifyFriendsChanged(userIds: number[], reason: string, data: any = {}) {
    for (const uid of userIds) {
      this.rt.emitToJoueur(uid, 'friends:changed', { reason, ...data });
    }
  }
}