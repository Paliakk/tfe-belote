import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from './jwt-auth.guard';
import { EnsureJoueurGuard } from './ensure-joueur.guard';
import { CurrentJoueurId } from './current-user.decorator';
import { PrismaService } from 'src/prisma/prisma.service';

@Controller('auth')
export class AuthController {
  constructor(private readonly prisma: PrismaService) {}

  @UseGuards(JwtAuthGuard, EnsureJoueurGuard)
  @Get('me')
  async me(@CurrentJoueurId() joueurId: number) {
    const j = await this.prisma.joueur.findUnique({
      where: { id: joueurId },
      select: { id: true, username: true, email: true, displayName: true, avatarUrl: true }
    });
    return j;
  }
}
