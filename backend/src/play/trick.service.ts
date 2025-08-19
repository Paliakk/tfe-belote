import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { RulesService } from './rules.service';
import { MancheService } from 'src/manche/manche.service';
import { RealtimeService } from 'src/realtime/realtime.service';
import { CarteJoueePayload, FinDePartiePayload, GameEvent, MancheTermineePayload, NouvelleManchePayload, PliTerminePayload, ScoreMisAJourPayload } from './game-events';

type TrickCard = { ordre: number; joueurId: number; carte: { id: number; valeur: string; couleurId: number } }

@Injectable()
export class TrickService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly rules: RulesService,
        private readonly mancheService: MancheService,
        private readonly rt: RealtimeService
    ) { }

    /**
   * Clôture le PLI COURANT de la manche :
   * - calcule gagnant
   * - calcule points du pli (somme atout/non-atout)
   * - set joueurActuelId = gagnant
   * - crée pli suivant si < 8
   * - signale requiresEndOfHand si = 8 (pour UC12)
   */
    async closeCurrentTrick(mancheId: number) {
        // 1) On exécute TA logique existante en transaction, et on renvoie un payload
        const result = await this.prisma.$transaction(async (tx) => {
            //1. Charger la manche + plis + cartes
            const manche = await tx.manche.findUnique({
                where: { id: mancheId },
                include: {
                    couleurAtout: true,
                    partie: { include: { equipes: { include: { joueurs: true } } } },
                    plis: {
                        orderBy: { numero: 'asc' },
                        include: {
                            cartes: {
                                orderBy: { ordre: 'asc' },
                                select: {
                                    id: true, ordre: true, joueurId: true,
                                    carte: {
                                        select: {
                                            id: true, valeur: true, couleurId: true,
                                            pointsAtout: true, pointsNonAtout: true
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            })
            if (!manche) throw new NotFoundException(`Manche ${mancheId} introuvable.`)
            const partieId = manche.partie.id;

            const plis = [...(manche.plis || [])].sort((a, b) => a.numero - b.numero)
            if (plis.length === 0) throw new BadRequestException(`Aucun pli en cours pour cette manche.`)
            const last = plis[plis.length - 1]
            if (last.cartes.length !== 4) {
                throw new BadRequestException(`Le pli ${last.numero} n'est pas complet (${last.cartes.length}/4).`)
            }

            //2. Gagnant + points du pli
            const atoutId = manche.couleurAtout?.id ?? manche.couleurAtoutId ?? null
            const trickCards: TrickCard[] = last.cartes.map(pc => ({
                ordre: pc.ordre,
                joueurId: pc.joueurId,
                carte: { id: pc.carte.id, valeur: pc.carte.valeur, couleurId: pc.carte.couleurId }
            }));
            const couleurDemandee = trickCards[0].carte.couleurId;

            const winning = this.rules.currentWinning(trickCards, atoutId, couleurDemandee);
            const winnerId = winning.joueurId

            const trickPoints = last.cartes.reduce((sum, pc) => {
                const isAtout = atoutId != null && pc.carte.couleurId === atoutId
                return sum + (isAtout ? pc.carte.pointsAtout : pc.carte.pointsNonAtout)
            }, 0)

            // 3) Mettre gagnant + prochain joueur
            await tx.pli.update({
                where: { id: last.id },
                data: { gagnantId: winnerId }
            });
            await tx.manche.update({
                where: { id: mancheId },
                data: { joueurActuelId: winnerId }
            })

            // 4) Créer pli suivant si < 8
            let createdNextTrick = false
            let requiresEndOfHand = false
            if (last.numero < 8) {
                await tx.pli.create({ data: { mancheId, numero: last.numero + 1 } })
                createdNextTrick = true
            } else {
                requiresEndOfHand = true // → UC12
            }

            // 5) Score live recalculé (pour retour temps réel)
            const { team1, team2, winnerTeam } = await this.computeLiveScores(tx, mancheId, atoutId, winnerId);

            return {
                message: `Pli ${last.numero} clôturé.`,
                pliId: last.id,
                numero: last.numero,
                winnerId,
                winnerTeam,
                trickPoints,
                totals: { team1, team2 },
                nextLeads: winnerId,
                createdNextTrick,
                requiresEndOfHand,
                partieId
            }
        }, { isolationLevel: 'Serializable' });

        this.rt.emitToPartie(result.partieId, GameEvent.PliTermine, {
            mancheId,
            pliId: result.pliId,
            pliNumero: result.numero,
            numero: result.numero,
            winnerId: result.winnerId,
            winnerTeam: result.winnerTeam,
            trickPoints: result.trickPoints,
            totals: result.totals,
            nextLeads: result.nextLeads,
            requiresEndOfHand: result.requiresEndOfHand,
            at: new Date().toISOString(),
        } satisfies PliTerminePayload);

        // 2) Hors transaction : si 8e pli, on enchaîne automatiquement UC12 (Fin de manche)
        if (result.requiresEndOfHand) {
            try {
                const end = await this.mancheService.endOfHand(mancheId);

                this.rt.emitToPartie(result.partieId, GameEvent.MancheTerminee, {
                    partieId: result.partieId,
                    mancheId,
                    recap: end ?? null,
                    at: new Date().toISOString(),
                } satisfies MancheTermineePayload);
                console.log('[WS] mancheTerminee émis', { partieId: result.partieId, mancheId });

                const { team1, team2, scoreMax } = await this.getCumulativeScores(result.partieId);

                // 🧮 Score mis à jour (scoreMisAJour)
                this.rt.emitToPartie(result.partieId, GameEvent.ScoreMisAJour, {
                    partieId: result.partieId,
                    scores: { team1, team2 },
                    scoreMax,
                    at: new Date().toISOString(),
                } satisfies ScoreMisAJourPayload);
                console.log('[WS] scoreMisAJour émis', { team1, team2, scoreMax });

                const freshPartie = await this.prisma.partie.findUnique({
                    where: { id: result.partieId },
                    select: { statut: true, mancheCouranteId: true, scoreMax: true }, // prends aussi scoreMax si besoin
                });

                // ♻️ Nouvelle manche (si ID a changé)
                if (freshPartie?.statut === 'en_cours'
                    && freshPartie.mancheCouranteId
                    && freshPartie.mancheCouranteId !== mancheId) {
                    this.rt.emitToPartie(result.partieId, GameEvent.NouvelleManche, {
                        partieId: result.partieId,
                        nouvelleMancheId: freshPartie.mancheCouranteId,
                        at: new Date().toISOString(),
                    } satisfies NouvelleManchePayload);
                    console.log('[WS] nouvelleManche émis', { nouvelleMancheId: freshPartie.mancheCouranteId });
                }

                // 🏁 Fin de partie
                if (freshPartie?.statut === 'finie') {
                    const winnerTeam = team1 >= team2 ? 1 : 2;
                    this.rt.emitToPartie(result.partieId, GameEvent.FinDePartie, {
                        partieId: result.partieId,
                        winnerTeam,
                        finalScores: { team1, team2 },
                        at: new Date().toISOString(),
                    } satisfies FinDePartiePayload);
                    console.log('[WS] finDePartie émis', { winnerTeam, team1, team2 });
                }

                return { ...result, endOfHand: end };
            } catch (e) {
                console.error('[END_OF_HAND][ERROR]', e);
                return { ...result, endOfHandError: (e as Error).message ?? 'endOfHand failed' };
            }
        }


        // 3) Sinon, on renvoie le payload standard de fin de pli
        return result;
    }

    /**
   * Calcul live : somme des points des plis terminés, attribués à l'équipe du gagnant.
   * Retourne aussi l'équipe du winner courant.
   */

    private async computeLiveScores(tx: Prisma.TransactionClient, mancheId: number, atoutId: number | null, winnerId: number) {
        const data = await tx.pli.findMany({
            where: { mancheId, gagnantId: { not: null } },
            orderBy: { numero: 'asc' },
            include: {
                cartes: {
                    include: {
                        carte: {
                            select: { id: true, valeur: true, couleurId: true, pointsAtout: true, pointsNonAtout: true }
                        }
                    }
                }
            }
        })

        const pointsByPli = data.map(pli => {
            const pts = pli.cartes.reduce((s, pc) => {
                const isAtout = atoutId != null && pc.carte.couleurId === atoutId;
                return s + (isAtout ? pc.carte.pointsAtout : pc.carte.pointsNonAtout);
            }, 0)
            return { numero: pli.numero, gagnantId: pli.gagnantId!, points: pts };
        })

        const manche = await tx.manche.findUnique({
            where: { id: mancheId },
            include: { partie: { include: { equipes: { include: { joueurs: true } } } } }
        })

        const mapTeam: Record<number, 1 | 2> = {}
        manche!.partie.equipes.forEach(eq => {
            eq.joueurs.forEach(j => { mapTeam[j.joueurId] = (eq.numero as 1 | 2) })
        })

        let team1 = 0, team2 = 0
        for (const p of pointsByPli) {
            const t = mapTeam[p.gagnantId]
            if (t === 1) team1 += p.points; else team2 += p.points
        }
        const winnerTeam = mapTeam[winnerId] ?? 1
        return { team1, team2, winnerTeam }
    }

    /** Historique du pli précédent (dernier pli fini) */
    async previousTrick(mancheId: number) {
        const pli = await this.prisma.pli.findFirst({
            where: { mancheId, gagnantId: { not: null } },
            orderBy: { numero: 'desc' },
            include: {
                cartes: {
                    orderBy: { ordre: 'asc' },
                    select: {
                        ordre: true, joueurId: true,
                        carte: { select: { id: true, valeur: true, couleurId: true } }
                    }
                },
                manche: { select: { couleurAtoutId: true } }
            }
        });
        if (!pli) return { message: 'Aucun pli terminé.' };

        const atoutId = pli.manche.couleurAtoutId ?? null;
        const couleurDemandee = pli.cartes[0].carte.couleurId;
        const winning = this.rules.currentWinning(
            pli.cartes.map(pc => ({ ordre: pc.ordre, joueurId: pc.joueurId, carte: pc.carte as any })),
            atoutId,
            couleurDemandee
        );
        return {
            pliId: pli.id,
            numero: pli.numero,
            gagnantId: winning.joueurId,
            cartes: pli.cartes
        };
    }

    /** Score live (somme des plis terminés) */
    async scoreLive(mancheId: number) {
        const manche = await this.prisma.manche.findUnique({
            where: { id: mancheId },
            select: { couleurAtoutId: true }
        });
        if (!manche) throw new NotFoundException(`Manche ${mancheId} introuvable.`);
        const { team1, team2 } = await this.computeLiveScores(this.prisma, mancheId, manche.couleurAtoutId ?? null, -1);
        return { mancheId, team1, team2 };
    }

    private async getCumulativeScores(partieId: number) {
        const partie = await this.prisma.partie.findUnique({
            where: { id: partieId },
            include: { equipes: { select: { id: true, numero: true } } },
        });
        const rows = await this.prisma.scoreManche.findMany({
            where: { manche: { partieId } },
            select: { equipeId: true, points: true },
        });
        const byId = new Map<number, number>();
        for (const r of rows) byId.set(r.equipeId, (byId.get(r.equipeId) || 0) + r.points);
        let team1 = 0, team2 = 0;
        for (const eq of partie!.equipes) {
            const s = byId.get(eq.id) || 0;
            if (eq.numero === 1) team1 += s; else if (eq.numero === 2) team2 += s;
        }
        return { team1, team2, scoreMax: partie!.scoreMax };
    }
}