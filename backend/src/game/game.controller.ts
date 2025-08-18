import { Controller, Body, Param, ParseIntPipe, Post, UseGuards } from '@nestjs/common';
import { GameService } from './game.service';
import { EnsureJoueurGuard } from 'src/auth/ensure-joueur.guard';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';
import { CurrentJoueurId } from 'src/auth/current-user.decorator';

@UseGuards(JwtAuthGuard, EnsureJoueurGuard)
@Controller('game')
export class GameController {
    constructor(private readonly gameService: GameService) { }
    @Post(':id/quit')
    quitGame(
        @Param('id', ParseIntPipe) partieId: number,
        @CurrentJoueurId() joueurId: number,
    ) {
        return this.gameService.quitGame(partieId, joueurId)
    }
}
