import { Module } from '@nestjs/common';
import { PlayService } from './play.service';
import { PlayController } from './play.controller';
import { RulesService } from './rules.service';
import { PrismaModule } from 'src/prisma/prisma.module';
import { PlayQueriesService } from './play.queries';
import { TrickService } from './trick.service';
import { MancheModule } from 'src/manche/manche.module';
import { PartieGuard } from 'src/common/partie.guard';
import { PlayGateway } from './play.gateway';
import { JwtModule } from '@nestjs/jwt';
import { RealtimeService } from 'src/realtime/realtime.service';

@Module({
  providers: [PlayService, RulesService, PlayQueriesService,TrickService, PartieGuard,PlayGateway,RealtimeService],
  controllers: [PlayController],
  imports: [PrismaModule,MancheModule,JwtModule.register({})],
  exports: [PlayService, RulesService, PlayQueriesService,TrickService]
})
export class PlayModule { }
