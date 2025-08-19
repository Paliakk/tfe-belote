import { Module } from '@nestjs/common';
import { BiddingService } from './bidding.service';
import { BiddingController } from './bidding.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { MancheModule } from 'src/manche/manche.module';
import { PartieGuard } from 'src/common/partie.guard';
import { BiddingGateway } from './bidding.gateway';
import { RealtimeService } from 'src/realtime/realtime.service';

@Module({
  imports: [PrismaModule,MancheModule],
  controllers: [BiddingController],
  providers: [BiddingService,PartieGuard,BiddingGateway,RealtimeService],
})
export class BiddingModule {}
