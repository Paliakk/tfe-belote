import { Module } from '@nestjs/common';
import { LobbyController } from './lobby.controller';
import { LobbyService } from './lobby.service';
import { LobbyGateway } from 'src/gateway/lobby.gateway';
import { PrismaService } from 'src/prisma/prisma.service';
import { RealtimeService } from 'src/realtime/realtime.service';
import { AuthModule } from 'src/auth/auth.module';
import { PrismaModule } from 'src/prisma/prisma.module';
import { RealtimeModule } from 'src/realtime/realtime.module';
import { UsersModule } from 'src/users/users.module';

@Module({
  controllers: [LobbyController],
  providers: [LobbyService,PrismaService,RealtimeService,AuthModule],
  imports:[PrismaModule,RealtimeModule,AuthModule,UsersModule],
  exports:[LobbyService]
})
export class LobbyModule {}
