// Dans src/realtime/realtime.controller.ts
import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { RealtimeService } from './realtime.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AuthGuard } from '@nestjs/passport';

@Controller('realtime')
@UseGuards(JwtAuthGuard)
export class RealtimeController {
  constructor(private readonly realtimeService: RealtimeService) {}

  @Get('online/:joueurId')
  isJoueurOnline(@Param('joueurId') joueurId: string) {
    return { online: this.realtimeService.isJoueurOnline(parseInt(joueurId)) };
  }

  @UseGuards(AuthGuard('jwt'))
  @Get('online-users')
  getOnlineUsers() {
    return { onlineJoueurs: this.realtimeService.getOnlineJoueurs() };
  }
}