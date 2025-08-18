import { Injectable, BadRequestException, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateLobbyDto } from './dto/creat-lobby.dto';
import { JoinLobbyDto } from './dto/join-lobby.dto';
import { StartGameDto } from './dto/start-game.dto';
import { Prisma } from '@prisma/client';

@Injectable()
export class LobbyService {
    constructor(private readonly prisma: PrismaService) { }

    /** Créer un lobby et y ajouter le créateur comme membre */
    async create(dto: CreateLobbyDto, createurId: number) {
        // 1) Créateur existe
        const joueurExiste = await this.prisma.joueur.findUnique({
            where: { id: createurId }, select: { id: true }
        });
        if (!joueurExiste) throw new BadRequestException(`Le joueur ${createurId} n'existe pas.`);

        // 2) Pas déjà un lobby en attente
        const lobbyExistant = await this.prisma.lobby.findFirst({
            where: { createurId, statut: 'en_attente' }, select: { id: true }
        });
        if (lobbyExistant) throw new BadRequestException(`Vous avez déjà un lobby actif (id=${lobbyExistant.id}).`);

        // 3) TX: créer + ajouter le créateur comme membre
        const lobbyCree = await this.prisma.$transaction(async (tx) => {
            const lobby = await tx.lobby.create({
                data: {
                    nom: dto.nom,
                    password: dto.password,
                    statut: 'en_attente',
                    createur: { connect: { id: createurId } },
                },
                include: { createur: { select: { id: true, username: true } } }
            });
            await tx.lobbyJoueur.create({ data: { lobbyId: lobby.id, joueurId: createurId } });
            return lobby;
        });

        return lobbyCree;
    }

    async findByIdOrThrow(id: number) {
        const lobby = await this.prisma.lobby.findUnique({
            where: { id },
            include: {
                createur: { select: { id: true, username: true } },
                partie: { select: { id: true, statut: true, scoreMax: true, nombreJoueurs: true } }
            }
        });
        if (!lobby) throw new NotFoundException(`Lobby ${id} introuvable`);
        return lobby;
    }

    /** UC04 — Rejoindre un lobby (joueurId vient du token) */
    async join(dto: JoinLobbyDto, joueurId: number) {
        const { lobbyId, password } = dto;

        // 1) Lobby existe et en attente
        const lobby = await this.prisma.lobby.findUnique({
            where: { id: lobbyId }, include: { membres: true }
        });
        if (!lobby) throw new NotFoundException(`Lobby ${lobbyId} introuvable.`);
        if (lobby.statut !== 'en_attente') {
            throw new BadRequestException(`Le lobby ${lobbyId} n'est pas joignable (statut: ${lobby.statut}).`);
        }

        // 2) Mot de passe si privé
        if (lobby.password && lobby.password !== password) {
            throw new ForbiddenException('Mot de passe du lobby invalide');
        }

        // 3) Joueur existe
        const joueur = await this.prisma.joueur.findUnique({ where: { id: joueurId } });
        if (!joueur) throw new BadRequestException(`Le joueur ${joueurId} n'existe pas.`);

        // 4) Transaction stricte
        return this.prisma.$transaction(async (tx) => {
            const dejaMembre = await tx.lobbyJoueur.findUnique({
                where: { lobbyId_joueurId: { lobbyId, joueurId } }
            });
            if (dejaMembre) throw new BadRequestException('Vous êtes déjà dans ce lobby.');

            const autreLobby = await tx.lobbyJoueur.findFirst({
                where: { joueurId, lobby: { statut: 'en_attente' } },
                select: { lobbyId: true }
            });
            if (autreLobby && autreLobby.lobbyId !== lobbyId) {
                throw new BadRequestException(`Vous êtes déjà dans un lobby en attente (id=${autreLobby.lobbyId}).`);
            }

            const count = await tx.lobbyJoueur.count({ where: { lobbyId } });
            if (count >= 4) throw new BadRequestException('Le lobby est plein (4/4)');

            await tx.lobbyJoueur.create({ data: { lobbyId, joueurId } });

            const updated = await tx.lobby.findUnique({
                where: { id: lobbyId },
                include: {
                    createur: { select: { id: true, username: true } },
                    membres: { include: { joueur: { select: { id: true, username: true } } } }
                }
            });

            return {
                id: updated!.id,
                nom: updated!.nom,
                statut: updated!.statut,
                estPrive: Boolean(updated!.password),
                createdAt: updated!.createdAt,
                createur: updated!.createur,
                nbMembres: updated!.membres.length,
                membres: updated!.membres.map((m) => m.joueur),
            };
        }, { isolationLevel: 'Serializable' });
    }

    async listMembers(lobbyId: number) {
        const lobby = await this.prisma.lobby.findUnique({
            where: { id: lobbyId },
            include: { membres: { include: { joueur: { select: { id: true, username: true } } } } }
        });
        if (!lobby) throw new NotFoundException(`Lobby ${lobbyId} introuvable.`);
        return {
            lobbyId: lobby.id,
            nbMembres: lobby.membres.length,
            membres: lobby.membres.map((m) => m.joueur),
        };
    }

