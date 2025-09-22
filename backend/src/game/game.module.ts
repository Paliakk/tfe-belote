import { Module } from '@nestjs/common';
import { GameService } from './game.service';
import { PrismaModule } from 'src/prisma/prisma.module';
import { AuthModule } from 'src/auth/auth.module';
import { LobbyModule } from 'src/lobby/lobby.module';
import { BiddingModule } from 'src/bidding/bidding.module';
import { RealtimeModule } from 'src/realtime/realtime.module';

@Module({
  controllers: [],
  providers: [GameService],
  imports: [
    PrismaModule,
    AuthModule,
    LobbyModule,
    RealtimeModule,
  ],
  exports: [GameService],
})
export class GameModule {}
