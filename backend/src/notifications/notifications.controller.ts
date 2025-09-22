// src/notifications/notifications.controller.ts
import { Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';

@UseGuards(JwtAuthGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) { }

  @Get()
  async getNotifications(@CurrentUser() user: any) {
    return this.notificationsService.getJoueurNotifications(user.sub);
  }

  @Get('unread-count')
  async getUnreadCount(@CurrentUser() user: any) {
    return this.notificationsService.getUnreadCount(user.sub);
  }

  @Post(':id/read')
  async markAsRead(@CurrentUser() user: any, @Param('id') id: string) {
    return this.notificationsService.markAsRead(parseInt(id), user.sub);
  }

  @Post('read-all')
  async markAllAsRead(@CurrentUser() user: any) {
    return this.notificationsService.markAllAsRead(user.sub);
  }
}