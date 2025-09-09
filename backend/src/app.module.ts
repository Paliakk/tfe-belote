import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { LobbyModule } from './lobby/lobby.module';
import { BiddingModule } from './bidding/bidding.module';
import { MancheModule } from './manche/manche.module';
import { PlayModule } from './play/play.module';
import { ScoreModule } from './score/score.module';
import { AuthService } from './auth/auth.service';
import { AuthModule } from './auth/auth.module';
import { RealtimeModule } from './realtime/realtime.module';
import { GatewayModule } from './ws/ws.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    LobbyModule,
    BiddingModule,
    MancheModule,
    PlayModule,
    ScoreModule,
    AuthModule,
    RealtimeModule,
    GatewayModule,
    UsersModule,
  ],
  controllers: [AppController],
  providers: [AppService, AuthService],
})
export class AppModule {}
