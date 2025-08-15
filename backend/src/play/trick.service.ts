import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { RulesService } from './rules.service';

type TrickCard = { ordre: number; joueurId: number; carte: { id: number; valeur: string; couleurId: number } }

@Injectable()
export class TrickService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly rules: RulesService
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
        return this.prisma.$transaction(async (tx) => {
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
            }
        }, { isolationLevel: 'Serializable' })
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
}