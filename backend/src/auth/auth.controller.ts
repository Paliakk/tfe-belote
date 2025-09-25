import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from './jwt-auth.guard';
import { EnsureJoueurGuard } from './ensure-joueur.guard';
import { CurrentJoueurId } from './current-user.decorator';
import { PrismaService } from 'src/prisma/prisma.service';

@UseGuards(JwtAuthGuard, EnsureJoueurGuard)
@Controller('auth')
export class AuthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('me')
  me(@Req() req: any) {
    // req.user.sub = joueurId (comme pour tes gateways)
    return { id: req.user?.sub, username: req.user?.username ?? null };
  }
}
