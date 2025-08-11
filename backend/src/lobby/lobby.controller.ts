import { Body, Controller, Get, Param, ParseIntPipe, Post, UsePipes, ValidationPipe } from '@nestjs/common';
import { LobbyService } from './lobby.service';
import { CreateLobbyDto } from './dto/creat-lobby.dto';
import { create } from 'domain';
import { JoinLobbyDto } from './dto/join-lobby.dto';
import { LeaveLobbyDto } from './dto/leave-lobby.dto';

@Controller('lobby')
export class LobbyController {
    constructor(private readonly lobbyService: LobbyService) { }

    /**
     * Crée un nouveau lobby
     * Pour l'instant, l'Id du créateur est simulé (1)
     * Plus tard, il sera extrait du token Auth0
     */
    @Post()
    @UsePipes(new ValidationPipe({ whitelist: true }))
    async createLobby(@Body() dto: CreateLobbyDto) {
        const fakeCreateurId = 5; // --> Faudra remplacer ceci
        const lobby = await this.lobbyService.create(dto, fakeCreateurId)

        // mdp non renvoyé même si présent
        return {
            id: lobby.id,
            nom: lobby.nom,
            statut: lobby.statut,
            estPrive: Boolean(lobby.password),
            createurId: lobby.createurId,
            createdAt: lobby.createdAt,
            partieId: lobby.partieId ?? null,
            //Le createur peut être rajouté plus tard
        }
    }
    @Get(':id')
    async getLobby(@Param('id', ParseIntPipe) id: number) {
        const lobby = await this.lobbyService.findByIdOrThrow(id)

        //Mapping de la réponse pour ne pas renvoyer le mdp
        return {
            id: lobby.id,
            nom: lobby.nom,
            statu: lobby.statut,
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
    async joinLobby(@Body() dto: JoinLobbyDto) {
        return this.lobbyService.join(dto);
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
        @Body() dto: LeaveLobbyDto
    ) {
        return this.lobbyService.leave(lobbyId, dto.joueurId)
    }
}
