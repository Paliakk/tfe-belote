import { BadRequestException, Body, Controller, Get, Param, ParseIntPipe, Post, Query, Req, UseGuards } from '@nestjs/common';
import { PlayService } from './play.service';
import { RulesService } from './rules.service';
import { PlayQueriesService } from './play.queries';
import { TrickService } from './trick.service';
import { EnsureJoueurGuard } from 'src/auth/ensure-joueur.guard';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';
import { CurrentJoueurId } from 'src/auth/current-user.decorator';

@UseGuards(JwtAuthGuard, EnsureJoueurGuard)
@Controller('play')
export class PlayController {
    constructor(
        private readonly play: PlayService,
        private readonly rules: RulesService,
        private readonly queries: PlayQueriesService,
        private readonly trick: TrickService
    ) { }

    /** UC07 — jouer une carte */
    @Post(':mancheId/play')
    async playCard(
        @Param('mancheId', ParseIntPipe) mancheId: number,
        @CurrentJoueurId() joueurId: number,
        @Body() body: { carteId: number },
        
    ) {
        const { carteId } = body
        return this.play.playCard(mancheId, joueurId, carteId)
    }

    /** UC10 exposé (tests/UX) — cartes jouables */
    @Get(':mancheId/playable')
    async playable(
        @Param('mancheId', ParseIntPipe) mancheId: number,
        @CurrentJoueurId() joueurId: number,
    ) {
        return this.queries.getPlayable(mancheId, joueurId)
    }

    /** Main du joueur */
    @Get(':mancheId/hand')
    async hand(
        @Param('mancheId', ParseIntPipe) mancheId: number,
        @CurrentJoueurId() joueurId: number
    ) {
        return this.queries.getHand(mancheId, joueurId)
    }

    /** Pli actif (état du pli en cours) */
    @Get('active-trick/:mancheId')
    async activeTrick(@Param('mancheId', ParseIntPipe) mancheId: number) {
        return this.queries.getActiveTrick(mancheId)
    }

    /** Manche active pour une partie (secours) */
    @Get('active/:partieId')
    async activeManche(@Param('partieId', ParseIntPipe) partieId: number) {
        return this.queries.getActiveManche(partieId)
    }

    // (option tests) Clôture manuelle d’un pli (si besoin hors auto)
    @Post(':mancheId/close-trick')
    async closeTrick(@Param('mancheId', ParseIntPipe) mancheId: number) {
        return this.trick.closeCurrentTrick(mancheId);
    }

    // Pli précédent (historique court)
    @Get('previous-trick/:mancheId')
    async previousTrick(@Param('mancheId', ParseIntPipe) mancheId: number) {
        return this.trick.previousTrick(mancheId);
    }

    // Score live
    @Get('score-live/:mancheId')
    async scoreLive(@Param('mancheId', ParseIntPipe) mancheId: number) {
        return this.trick.scoreLive(mancheId);
    }
}
