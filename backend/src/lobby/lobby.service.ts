import { Injectable, BadRequestException, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateLobbyDto } from './dto/creat-lobby.dto';
import { NotFoundError } from 'rxjs';
import { JoinLobbyDto } from './dto/join-lobby.dto';
import { BADRESP } from 'dns';

@Injectable()
export class LobbyService {
    constructor(private readonly prisma: PrismaService) { }

    /**
     * Créer un nouveau lobby en base de données et rajouter le crétauer comme mebre.
     * @param dto Données de création du lobby
     * @param createurId ID du joueur créateur (à remplacer par Auth0 plus tard)
     */
    async create(dto: CreateLobbyDto, createurId: number) {
        //1. Vérifier si le créateur existe
        const joueurExiste = await this.prisma.joueur.findUnique({
            where: { id: createurId },
            select: {id:true}
        });
        if (!joueurExiste) {
            throw new BadRequestException(`Le joueur ${createurId} n'existe pas.`);
        }

        //2.Vérifier si le joueur est déjà créateur d'un lobby actif
        const lobbyExistant = await this.prisma.lobby.findFirst({
            where: {
                createurId,
                statut: 'en_attente',
            },
            select: {id:true}
        })
        if (lobbyExistant) {
            throw new BadRequestException(`Vous avez déjà un lobby actif (id=${lobbyExistant.id}).`)
        }
        //3. Transaction: créer le lobby PUIS ajouter le créateur comme membre
        const lobbyCree = await this.prisma.$transaction( async(tx)=>{
            //3.1 Créer le lobby
            const lobby = await tx.lobby.create({
                data: {
                    nom: dto.nom,
                    password: dto.password,
                    statut: 'en_attente',
                    createur: {connect: {id:createurId}}
                },
                include:{
                    createur: {select: {id:true, username:true}}
                }
            })
            //3.2 Ajouter le créateur comme membre de ce lobby
            await tx.lobbyJoueur.create({
                data: {
                    lobbyId: lobby.id,
                    joueurId:createurId
                }
            })
            return lobby
        })
        return lobbyCree
    }
    /**
     * Récupère un lobby par id ou lève une NotFoundException.
     * On inclut le créateur et si elle existe, la partie associée.
     */
    async findByIdOrThrow(id: number) {
        const lobby = await this.prisma.lobby.findUnique({
            where: { id },
            include: {
                createur: { select: { id: true, username: true } },
                partie: {
                    select: {
                        id: true,
                        statut: true,
                        scoreMax: true,
                        nombreJoueurs: true,
                    }
                }
            }
        })
        if (!lobby) {
            throw new NotFoundException(`Lobby ${id} introuvable`)
        }
        return lobby
    }
    /**
     * Rejoint un lobby (UC04)
     * Règles:
     * - Lobby existe & en_attente
     * - Si lobby a un password → doit matcher
     * - Le joueur ne doit pas déjà être dans un lobby en attente
     * - Le joueur ne doit pas déjà être membre de CE lobby
     * - Capacité max: 4 membres
     */
    async join(dto: JoinLobbyDto) {
        const { lobbyId, joueurId, password } = dto

        //1. Lobby existe et en attente
        const lobby = await this.prisma.lobby.findUnique({
            where: { id: lobbyId },
            include: { membres: true }, //On compte rapidement
        })
        if (!lobby) {
            throw new NotFoundException(`Lobby ${lobbyId} introuvable.`)
        }
        if (lobby.statut !== 'en_attente') {
            throw new BadRequestException(`Le lobby ${lobbyId} n'est pas joignable (statut: ${lobby.statut}).`)
        }

        //2. Mot de passe (si lobby privé)
        if (lobby.password && lobby.password !== password) {
            throw new ForbiddenException('Mot de passe du lobby invalide')
        }
        //3. Joueur existe
        const joueur = await this.prisma.joueur.findUnique({ where: { id: joueurId } })
        if (!joueur) {
            throw new BadRequestException(`Le joueur ${joueurId} n'existe pas.`)
        }
        // Transaction SERI ALIZABLE: empêche la surcapacité et les doublons en concurrence
        return this.prisma.$transaction(
            async(tx)=> {
                // Déjà membre de ce lobby?
                const dejaMembre = await tx.lobbyJoueur.findUnique({
                    where: {lobbyId_joueurId:{lobbyId,joueurId}}
                })
                if(dejaMembre){throw new BadRequestException('Vous êtes déjà dans ce lobby.')}
                //Déjà membre d'un autre lobby en attente?
                const autreLobby = await tx.lobbyJoueur.findFirst({
                    where: {joueurId, lobby:{statut:'en_attente'}},
                    select:{lobbyId:true}
                })
                if(autreLobby && autreLobby.lobbyId !== lobbyId){throw new BadRequestException(`Vous êtes déjà dans un lobby en attente (id=${autreLobby.lobbyId}).`)}

                //Capacité stricte (recomptée dans la transaction)
                const count= await tx.lobbyJoueur.count({where: {lobbyId}})
                if(count >= 4){throw new BadRequestException('Le lobby est plein (4/4)')}

                //Insert membre
                await tx.lobbyJoueur.create({data:{lobbyId,joueurId}})

                //Etat à jour
                const updated = await tx.lobby.findUnique({
                    where:{id:lobbyId},
                    include: {
                        createur: {select: {id: true, username: true}},
                        membres: {include: {joueur:{select:{id:true,username:true}}}}
                    }
                })
                return {
                    id: updated!.id,
                    nom: updated!.nom,
                    statut: updated!.statut,
                    estPrive: Boolean(updated!.password),
                    createdAt: updated!.createdAt,
                    createur: updated!.createur,
                    nbMembres: updated!.membres.length,
                    membres: updated!.membres.map((m) => m.joueur),
                }
            },
            {isolationLevel:'Serializable'}
        )
    }
    /**
     * lire les membres d'un lobby (pour l'ui)
     */
    async listMembers(lobbyId: number) {
        const lobby = await this.prisma.lobby.findUnique({
            where: { id: lobbyId },
            include: {
                membres: { include: { joueur: { select: { id: true, username: true } } } }
            }
        })
        if (!lobby) throw new NotFoundException(`Lobby ${lobbyId} introuvable.`)

        return {
            lobbyId: lobby.id,
            nbMembres: lobby.membres.length,
            membres: lobby.membres.map((m) => m.joueur)
        }
    }
}
