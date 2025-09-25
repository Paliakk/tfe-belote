import { Module } from '@nestjs/common';
import { PlayService } from './play.service';
import { RulesService } from './services/rules.service';
import { PrismaModule } from 'src/prisma/prisma.module';
import { PlayQueriesService } from './play.queries';
import { TrickService } from './services/trick.service';
import { MancheModule } from 'src/manche/manche.module';
import { PartieGuard } from 'src/common/guards/partie.guard';
import { GameModule } from 'src/game/game.module';

@Module({
  providers: [
    PlayService,
    RulesService,
    PlayQueriesService,
    TrickService,
    PartieGuard,
  ],
  controllers: [],
  imports: [PrismaModule, MancheModule,GameModule],
  exports: [PlayService, RulesService, PlayQueriesService, TrickService],
})
export class PlayModule {}
