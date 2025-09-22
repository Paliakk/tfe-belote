import { Module } from '@nestjs/common';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { PrismaModule } from 'src/prisma/prisma.module';
import { RealtimeModule } from 'src/realtime/realtime.module';
import { UsersModule } from 'src/users/users.module';

@Module({
  controllers: [NotificationsController],
  exports:[NotificationsService],
  imports:[PrismaModule,RealtimeModule,UsersModule],
  providers:[NotificationsService]
})
export class NotificationsModule {}
