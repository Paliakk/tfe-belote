import { Module } from '@nestjs/common';
import { PlayService } from './play.service';
import { PlayController } from './play.controller';
import { RulesService } from './rules.service';
import { PrismaModule } from 'src/prisma/prisma.module';
import { PlayQueriesService } from './play.queries';
import { TrickService } from './trick.service';

@Module({
  providers: [PlayService, RulesService, PlayQueriesService,TrickService],
  controllers: [PlayController],
  imports: [PrismaModule],
  exports: [PlayService, RulesService, PlayQueriesService,TrickService]
})
export class PlayModule { }
