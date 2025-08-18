import { Module } from '@nestjs/common';
import { MancheService } from './manche.service';
import { MancheController } from './manche.controller';
import { PrismaModule } from 'src/prisma/prisma.module';
import { ScoreModule } from 'src/score/score.module';

@Module({
  providers: [MancheService],
  controllers: [MancheController],
  imports:[PrismaModule,ScoreModule],
  exports: [MancheService]
})
export class MancheModule {}
