import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PartieGuard } from 'src/common/partie.guard';
import { PrismaService } from 'src/prisma/prisma.service';
import { ScoreResultDto } from 'src/score/dto/score-result.dto';
import { ScoreService } from 'src/score/score.service';

@Injectable()
export class MancheService {
    constructor(private readonly prisma: PrismaService, private readonly score: ScoreService, private readonly partieGuard: PartieGuard) { }

    /**
   * Relance explicitement une donne par son ID (doit être la manche courante).
   * Effets atomiques (transaction) :
   *  - ancienne manche -> statut 'relancee'
   *  - donneur avance d'un siège (gauche de l'ancien)
   *  - nouvelle manche (# +1), paquet mélangé, #21 retournée, 5 cartes/joueur
   *  - Partie.mancheCouranteId = newManche.id
   *  - (TODO) émission WS
   */
    // +++ Helper retry pour les transactions conflictuelles
    private async runWithRetry<T>(fn: () => Promise<T>, retries = 2, backoffMs = 80): Promise<T> {
        try {
            return await fn();
        } catch (e: any) {
            // Prisma P2034: transaction conflict / deadlock
            if (retries > 0 && (e.code === 'P2034' || /write conflict|deadlock/i.test(e.message ?? ''))) {
                await new Promise(r => setTimeout(r, backoffMs));
                return this.runWithRetry(fn, retries - 1, backoffMs * 2);
            }
            throw e;
        }
    }

    async relancerMancheByMancheId(mancheId: number) {
        await this.partieGuard.ensureEnCoursByMancheId(mancheId)
        return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
            const m = await tx.manche.findUnique({
                where: { id: mancheId },
                include: {
                    partie: { include: { equipes: { include: { joueurs: true } }, lobby: true } },
                    carteRetournee: true
                }
            })
            if (!m) throw new NotFoundException(`Manche ${mancheId} introuvable.`)
            if (m.partie.statut !== 'en_cours') throw new BadRequestException(`La partie n'est pas en cours.`)

            //Vérifier que c'est la manche courante
            const latest = await tx.manche.findFirst({
                where: { partieId: m.partieId },
                orderBy: [{ numero: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
                select: { id: true }
            })
            if (latest?.id !== m.id) { throw new BadRequestException(`Cette manche n'est pas la manche active.`) }

            //1. Marquer l'ancienne manche 'relancee' si encore active
            if (m.statut === 'active') {
                await tx.manche.update({
                    where: { id: m.id },
                    data: { statut: 'relancee' }
                })
            }

            //2. Calcul des sièges 0..3 (ordreSiege global)
            const seats = m.partie.equipes
                .flatMap(eq => eq.joueurs.map(j => ({ seat: j.ordreSiege, joueurId: j.joueurId })))
                .sort((a, b) => a.seat - b.seat)

            const dealerSeat = seats.find(s => s.joueurId === (m.donneurJoueurId as number))!.seat
            const nextDealerId = seats[(dealerSeat + 1) % 4].joueurId         // nouveau donneur
            const leftOfNewDealerId = seats[(dealerSeat + 2) % 4].joueurId     // premier à parler

            //3. Nouveau paquet + carte retournée(index 20)
            const cartes = await tx.carte.findMany()
            const paquet = [...cartes].sort(() => Math.random() - 0.5)
            const paquetIds = paquet.map(c => c.id)
            const carteRetournee = paquet[20]

            //4. Créer la nouvelle manche
            const newManche = await tx.manche.create({
                data: {
                    partieId: m.partieId,
                    numero: m.numero + 1,
                    donneurJoueurId: nextDealerId,
                    carteRetourneeId: carteRetournee.id,
                    tourActuel: 1,
                    joueurActuelId: leftOfNewDealerId,
                    preneurId: null,
                    paquet: paquetIds,
                    statut: 'active'
                }
            })

            //5. Distribuer 5 cartes par joueur (en suivant le tableau seats)
            const mains = seats.flatMap(s => {
                const start = s.seat * 5
                const five = paquet.slice(start, start + 5)
                return five.map(carte => ({
                    joueurId: s.joueurId,
                    mancheId: newManche.id,
                    carteId: carte.id,
                    jouee: false
                }))
            })
            await tx.main.createMany({ data: mains })

            //6. Mettre à jour la partie (pointeur manche courante)
            await tx.partie.update({
                where: { id: m.partieId },
                data: { mancheCouranteId: newManche.id }
            })

            // TODO: émettre un event WS 'donne:relancee' (ancienne) + 'donne:cree' (nouvelle) pour le lobby m.partie.lobby?.id

            return { newMancheId: newManche.id, numero: newManche.numero }
        }, { isolationLevel: 'Serializable' })
    }

