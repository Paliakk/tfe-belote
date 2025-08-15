import { Body, Controller, Get, Param, ParseIntPipe, Post, Query } from '@nestjs/common';
import { PlayService } from './play.service';
import { RulesService } from './rules.service';
import { PlayQueriesService } from './play.queries';

@Controller('play')
export class PlayController {
    constructor(private readonly play: PlayService, private readonly rules: RulesService, private readonly queries: PlayQueriesService,) { }
    /** UC07 — jouer une carte */
    @Post(':mancheId/play')
    async playCard(
        @Param('mancheId', ParseIntPipe) mancheId: number,
        @Body() body: { joueurId: number; carteId: number }
    ) {
        const { joueurId, carteId } = body;
        return this.play.playCard(mancheId, joueurId, carteId)
    }

    /** UC10 exposé (tests/UX) — cartes jouables */
    @Get(':mancheId/playable')
    async playable(
        @Param('mancheId', ParseIntPipe) mancheId: number,
        @Query('joueurId', ParseIntPipe) joueurId: number,
    ) {
        return this.queries.getPlayable(mancheId, joueurId)
    }

    /** Main du joueur */
    @Get(':mancheId/hand')
    async hand(
        @Param('mancheId', ParseIntPipe) mancheId: number,
        @Query('joueurId', ParseIntPipe) joueurId: number
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

}
