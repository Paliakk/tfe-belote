import { Module } from '@nestjs/common';
import { BiddingService } from './bidding.service';
import { PrismaModule } from '../prisma/prisma.module';
import { MancheModule } from 'src/manche/manche.module';
import { PartieGuard } from 'src/common/guards/partie.guard';
import { UsersModule } from 'src/users/users.module';
import { GameModule } from 'src/game/game.module';
import { PlayModule } from 'src/play/play.module';

@Module({
  imports: [PrismaModule, MancheModule, UsersModule,GameModule,PlayModule],
  controllers: [],
  providers: [BiddingService, PartieGuard],
  exports: [BiddingService],
})
export class BiddingModule {}
