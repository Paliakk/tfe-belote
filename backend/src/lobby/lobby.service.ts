import { Injectable, BadRequestException, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateLobbyDto } from './dto/creat-lobby.dto';
import { NotFoundError } from 'rxjs';
import { JoinLobbyDto } from './dto/join-lobby.dto';
import { BADRESP } from 'dns';
import { StartGameDto } from './dto/start-game.dto';
import { Prisma } from '@prisma/client'

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
            select: { id: true }
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
            select: { id: true }
        })
        if (lobbyExistant) {
            throw new BadRequestException(`Vous avez déjà un lobby actif (id=${lobbyExistant.id}).`)
        }
        //3. Transaction: créer le lobby PUIS ajouter le créateur comme membre
        const lobbyCree = await this.prisma.$transaction(async (tx) => {
            //3.1 Créer le lobby
            const lobby = await tx.lobby.create({
                data: {
                    nom: dto.nom,
                    password: dto.password,
                    statut: 'en_attente',
                    createur: { connect: { id: createurId } }
                },
                include: {
                    createur: { select: { id: true, username: true } }
                }
            })
            //3.2 Ajouter le créateur comme membre de ce lobby
            await tx.lobbyJoueur.create({
                data: {
                    lobbyId: lobby.id,
                    joueurId: createurId
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
            async (tx) => {
                // Déjà membre de ce lobby?
                const dejaMembre = await tx.lobbyJoueur.findUnique({
                    where: { lobbyId_joueurId: { lobbyId, joueurId } }
                })
                if (dejaMembre) { throw new BadRequestException('Vous êtes déjà dans ce lobby.') }
                //Déjà membre d'un autre lobby en attente?
                const autreLobby = await tx.lobbyJoueur.findFirst({
                    where: { joueurId, lobby: { statut: 'en_attente' } },
                    select: { lobbyId: true }
                })
                if (autreLobby && autreLobby.lobbyId !== lobbyId) { throw new BadRequestException(`Vous êtes déjà dans un lobby en attente (id=${autreLobby.lobbyId}).`) }

                //Capacité stricte (recomptée dans la transaction)
                const count = await tx.lobbyJoueur.count({ where: { lobbyId } })
                if (count >= 4) { throw new BadRequestException('Le lobby est plein (4/4)') }

                //Insert membre
                await tx.lobbyJoueur.create({ data: { lobbyId, joueurId } })

                //Etat à jour
                const updated = await tx.lobby.findUnique({
                    where: { id: lobbyId },
                    include: {
                        createur: { select: { id: true, username: true } },
                        membres: { include: { joueur: { select: { id: true, username: true } } } }
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
            { isolationLevel: 'Serializable' }
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

    /**
     * Quitter un lobby dont le statut est 'en_attente'
     */
    async leave(lobbyId: number, joueurId: number) {
        return this.prisma.$transaction(async (tx) => {
            //1. Récupérer le lobby
            const lobby = await tx.lobby.findUnique({
                where: { id: lobbyId },
                include: { membres: true }
            })
            if (!lobby) { throw new NotFoundException(`Lobby ${lobbyId} introuvable.`) }
            //2. Vérifier que le joueur est bien membre
            const isMember = lobby.membres.some(m => m.joueurId === joueurId)
            if (!isMember) { throw new BadRequestException(`Le joueur ${joueurId} n'est pas membre du lobby.`) }
            //3. Cas : Crétauer quitte -> suppression du lobby
            if (lobby.createurId === joueurId) {
                await tx.lobbyJoueur.deleteMany({ where: { lobbyId } })
                await tx.lobby.delete({ where: { id: lobbyId } })
                return { message: `Lobby ${lobbyId} supprimé car le créateur est parti.` }
            }
            //4. Cas : autre joueur quitte -> suppression de son entrée
            await tx.lobbyJoueur.delete({
                where: { lobbyId_joueurId: { lobbyId, joueurId } }
            })
            //5. Vérifier si plus aucun membre -> supprimer le lobby
            const remaining = await tx.lobbyJoueur.count({ where: { lobbyId } })
            if (remaining === 0) {
                await tx.lobby.delete({ where: { id: lobbyId } })
                return { message: `Lobby ${lobbyId} supprimé (dernier joueur parti).` }
            }
            return { message: `Joueur ${joueurId} a quitté le lobby ${lobbyId}.` }
        })
    }

    /**
     * Démarre une partie à partir d'un lobbyu en_attente
     * Etapes:
     * 1. Vérif créateur et état du lobby
     * 2. Vérif nombre de joueurs = 4
     * 3. Création Partie/ Equipes + EquipeJoueur
     * 4. Mélange cartes et distribution de 5 cartes/joueur
     * 5.Création Manche 1
     * 6. Maj lobby -> en_cours + partieId
     */

    async startGame(lobbyId: number, dto: StartGameDto) {
        const { joueurId, scoreMax } = dto

        return this.prisma.$transaction(async (tx) => {
            //1. Vérif lobby
            const lobby = await tx.lobby.findUnique({
                where: { id: lobbyId },
                include: {
                    membres: {
                        include: {
                            joueur: { select: { id: true, username: true } }
                        },
                        orderBy: { createdAt: 'asc' }
                    }
                }
            })
            if (!lobby) { throw new NotFoundException(`Lobby ${lobbyId} introuvable.`) }
            if (lobby.statut !== 'en_attente') {
                throw new BadRequestException(`Lobby ${lobbyId} n'est pas en attente.`)
            }
            if (lobby.createurId !== joueurId) {
                throw new ForbiddenException(`Seul le créateur peut lancer la partie.`)
            }
            //2. Vérif nombre joueurs
            if (lobby.membres.length !== 4) {
                throw new BadRequestException(`Il faut exactement 4 joueurs pour lancer la partie (actuel: ${lobby.membres.length}).`)
            }
            //3. Création partie
            const partie = await tx.partie.create({
                data: {
                    statut: 'en_cours',
                    scoreMax: scoreMax ?? 301,
                    nombreJoueurs: 4
                }
            })
            //4. Création équipes (0 et 2, 1 et 3)
            const equipe1 = await tx.equipe.create({
                data: { partieId: partie.id, numero: 1 }
            })
            const equipe2 = await tx.equipe.create({
                data: { partieId: partie.id, numero: 2 }
            })
            //5. Affectation joueurs -> equipe
            const affectations = lobby.membres.map((membre, index) => ({
                equipeId: index % 2 === 0 ? equipe1.id : equipe2.id,
                joueurId: membre.joueur.id,
                ordreSiege: index
            }))
            await tx.equipeJoueur.createMany({ data: affectations })

            //6. Mélange des cartes
            const cartes = await tx.carte.findMany()
            if (cartes.length < 32) { throw new BadRequestException('Le paquet de cartes n’est pas initialisé (32 cartes requises). Lance le seed.') }
            const paquet = [...cartes].sort(() => Math.random() - 0.5)

            //7. Carte retournée = carte n°21
            const idxRetournee = 20
            if (paquet.length <= idxRetournee) { throw new BadRequestException('Paquet insuffisant pour déterminer la carte retournée (index 20).') }
            const carteRetournee = paquet[idxRetournee]
            // Récupèrer les sièges 0 à 3 par ordre d'entrée (établis lors du join/start)
            const seats = lobby.membres         //membres triés par createdAd asc
                .map((m, i) => ({ seat: i, joueurId: m.joueur.id }))

            const dealerSeat = seats.find(s => s.joueurId === joueurId)!.seat
            const leftOfDealerSeat = (dealerSeat + 1) % 4
            const leftOfDealerId = seats[leftOfDealerSeat].joueurId

            // Stockage de l'ordre du paquet
            const paquetIds = paquet.map(c => c.id)

            //8. Création manche 1 avec état d'enchère initial
            const manche = await tx.manche.create({
                data: {
                    partieId: partie.id,
                    numero: 1,
                    donneurJoueurId: joueurId,
                    carteRetourneeId: carteRetournee.id,
                    tourActuel: 1,
                    joueurActuelId: leftOfDealerId,
                    preneurId: null,
                    paquet: paquetIds
                }
            })

            //Pointer la manche courante de la partie
            await tx.partie.update({
                where: { id: partie.id },
                data: { mancheCouranteId: manche.id },
            })
            
            //9. Distribution initiale (5 cartes/joueur)
            const mainsData: Prisma.MainCreateManyInput[] = seats.flatMap((s) => {
                const start = s.seat * 5
                const five = paquet.slice(start, start + 5)
                return five.map((carte) => ({
                    joueurId: s.joueurId,
                    mancheId: manche.id,
                    carteId: carte.id,
                    jouee: false,
                }));
            });
            // 10) Insert des mains
            await tx.main.createMany({ data: mainsData });

            //9. MAJ lobby
            await tx.lobby.update({
                where: { id: lobbyId },
                data: {
                    statut: 'en_cours',
                    partieId: partie.id
                }
            })
            //10 Réponse
            return {
                message: `Partie ${partie.id} lancée depuis le lobby ${lobbyId}`,
                partie: {
                    id: partie.id,
                    scoreMax: partie.scoreMax,
                    statut: partie.statut
                },
                manche: {
                    id: manche.id,
                    numero: manche.numero,
                    donneurId: manche.donneurJoueurId,
                    carteRetournee: carteRetournee
                },
                equipes: [
                    { id: equipe1.id, joueurs: affectations.filter(a => a.equipeId === equipe1.id) },
                    { id: equipe2.id, joueurs: affectations.filter(a => a.equipeId === equipe2.id) }
                ]
            }
        }, { isolationLevel: 'Serializable' })

    }
}
