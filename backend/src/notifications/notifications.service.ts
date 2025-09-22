// src/notifications/notifications.service.ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeService } from '../realtime/realtime.service';
import { UsersService } from '../users/users.service';
import { NotificationType } from '@prisma/client';

@Injectable()
export class NotificationsService {
  constructor(
    private prisma: PrismaService,
    private rt: RealtimeService,
    private usersService: UsersService
  ) { }

  private async resolveUserId(identity: string | number): Promise<number> {
    if (typeof identity === 'number') return identity;
    const u = await this.usersService.findByAuth0Sub(identity);
    if (!u) throw new Error('user_not_found');
    return u.id;
  }


  async createNotification(
    type: NotificationType,
    sender: string | number,
    receiver: string | number,
    message: string,
    data?: any,
  ) {
    const [senderId, receiverId] = await Promise.all([
      this.resolveUserId(sender),
      this.resolveUserId(receiver),
    ]);

    const notification = await this.prisma.notification.create({
      data: {
        type,
        senderId,
        receiverId,
        message,
        data: { ...data, type },
        read: false,
      },
      include: {
        sender: { select: { id: true, username: true, avatarUrl: true } },
      },
    });

    if (this.rt.isOnline(receiverId)) {
      this.rt.emitToJoueur(receiverId, 'notification:new', notification);
    }
    return notification;
  }

  async getJoueurNotifications(identity: string | number) {
    const userId = await this.resolveUserId(identity);

    return this.prisma.notification.findMany({
      where: { receiverId: userId },
      orderBy: { createdAt: 'desc' },
      include: {
        sender: { select: { id: true, username: true, avatarUrl: true } },
      },
    });
  }

  async markAsRead(notificationId: number, identity: string | number) {
    const userId = await this.resolveUserId(identity);

    const notification = await this.prisma.notification.findFirst({
      where: { id: notificationId, receiverId: userId },
    });
    if (!notification) throw new Error('Notification non trouvée');

    return this.prisma.notification.update({
      where: { id: notificationId },
      data: { read: true },
    });
  }

  async markAllAsRead(identity: string | number) {
    const userId = await this.resolveUserId(identity);

    return this.prisma.notification.updateMany({
      where: { receiverId: userId, read: false },
      data: { read: true },
    });
  }

  async getUnreadCount(identity: string | number) {
    const userId = await this.resolveUserId(identity);

    return this.prisma.notification.count({
      where: { receiverId: userId, read: false },
    });
  }
  async markFriendRequestAsRead(receiverId: number, requestId: number) {
    // Supporte requestId stocké en number ou en string dans le JSON
    const res = await this.prisma.notification.updateMany({
      where: {
        receiverId,
        type: NotificationType.FRIEND_REQUEST,
        OR: [
          { data: { path: ['requestId'], equals: requestId } },
          { data: { path: ['requestId'], equals: String(requestId) } },
        ],
      },
      data: { read: true },
    });

    // pousse un petit event pour mettre à jour le panneau côté client
    if (res.count > 0) {
      this.rt.emitToJoueur(receiverId, 'notification:read', { requestId });
    }
    return res.count;
  }
}