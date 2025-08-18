import { Module } from '@nestjs/common';
import { GameController } from './game.controller';
import { GameService } from './game.service';
import { PrismaModule } from 'src/prisma/prisma.module';
import { AuthModule } from 'src/auth/auth.module';

@Module({
  controllers: [GameController],
  providers: [GameService],
  imports:[PrismaModule,AuthModule]
})
export class GameModule {}
