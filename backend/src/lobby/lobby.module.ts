import { Module } from '@nestjs/common';
import { LobbyController } from './lobby.controller';
import { LobbyService } from './lobby.service';
import { LobbyGateway } from './lobby.gateway';
import { RealtimeService } from 'src/realtime/realtime.service';

@Module({
  controllers: [LobbyController],
  providers: [LobbyService,LobbyGateway,RealtimeService],
})
export class LobbyModule {}
