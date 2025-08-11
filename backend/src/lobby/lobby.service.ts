import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateLobbyDto } from './creat-lobby.dto';
import { NotFoundError } from 'rxjs';

@Injectable()
export class LobbyService {
    constructor(private readonly prisma : PrismaService) {}

    /**
     * Créer un nouveau lobby en base de données.
     * @param dto Données de création du lobby
     * @param createurId ID du joueur créateur (à remplacer par Auth0 plus tard)
     */
    async create(dto: CreateLobbyDto, createurId : number){
        //1. Vérifier si le joueur existe
        const joueurExiste = await this.prisma.joueur.findUnique({
            where: {id: createurId},
        });
        if (!joueurExiste) {
            throw new BadRequestException(`Le joueur ${createurId} n'existe pas.`);
        }

        //Vérifier si le joueur est déjà créateur d'un lobby actif
        const lobbyExistant = await this.prisma.lobby.findFirst({
            where: {
                createurId,
                statut:'en_attente',
            },
        })
        if (lobbyExistant){
            throw new BadRequestException(`Vous avez déjà un lobby actif (id=${lobbyExistant.id}).`)
        }
        //3. Création d'un lobby
        const lobbyCree = await this.prisma.lobby.create({
            data: {
                nom: dto.nom,
                password: dto.password,
                statut : 'en_attente',
                createur: {connect: {id:createurId}},
            },
            include: {
                createur: {select: {id:true, username: true}},
            }
        })
        return lobbyCree
    }
    /**
     * Récupère un lobby par id ou lève une NotFoundException.
     * On inclut le créateur et si elle existe, la partie associée.
     */
    async findByIdOrThrow(id: number) {
        const lobby = await this.prisma.lobby.findUnique({
            where: {id},
            include: {
                createur: { select: {id: true, username: true}},
                partie: {
                    select: {
                        id:true,
                        statut: true,
                        scoreMax: true,
                        nombreJoueurs: true,
                    }
                }
            }
        })
        if(!lobby) {
            throw new NotFoundException(`Lobby ${id} introuvable`)
        }
        return lobby
    }
}
