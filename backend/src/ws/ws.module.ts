import { Module } from '@nestjs/common';
import { BiddingGateway } from './bidding.gateway';
import { GameGateway } from './game.gateway';
import { LobbyGateway } from './lobby.gateway';
import { AuthModule } from 'src/auth/auth.module';
import { PrismaModule } from 'src/prisma/prisma.module';
import { RealtimeModule } from 'src/realtime/realtime.module';
import { BiddingModule } from 'src/bidding/bidding.module';
import { LobbyModule } from 'src/lobby/lobby.module';
import { PlayGateway } from './play.gateway';
import { PlayModule } from 'src/play/play.module';
import { UsersModule } from 'src/users/users.module';
import { GameModule } from 'src/game/game.module';
import { FriendsModule } from 'src/friends/friends.module';
import { PresenceGateway } from './presence.gateways';

@Module({
  imports: [
    AuthModule,
    PrismaModule,
    RealtimeModule,
    BiddingModule,
    LobbyModule,
    PlayModule,
    UsersModule,
    GameModule,
    FriendsModule
  ],
  providers: [GameGateway, BiddingGateway, LobbyGateway, PlayGateway,FriendsModule,PresenceGateway],
  exports: [GameGateway, BiddingGateway, LobbyGateway, PlayGateway,PresenceGateway],
})
export class GatewayModule {}
