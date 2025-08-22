import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { LobbyService } from 'src/lobby/lobby.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { RealtimeService } from 'src/realtime/realtime.service';

@Injectable()
export class GameService {
    constructor(private readonly prisma: PrismaService,private readonly lobbyService:LobbyService,private readonly rt:RealtimeService) { }

    async quitGame(partieId: number, joueurId: number) {
        return this.prisma.$transaction(async (tx) => {
            //1. Vérifier que la partie existe et est en cours
            const partie = await tx.partie.findUnique({
                where: { id: partieId },
                include: { lobby: true, equipes: { include: { joueurs: true } } }
            })
            if (!partie) { throw new NotFoundException(`Partie ${partieId} introuvable`) }
            if (partie.statut !== 'en_cours') { throw new BadRequestException(`La partie ${partieId} n'est pas en cours`) }

            //2. Vérifier que le joueur fait partie de la partie
            const joueurPresent = partie.equipes.some(eq =>
                eq.joueurs.some(j => j.joueurId === joueurId)
            )
            if (!joueurPresent) { throw new BadRequestException(`Le joueur ${joueurId} ne participe pas à cette partie`) }

            //3. Marquer la partie comme abandonnée
            await tx.partie.update({
                where: { id: partieId },
                data: { statut: 'abandonnee' }
            })

            //4. Si un lobby est lié --> retour en attente et suppression du joueur qui quitte
            if (partie.lobby) {
                await tx.lobby.update({
                    where: { id: partie.lobby.id },
                    data: {
                        statut: 'en_attente',
                        partieId: null,
                        membres: {
                            deleteMany: { joueurId }   //On supprime celui qui quitte
                        }
                    }
                })
            }
            return { message: `Partie ${partieId} abandonnée par le joueur ${joueurId}` }
        }, { isolationLevel: 'Serializable' })
    }
    async onGameOver(partieId: number): Promise<void> {
        const lobbyId = await this.lobbyService.clearLobbyMembersByPartie(partieId);
        if (lobbyId) {
            // informer les clients du lobby qu’il est vidé
            this.rt.emitToLobby(lobbyId, 'lobby:state', { lobbyId, membres: [] });
        }
    }
}
