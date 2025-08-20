import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { BidType, CreateBidDto } from './dto/create-bid.dto';
import { Prisma } from '@prisma/client';
import { MancheService } from 'src/manche/manche.service';
import { PartieGuard } from 'src/common/partie.guard';

@Injectable()
export class BiddingService {
    constructor(private readonly prisma: PrismaService, private readonly mancheService: MancheService, private readonly partieGuard: PartieGuard) { }

    // Etat
    async getState(mancheId: number) {
        const manche = await this.prisma.manche.findUnique({
            where: { id: mancheId },
            include: {
                encheres: {
                    orderBy: { createdAt: 'asc' },
                    include: { joueur: { select: { id: true, username: true } }, couleurAtout: true },
                },
                carteRetournee: { include: { couleur: true } },
                couleurAtout: true
            }
        })
        if (!manche) throw new NotFoundException(`Manche ${mancheId} introuvable.`)

        return {
            mancheId,
            tourActuel: manche.tourActuel,
            joueurActuelId: manche.joueurActuelId,
            preneurId: manche.preneurId,
            atout: manche.couleurAtout ? { id: manche.couleurAtout.id, nom: manche.couleurAtout.nom } : null,
            carteRetournee: manche.carteRetournee
                ? { id: manche.carteRetournee.id, valeur: manche.carteRetournee.valeur, couleurId: manche.carteRetournee.couleurId }
                : null,
            historique: manche.encheres.map((e) => ({
                joueur: e.joueur,
                type: e.enchereType,
                couleurAtoutId: e.couleurAtoutId ?? null,
                at: e.createdAt
            }))
        }
    }
    // Action
    async placeBid(mancheId: number, joueurId: number, dto: CreateBidDto) {
        await this.partieGuard.ensureEnCoursByMancheId(mancheId);
        const { type, couleurAtoutId } = dto

        return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {

            // 0 Charger la manche + la partie + les sièges (ordreSiege)
            const manche = await tx.manche.findUnique({
                where: { id: mancheId },
                include: {
                    partie: {
                        include: {
                            equipes: { include: { joueurs: true } },
                            lobby: true
                        },
                    },
                    carteRetournee: true
                }
            })
            if (!manche) throw new NotFoundException(`Manche ${mancheId} introuvable.`)
            if (manche.partie.statut !== 'en_cours') { throw new BadRequestException(`La partie n'est pas en cours.`) }

            //Vérifier que cette manche est bien la dernière de la partie
            const latest = await tx.manche.findFirst({
                where: { partieId: manche.partieId },
                orderBy: { createdAt: 'desc' },
                select: { id: true, numero: true }
            })
            if (latest && latest.id !== manche.id) {
                throw new ConflictException({
                    message: `Cette manche n'est plus active (une nouvelle donne a été créée).`,
                    activeMancheId: latest.id,
                    activeMancheNumero: latest.numero
                })
            }

            // Si déjà preneur -> enchères terminées
            if (manche.preneurId) { throw new BadRequestException(`Les enchères sont terminées (preneur déjà désigné).`) }

            // Calcul des seats 0..3 via equipeJoueur.ordreSiege
            const seats = manche.partie.equipes.flatMap((eq) =>
                eq.joueurs.map((j) => ({ seat: j.ordreSiege, joueurId: j.joueurId }))
            ).sort((a, b) => a.seat - b.seat)

            //Vérifier l'appartenance et le tour actif
            const isInGame = seats.some((s) => s.joueurId === joueurId)
            if (!isInGame) throw new ForbiddenException(`Le joueur ${joueurId} ne participe pas à cette manche.`)
            if (manche.joueurActuelId !== joueurId) { throw new BadRequestException(`Ce n'est pas le tour du joueur ${joueurId}.`) }

            //Règles de type autorisé par tour
            if (manche.tourActuel === 1 && type === BidType.CHOOSE_COLOR) {
                throw new BadRequestException(`Au tour 1, seul 'pass' ou 'take_card' sont autorisés.`)
            }
            if (manche.tourActuel === 2 && type === BidType.TAKE_CARD) {
                throw new BadRequestException(`Au tour 2, 'take_card' n'est pas autorisé (utilise 'choose_color' ou 'pass').`)
            }
            if (type === BidType.CHOOSE_COLOR) {
                if (!couleurAtoutId) throw new BadRequestException(`'couleurAtoutId' est requis pour 'choose_color'.`)
                //Interdit de choisir la même couleur que la carte retournée au 2e tour
                if (manche.carteRetourneeId) {
                    const ret = manche.carteRetournee!
                    if (couleurAtoutId === ret.couleurId) { throw new BadRequestException(`La couleur choisie doit être différente de la carte retournée.`) }
                }
            }
            //1. Enregistrer l'enchère
            await tx.enchere.create({
                data: {
                    joueurId,
                    mancheId,
                    valeur: type,       //Stockage de la valuer en clair c'est plus simple
                    enchereType: type as any,
                    couleurAtoutId: type === BidType.CHOOSE_COLOR ? couleurAtoutId! : null
                }
            })
            //2. Si prise -> clôturer l'enchère, fixer preneur/atout et compléter la distrib
            if (type === BidType.TAKE_CARD || type === BidType.CHOOSE_COLOR) {
                const atoutId = type === BidType.TAKE_CARD
                    ? manche.carteRetournee!.couleurId
                    : couleurAtoutId!

                //Fixer preneur et atout
                await tx.manche.update({
                    where: { id: mancheId },
                    data: {
                        preneurId: joueurId,
                        couleurAtoutId: atoutId,
                    }
                })
                //Distrib finale : preneur (2 + carte retournée), les autres 3
                await this.completeDistributionAfterTake(tx, manche, joueurId)

                //Déterminer le 1er joueur de jeu (à gauche du donneur) pour l'UC07
                const dealerSeat = seats.find(s => s.joueurId === (manche.donneurJoueurId as number))!.seat
                const leftOfDealerId = seats[(dealerSeat + 1) % 4].joueurId

                //MAJ état joueurActuel au démarrage du jeu (fin enchères)
                await tx.manche.update({
                    where: { id: mancheId },
                    data: { joueurActuelId: leftOfDealerId }
                })
                return { 
                    message: `Preneur fixé: joueur ${joueurId}, atout=${atoutId}. Distribution complétée.`,
                    partieId: manche.partieId,
                    atoutId,
                    preneurId:joueurId,
                    mancheId
                }
            }
            //3. Sinon, c'est un "pass" -> avancer au joueur suivant ou changer de tour

            //Joueur à gauche du donneur (début de chaque tour)
            const dealerSeat = seats.find(s => s.joueurId === (manche.donneurJoueurId as number))!.seat
            const leftOfDealerId = seats[(dealerSeat + 1) % 4].joueurId

            const nextPlayerId = this.nextPlayerId(seats, manche.joueurActuelId)

            //Fin de tour? -> le prochain à joueur revient à gauche du donneur
            const isEndOfRound = nextPlayerId === leftOfDealerId

            if (isEndOfRound) {
                if (manche.tourActuel === 1) {
                    // Tour 2 commence
                    await tx.manche.update({
                        where: { id: mancheId },
                        data: { tourActuel: 2, joueurActuelId: leftOfDealerId }
                    })
                    return { message: `Tour 1 terminé sans preneur. Passage au tour 2.`,partieId: manche.partieId }
                } else {
                    //Tour 2 terminé sans preneur -> UC14 Relancer donne
                    const relance = await this.mancheService.relancerMancheByMancheId(manche.id)
                    return {
                        message: `Personne n'a pris au tour 2. Donne relancée (UC14).`,
                        newMancheId:relance.newMancheId,      // service renvoie { newMancheId, numero }
                        numero: relance.numero,
                        partieId: manche.partieId
                }
            }
        } else {
            // Continuer dans le même tour
            await tx.manche.update({
                where: { id: mancheId },
                data: { joueurActuelId: nextPlayerId }
            })
                return { message: `Pass. Joueur suivant: ${nextPlayerId}.`,partieId: manche.partieId }
        }
        }, { isolationLevel: 'Serializable' })
    }
    // Utils
    private nextPlayerId(seats: { seat: number, joueurId: number }[], currentPlayerId: number) {
    const cur = seats.find(s => s.joueurId === currentPlayerId)!
    const nextSeat = (cur.seat + 1) % 4
    return seats[nextSeat].joueurId
}
    private async completeDistributionAfterTake(tx: Prisma.TransactionClient, manche: any, preneurId: number) {
    // Récup des infos nécessaire à la distrib finale
    const m = await tx.manche.findUnique({
        where: { id: manche.id },
        include: {
            partie: { include: { equipes: { include: { joueurs: true } } } }
        }
    })
    if (!m) throw new NotFoundException(`Manche ${manche.id} introuvable.`)

    const seats = m.partie.equipes.flatMap((eq) =>
        eq.joueurs.map((j) => ({ seat: j.ordreSiege, joueurId: j.joueurId }))
    ).sort((a, b) => a.seat - b.seat)

    //Comptes actuels (devraient être 5 partout)
    const counts = Object.fromEntries(await Promise.all(
        seats.map(async s => {
            const c = await tx.main.count({ where: { mancheId: m.id, joueurId: s.joueurId } })
            return [s.joueurId, c]
        })
    ))
    //Reste du paquet après index 21 (0 à 19 distribuées, 20 est retournée)
    const remaining = m.paquet.slice(21) //11 cartes

    //Donner la carte retournée au preneur
    const ops: Prisma.PrismaPromise<any>[] = []
    ops.push(tx.main.create({
        data: { joueurId: preneurId, mancheId: m.id, carteId: m.carteRetourneeId!, jouee: false },
    }));
    counts[preneurId] += 1


    /**
     * Nombre de cartes à donner encore à chacun
     * preneur : +2 (en plus de la carte retournée)
     * autre: +3
     */
    const needs: Record<number, number> = {}
    seats.forEach(s => {
        needs[s.joueurId] = s.joueurId === preneurId ? (8 - counts[s.joueurId]) : (8 - counts[s.joueurId])
        //Comme counts vaut 6 pour le preneur après la carte retournée, needs = 2; pour les autres counts =5 -> needs = 3
    })

    //Répartition simple (ordre des seats, on parcourt remaining)
    let idx = 0
    for (const s of seats) {
        const toGive = needs[s.joueurId]
        for (let k = 0; k < toGive; k++) {
            const carteId = remaining[idx++]
            ops.push(tx.main.create({
                data: { joueurId: s.joueurId, mancheId: m.id, carteId, jouee: false },
            }));
        }
    }
    await Promise.all(ops)
}
    private async relancerDonne(tx: Prisma.TransactionClient, manche: { id: number }) {
    // Simplification MVP : on marque la manche comme "échouée", on crée une nouvelle manche avec donneur suivant,
    // on redistribue 5 cartes + 1 retournée, et on reset l'état d'enchère.
    // Ici, on applique la même logique que UC14 prévue, en version courte.

    //Charger partie + sièges
    const m = await tx.manche.findUnique({
        where: { id: manche.id },
        include: {
            partie: { include: { equipes: { include: { joueurs: true } }, lobby: true } }
        }
    })
    if (!m) throw new NotFoundException(`Manche ${manche.id} introuvable.`)

    const seats = m.partie.equipes.flatMap((eq) =>
        eq.joueurs.map((j) => ({ seat: j.ordreSiege, joueurId: j.joueurId }))
    ).sort((a, b) => a.seat - b.seat)

    //Donneur suivant
    const dealerSeat = seats.find(s => s.joueurId === (m.donneurJoueurId as number))!.seat;
    const nextDealerId = seats[(dealerSeat + 1) % 4].joueurId;
    const leftOfDealerId = seats[(dealerSeat + 2) % 4].joueurId; // à gauche du nouveau donneur

    // Marquer la manche actuelle comme "échouée" (pas de champ status -> on se contente de la laisser et on repart)
    // Nouveau paquet
    const cartes = await tx.carte.findMany();
    const paquet = [...cartes].sort(() => Math.random() - 0.5);
    const paquetIds = paquet.map(c => c.id);
    const carteRetournee = paquet[20];

    // Créer nouvelle manche
    const newManche = await tx.manche.create({
        data: {
            partieId: m.partieId,
            numero: m.numero + 1, // incrément simple
            donneurJoueurId: nextDealerId,
            carteRetourneeId: carteRetournee.id,
            tourActuel: 1,
            joueurActuelId: leftOfDealerId,
            preneurId: null,
            paquet: paquetIds,
        },
    });

    // Distribuer 5 cartes aux 4 joueurs
    const mains = seats.flatMap((s) => {
        const start = s.seat * 5;
        const five = paquet.slice(start, start + 5);
        return five.map((carte) => ({
            joueurId: s.joueurId,
            mancheId: newManche.id,
            carteId: carte.id,
            jouee: false,
        }));
    });
    await tx.main.createMany({ data: mains });

    //notifier via webSocket plus tard
}
    async getActiveMancheIdByPartie(partieId: number) {
    const m = await this.prisma.manche.findFirst({
        where: { partieId },
        orderBy: [
            { numero: 'desc' },
            { createdAt: 'desc' },
            { id: 'desc' }
        ],
        select: { id: true, numero: true }
    })
    if (!m) throw new NotFoundException(`Aucune manche pour la partie ${partieId}`)
    return m
}
}
