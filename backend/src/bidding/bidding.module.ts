import { Module } from '@nestjs/common';
import { BiddingService } from './bidding.service';
import { BiddingController } from './bidding.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { MancheModule } from 'src/manche/manche.module';

@Module({
  imports: [PrismaModule,MancheModule],
  controllers: [BiddingController],
  providers: [BiddingService],
})
export class BiddingModule {}
