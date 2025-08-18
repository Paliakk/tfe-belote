import { Module } from '@nestjs/common';
import { PlayService } from './play.service';
import { PlayController } from './play.controller';
import { RulesService } from './rules.service';
import { PrismaModule } from 'src/prisma/prisma.module';
import { PlayQueriesService } from './play.queries';
import { TrickService } from './trick.service';
import { MancheModule } from 'src/manche/manche.module';
import { PartieGuard } from 'src/common/partie.guard';

@Module({
  providers: [PlayService, RulesService, PlayQueriesService,TrickService, PartieGuard],
  controllers: [PlayController],
  imports: [PrismaModule,MancheModule],
  exports: [PlayService, RulesService, PlayQueriesService,TrickService]
})
export class PlayModule { }
