import { Module } from '@nestjs/common';
import { MancheService } from './manche.service';
import { PrismaModule } from 'src/prisma/prisma.module';
import { ScoreModule } from 'src/score/score.module';
import { PartieGuard } from 'src/common/guards/partie.guard';
import { UsersModule } from 'src/users/users.module';

@Module({
  providers: [MancheService, PartieGuard],
  controllers: [],
  imports: [PrismaModule, ScoreModule, UsersModule],
  exports: [MancheService],
})
export class MancheModule {}
