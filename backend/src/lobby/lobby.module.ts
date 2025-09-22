import { Module } from '@nestjs/common';
import { LobbyService } from './lobby.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { RealtimeService } from 'src/realtime/realtime.service';
import { AuthModule } from 'src/auth/auth.module';
import { PrismaModule } from 'src/prisma/prisma.module';
import { RealtimeModule } from 'src/realtime/realtime.module';
import { UsersModule } from 'src/users/users.module';
import { FriendsModule } from 'src/friends/friends.module';

@Module({
  controllers: [],
  providers: [LobbyService, PrismaService, RealtimeService, AuthModule],
  imports: [PrismaModule, RealtimeModule, AuthModule, UsersModule, FriendsModule],
  exports: [LobbyService],
})
export class LobbyModule {}