    //Variante: relancer via partieId
    async relancerMancheByPartieId(partieId: number) {
        const latest = await this.prisma.manche.findFirst({
            where: { partieId },
            orderBy: [{ numero: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
            select: { id: true }
        })
        if (!latest) throw new NotFoundException(`Aucune manche pour la partie ${partieId}`)
        return this.relancerMancheByMancheId(latest.id)
    }

    /**
     * UC12 – Fin de manche (idempotent)
     * - Vérifie 8 plis terminés
     * - Si ScoreManche déjà présent -> renvoie l'existant + cumul
     * - Sinon appelle UC09 (ScoreService), puis marque la manche 'terminee', calcule cumuls et renvoie la décision
     */
    async endOfHand(mancheId: number) {
        return this.runWithRetry(async () => {
            return this.prisma.$transaction(async (tx) => {
                const manche = await tx.manche.findUnique({
                    where: { id: mancheId },
                    include: {
                        partie: { include: { equipes: { include: { joueurs: true } } } },
                        plis: { select: { id: true, numero: true, gagnantId: true } },
                        donneur: true
                    }
                })
                if (!manche) throw new NotFoundException(`Manche ${mancheId} introuvable.`)
                if (!manche.partie) throw new BadRequestException(`Manche ${mancheId}: partie introuvable.`)
                if (manche.plis.length !== 8 || manche.plis.some(p => !p.gagnantId)) {
                    throw new BadRequestException(`Manche ${mancheId}: les 8 plis doivent être terminés.`)
                }

                // Idempotence: si ScoreManche existe déjà pour cette manche, retourner les infos existantes
                const existingScores = await tx.scoreManche.findMany({
                    where: { mancheId },
                    include: { bonus: true },
                    orderBy: { equipeId: 'asc' },
                })

                let scorePayload: ScoreResultDto;
                if (existingScores.length === 2) {
                    // 1) On récupère les deux équipes (pour l’ordre 1 puis 2)
                    const equipes = await tx.equipe.findMany({
                        where: { partieId: manche.partieId },
                        select: { id: true, numero: true },
                    });
                    const sorted = equipes.sort((a, b) => a.numero - b.numero);
                    const team1 = existingScores.find(s => s.equipeId === sorted[0].id)!;
                    const team2 = existingScores.find(s => s.equipeId === sorted[1].id)!;

                    //Calcul du preneurEquipeId (fallback)
                    const preneurEquipeId =
                        manche.preneurId == null
                            ? null
                            : (await tx.equipeJoueur.findFirst({
                                where: {
                                    joueurId: manche.preneurId,
                                    equipe: { partieId: manche.partieId }, // filtre via la relation
                                },
                                select: { equipeId: true },
                            }))?.equipeId ?? null;
                    //Construire le payload de fallback en réutilisant preneurEquipeId
                    scorePayload = {
                        mancheId,
                        preneurId: manche.preneurId ?? null,
                        preneurEquipeId, // 👈 on le met ici
                        scores: [
                            {
                                equipeId: team1.equipeId,
                                pointsBase: 0, // inconnu depuis table (fallback)
                                bonus: (team1.bonus || []).reduce((s, b) => s + b.points, 0),
                                total: team1.points,
                                capot: !!(team1.bonus || []).find(b => b.type === 'capot'),
                                detailsBonus: (team1.bonus || []).map(b => ({ type: b.type as any, points: b.points })),
                            },
                            {
                                equipeId: team2.equipeId,
                                pointsBase: 0,
                                bonus: (team2.bonus || []).reduce((s, b) => s + b.points, 0),
                                total: team2.points,
                                capot: !!(team2.bonus || []).find(b => b.type === 'capot'),
                                detailsBonus: (team2.bonus || []).map(b => ({ type: b.type as any, points: b.points })),
                            },
                        ],
                        contratReussi: null,
                        bonusAppliques: Array.from(new Set((team1.bonus || []).concat(team2.bonus || []).map(b => b.type))) as any,
                        scoreMancheIds: [team1.id, team2.id],
                    };
                } else {
                    // Calculer les scores définitifs via UC09
                    scorePayload = await this.score.calculateScoresForManche(mancheId);
                }

                // Marquer 'terminee' si ce n'est pas déjà le cas
                await tx.manche.updateMany({
                    where: { id: mancheId, NOT: { statut: 'terminee' } },
                    data: { statut: 'terminee' }
                });

                // Calcul cumulé partie
                const equipes = await tx.equipe.findMany({
                    where: { partieId: manche.partieId },
                    select: { id: true, numero: true },
                });
                const equipeIdByNumero = new Map<number, number>();
                equipes.forEach(e => equipeIdByNumero.set(e.numero, e.id));
                const totalsRows = await tx.scoreManche.findMany({
                    where: { manche: { partieId: manche.partieId } },
                    select: { equipeId: true, points: true },
                });
                const acc = new Map<number, number>();
                totalsRows.forEach(r => acc.set(r.equipeId, (acc.get(r.equipeId) ?? 0) + r.points));
                const t1 = acc.get(equipeIdByNumero.get(1)!) ?? 0;
                const t2 = acc.get(equipeIdByNumero.get(2)!) ?? 0;

                // Décision >=301 (sans déclencher UC13)
                let shouldEndGame = false;
                let winnerTeamNumero: 1 | 2 | undefined;
                let reason: 'reach_threshold' | 'tie_over_threshold' | undefined;

                if (t1 >= 301 || t2 >= 301) {
                    if (t1 === t2) {
                        shouldEndGame = false;
                        reason = 'tie_over_threshold';
                    } else {
                        shouldEndGame = true;
                        winnerTeamNumero = t1 > t2 ? 1 : 2;
                        reason = 'reach_threshold';
                    }
                }
                if (shouldEndGame) {
                    await tx.partie.update({
                        where: { id: manche.partieId },
                        data: { statut: 'finie' }
                    })

                    // (facultatif) refléter l’état dans le lobby pour l’UI
                    await tx.lobby.updateMany({
                        where: { partieId: manche.partieId },
                        data: { statut: 'terminee' }
                    })
                }

                // TODO: WebSocket emit('manche:ended', { mancheId, score: scorePayload, totals: {team1:t1, team2:t2}, decision: {...} })

                let nextMancheSummary: { id: number; numero: number; donneurId: number; joueurActuelId: number; carteRetourneeId: number } | undefined;

                if (!shouldEndGame) {
                    // 1) Sièges globaux (0..3) depuis la partie
                    const seats = manche.partie.equipes
                        .flatMap(eq => eq.joueurs.map(j => ({ seat: j.ordreSiege, joueurId: j.joueurId })))
                        .sort((a, b) => a.seat - b.seat);

                    // 2) Nouveau donneur = à gauche de l'ancien donneur
                    const previousDealerId = manche.donneurJoueurId as number;
                    const dealerSeat = seats.find(s => s.joueurId === previousDealerId)!.seat;
                    const nextDealerId = seats[(dealerSeat + 1) % 4].joueurId;     // 👈 nouveau donneur
                    const leftOfNewDealerId = seats[(dealerSeat + 2) % 4].joueurId; // 👈 premier à parler

                    // 3) Nouveau paquet + carte retournée (index 20)
                    const cartes = await tx.carte.findMany();
                    const paquet = [...cartes].sort(() => Math.random() - 0.5);
                    const paquetIds = paquet.map(c => c.id);
                    const carteRetournee = paquet[20];

                    // 4) Créer la nouvelle manche (# +1)
                    const newManche = await tx.manche.create({
                        data: {
                            partieId: manche.partieId,
                            numero: manche.numero + 1,
                            donneurJoueurId: nextDealerId,
                            carteRetourneeId: carteRetournee.id,
                            tourActuel: 1,
                            joueurActuelId: leftOfNewDealerId,
                            preneurId: null,
                            paquet: paquetIds,
                            statut: 'active',
                        }
                    });

                    // 5) Distribuer 5 cartes par joueur (comme relancerManche)
                    const mainsInit = seats.flatMap(s => {
                        const start = s.seat * 5;
                        const five = paquet.slice(start, start + 5);
                        return five.map(carte => ({
                            joueurId: s.joueurId,
                            mancheId: newManche.id,
                            carteId: carte.id,
                            jouee: false,
                        }));
                    });
                    await tx.main.createMany({ data: mainsInit });

                    // 6) Mettre à jour la partie (pointeur manche courante)
                    await tx.partie.update({
                        where: { id: manche.partieId },
                        data: { mancheCouranteId: newManche.id },
                    });

                    // 7) Petit résumé pour le frontend
                    nextMancheSummary = {
                        id: newManche.id,
                        numero: newManche.numero,
                        donneurId: nextDealerId,
                        joueurActuelId: leftOfNewDealerId,
                        carteRetourneeId: carteRetournee.id,
                    };
                }
                return {
                    message: 'UC12 – Fin de manche effectuée.',
                    mancheId,
                    scores: scorePayload,
                    cumule: { team1: t1, team2: t2 },
                    decision: {
                        shouldEndGame,
                        winnerTeamNumero,
                        reason,
                        totals: { team1: t1, team2: t2 },
                    },
                    nextManche: shouldEndGame ? null : (nextMancheSummary ?? null),
                    gameOver: shouldEndGame
                        ? {
                            partieId: manche.partieId,
                            winnerTeamNumero,
                            totals: { team1: t1, team2: t2 },
                        }
                        : null,
                }
            }
            )
        })
    }
    /**
 * Détecte la belote "live" : si le joueur vient de compléter le duo Roi&Dame d'ATOUT
 * alors on marque `manche.beloteJoueurId = joueurId` (idempotent).
 * Retourne { applied: boolean } pour enrichir la réponse du /play si souhaité.
 */
    async markBeloteIfNeeded(mancheId: number, joueurId: number, tx?: Prisma.TransactionClient): Promise<{ applied: boolean }> {
        const db = tx ?? this.prisma;

        // 1) Charger l'atout + belote existante
        const manche = await db.manche.findUnique({
            where: { id: mancheId },
            select: { couleurAtoutId: true, beloteJoueurId: true }
        });
        if (!manche) throw new NotFoundException(`Manche ${mancheId} introuvable.`);
        const atoutId = manche.couleurAtoutId;
        if (!atoutId) return { applied: false }; // pas d'atout fixé → pas de belote

        // Déjà marquée ? → idempotent
        if (manche.beloteJoueurId != null) return { applied: false };

        // 2) A-t-il joué Roi & Dame d'atout (peu importe l'ordre) ?
        const duo = await db.pliCarte.findMany({
            where: {
                joueurId,
                pli: { mancheId },
                carte: { couleurId: atoutId, valeur: { in: ['Roi', 'Dame', 'roi', 'dame', 'K', 'Q'] } }
            },
            select: { id: true, carte: { select: { valeur: true } } }
        });

        // normaliser
        const norm = (v: string) => v.trim().toLowerCase();
        const vals = duo.map(x => norm(x.carte.valeur));

        // match "roi" ou "k" ; "dame" ou "q"
        const hasRoi = vals.includes('roi') || vals.includes('k');
        const hasDame = vals.includes('dame') || vals.includes('q');

        if (hasRoi && hasDame) {
            await db.manche.update({
                where: { id: mancheId },
                data: { beloteJoueurId: joueurId }
            });
            return { applied: true };
        }

        return { applied: false };
    }

}
