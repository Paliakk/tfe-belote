import { Module } from '@nestjs/common';
import { GameController } from './game.controller';
import { GameService } from './game.service';
import { PrismaModule } from 'src/prisma/prisma.module';
import { AuthModule } from 'src/auth/auth.module';
import { GameGateway } from 'src/gateway/game.gateway';
import { LobbyModule } from 'src/lobby/lobby.module';
import { BiddingModule } from 'src/bidding/bidding.module';
import { RealtimeModule } from 'src/realtime/realtime.module';

@Module({
  controllers: [GameController],
  providers: [GameService],
  imports:[PrismaModule,AuthModule,LobbyModule,BiddingModule,RealtimeModule],
  exports:[GameService]
})
export class GameModule {}
