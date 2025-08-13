import { Module } from '@nestjs/common';
import { MancheService } from './manche.service';
import { MancheController } from './manche.controller';
import { PrismaModule } from 'src/prisma/prisma.module';

@Module({
  providers: [MancheService],
  controllers: [MancheController],
  imports:[PrismaModule],
  exports: [MancheService]
})
export class MancheModule {}
