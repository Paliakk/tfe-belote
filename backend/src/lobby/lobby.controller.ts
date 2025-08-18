import { Body, Controller, Get, Param, ParseIntPipe, Post, Req, UseGuards, UsePipes, ValidationPipe } from '@nestjs/common';
import { LobbyService } from './lobby.service';
import { CreateLobbyDto } from './dto/creat-lobby.dto';
import { create } from 'domain';
import { JoinLobbyDto } from './dto/join-lobby.dto';
import { StartGameDto } from './dto/start-game.dto';
import { EnsureJoueurGuard } from 'src/auth/ensure-joueur.guard';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';

@UseGuards(JwtAuthGuard, EnsureJoueurGuard)
@Controller('lobby')
export class LobbyController {
    constructor(private readonly lobbyService: LobbyService) { }

    /** Créer un lobby — le createurId vient du token */
    @Post()
    @UsePipes(new ValidationPipe({ whitelist: true }))
    async createLobby(@Body() dto: CreateLobbyDto, @Req() req: any) {
        const createurId = req.user.joueurId as number
        const lobby = await this.lobbyService.create(dto, createurId)

        // mdp non renvoyé même si présent
        return {
            id: lobby.id,
            nom: lobby.nom,
            statut: lobby.statut,
            estPrive: Boolean(lobby.password),
            createurId: lobby.createurId,
            createdAt: lobby.createdAt,
            partieId: lobby.partieId ?? null,
        }
    }
    @Get(':id')
    async getLobby(@Param('id', ParseIntPipe) id: number) {
        const lobby = await this.lobbyService.findByIdOrThrow(id)

        //Mapping de la réponse pour ne pas renvoyer le mdp
        return {
            id: lobby.id,
            nom: lobby.nom,
            statut: lobby.statut,
            estPrive: Boolean(lobby.password),
            createdAt: lobby.createdAt,

            createur: lobby.createur
                ? { id: lobby.createur.id, username: lobby.createur.username }
                : null,

            partie: lobby.partie
                ? {
                    id: lobby.partie.id,
                    statut: lobby.partie.statut,
                    scoreMax: lobby.partie.scoreMax,
                    nombreJoueurs: lobby.partie.nombreJoueurs,
                }
                : null,
        }
    }
    //UC04 - rejoindre un lobby
    @Post('join')
    @UsePipes(new ValidationPipe({ whitelist: true }))
    async joinLobby(@Body() dto: JoinLobbyDto, @Req() req: any) {
        const joueurId = req.user.joueurId as number
        return this.lobbyService.join(dto, joueurId);
    }
    //Liste des membres (pour le frontend)
    @Get(':id/members')
    async listMembers(@Param('id', ParseIntPipe) id: number) {
        return this.lobbyService.listMembers(id)
    }
    //UC04b - Quitter un lobby
    @Post(':id/leave')
    async leave(
        @Param('id', ParseIntPipe) lobbyId: number,
        @Req() req: any
    ) {
        const joueurId = req.user.joueurId as number
        return this.lobbyService.leave(lobbyId, joueurId)
    }

    //Lancement d'une partie
    @Post(':id/start')
    @UsePipes(new ValidationPipe({ whitelist: true }))
    startGame(
        @Param('id', ParseIntPipe) lobbyId: number,
        @Body() dto: StartGameDto,
        @Req() req: any
    ) {
        const createurId = req.user.joueurId as number
        return this.lobbyService.startGame(lobbyId,createurId, dto.scoreMax)
    }
}
