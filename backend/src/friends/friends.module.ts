import { Module } from '@nestjs/common';
import { FriendsService } from './friends.service';
import { FriendsController } from './friends.controller';
import { PrismaModule } from 'src/prisma/prisma.module';
import { RealtimeModule } from 'src/realtime/realtime.module';
import { PrismaService } from 'src/prisma/prisma.service';
import { NotificationsModule } from 'src/notifications/notifications.module';

@Module({
  imports: [PrismaModule, RealtimeModule,NotificationsModule],
  providers: [FriendsService, PrismaService],
  controllers: [FriendsController],
  exports: [FriendsService],
})
export class FriendsModule {}
