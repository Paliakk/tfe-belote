import { Module } from '@nestjs/common';
import { PlayService } from './play.service';
import { PlayController } from './play.controller';
import { RulesService } from './rules.service';
import { PrismaModule } from 'src/prisma/prisma.module';
import { PlayQueriesService } from './play.queries';

@Module({
  providers: [PlayService, RulesService, PlayQueriesService],
  controllers: [PlayController],
  imports: [PrismaModule],
  exports: [PlayService, RulesService, PlayQueriesService]
})
export class PlayModule { }
