import { Module } from '@nestjs/common';
import { BiddingService } from './bidding.service';
import { BiddingController } from './bidding.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { MancheModule } from 'src/manche/manche.module';
import { PartieGuard } from 'src/common/partie.guard';
import { UsersModule } from 'src/users/users.module';

@Module({
  imports: [PrismaModule,MancheModule,UsersModule],
  controllers: [BiddingController],
  providers: [BiddingService,PartieGuard],
  exports:[BiddingService]
})
export class BiddingModule {}