    async leave(lobbyId: number, joueurId: number) {
        return this.prisma.$transaction(async (tx) => {
            const lobby = await tx.lobby.findUnique({
                where: { id: lobbyId }, include: { membres: true }
            });
            if (!lobby) throw new NotFoundException(`Lobby ${lobbyId} introuvable.`);

            const isMember = lobby.membres.some(m => m.joueurId === joueurId);
            if (!isMember) throw new BadRequestException(`Le joueur ${joueurId} n'est pas membre du lobby.`);

            if (lobby.createurId === joueurId) {
                await tx.lobbyJoueur.deleteMany({ where: { lobbyId } });
                await tx.lobby.delete({ where: { id: lobbyId } });
                return { message: `Lobby ${lobbyId} supprimé car le créateur est parti.` };
            }

            await tx.lobbyJoueur.delete({ where: { lobbyId_joueurId: { lobbyId, joueurId } } });
            const remaining = await tx.lobbyJoueur.count({ where: { lobbyId } });
            if (remaining === 0) {
                await tx.lobby.delete({ where: { id: lobbyId } });
                return { message: `Lobby ${lobbyId} supprimé (dernier joueur parti).` };
            }
            return { message: `Joueur ${joueurId} a quitté le lobby ${lobbyId}.` };
        });
    }

    /** Lancer la partie — `createurId` vient du token */
    async startGame(lobbyId: number, createurId: number, scoreMax?: number) {
        return this.prisma.$transaction(async (tx) => {
            // 1) Lobby
            const lobby = await tx.lobby.findUnique({
                where: { id: lobbyId },
                include: {
                    membres: {
                        include: { joueur: { select: { id: true, username: true } } },
                        orderBy: { createdAt: 'asc' }
                    }
                }
            });
            if (!lobby) throw new NotFoundException(`Lobby ${lobbyId} introuvable.`);
            if (lobby.statut !== 'en_attente') {
                throw new BadRequestException(`Lobby ${lobbyId} n'est pas en attente.`);
            }
            if (lobby.createurId !== createurId) {
                throw new ForbiddenException(`Seul le créateur peut lancer la partie.`);
            }

            // 2) 4 joueurs
            if (lobby.membres.length !== 4) {
                throw new BadRequestException(`Il faut exactement 4 joueurs pour lancer la partie (actuel: ${lobby.membres.length}).`);
            }

            // 3) Partie
            const partie = await tx.partie.create({
                data: { statut: 'en_cours', scoreMax: scoreMax ?? 301, nombreJoueurs: 4 }
            });

            // 4) Équipes
            const equipe1 = await tx.equipe.create({ data: { partieId: partie.id, numero: 1 } });
            const equipe2 = await tx.equipe.create({ data: { partieId: partie.id, numero: 2 } });

            // 5) Affectations (ordre d’entrée)
            const affectations = lobby.membres.map((m, index) => ({
                equipeId: index % 2 === 0 ? equipe1.id : equipe2.id,
                joueurId: m.joueur.id,
                ordreSiege: index
            }));
            await tx.equipeJoueur.createMany({ data: affectations });

            // 6) Paquet
            const cartes = await tx.carte.findMany();
            if (cartes.length < 32) {
                throw new BadRequestException('Le paquet de cartes n’est pas initialisé (32 cartes requises). Lance le seed.');
            }
            const paquet = [...cartes].sort(() => Math.random() - 0.5);
            const idxRetournee = 20;
            const carteRetournee = paquet[idxRetournee];
            const seats = lobby.membres.map((m, i) => ({ seat: i, joueurId: m.joueur.id }));
            const dealerSeat = seats.find(s => s.joueurId === createurId)!.seat;
            const leftOfDealerId = seats[(dealerSeat + 1) % 4].joueurId;
            const paquetIds = paquet.map(c => c.id);

            // 7) Manche 1
            const manche = await tx.manche.create({
                data: {
                    partieId: partie.id,
                    numero: 1,
                    donneurJoueurId: createurId,
                    carteRetourneeId: carteRetournee.id,
                    tourActuel: 1,
                    joueurActuelId: leftOfDealerId,
                    preneurId: null,
                    paquet: paquetIds
                }
            });
            await tx.partie.update({ where: { id: partie.id }, data: { mancheCouranteId: manche.id } });

            // 8) Mains initiales (5 cartes / joueur)
            const mainsData: Prisma.MainCreateManyInput[] = seats.flatMap((s) => {
                const start = s.seat * 5;
                const five = paquet.slice(start, start + 5);
                return five.map((carte) => ({
                    joueurId: s.joueurId,
                    mancheId: manche.id,
                    carteId: carte.id,
                    jouee: false,
                }));
            });
            await tx.main.createMany({ data: mainsData });

            // 9) MAJ lobby
            await tx.lobby.update({
                where: { id: lobbyId },
                data: { statut: 'en_cours', partieId: partie.id }
            });

            return {
                message: `Partie ${partie.id} lancée depuis le lobby ${lobbyId}`,
                partie: { id: partie.id, scoreMax: partie.scoreMax, statut: partie.statut },
                manche: {
                    id: manche.id, numero: manche.numero, donneurId: manche.donneurJoueurId,
                    carteRetournee: carteRetournee
                },
                equipes: [
                    { id: equipe1.id, joueurs: affectations.filter(a => a.equipeId === equipe1.id) },
                    { id: equipe2.id, joueurs: affectations.filter(a => a.equipeId === equipe2.id) }
                ]
            };
        }, { isolationLevel: 'Serializable' });
    }
}
