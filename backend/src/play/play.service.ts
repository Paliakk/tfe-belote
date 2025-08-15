import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { RulesService } from './rules.service';
import { Prisma } from '@prisma/client';

@Injectable()
export class PlayService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly rules: RulesService
    ) { }
    /**
   * UC07 — Jouer une carte
   * - vérifie tour
   * - calcule cartes jouables (UC10)
   * - enregistre la carte dans le pli courant
   * - marque la carte "jouee" dans Main
   * - fait avancer le joueur (sauf si pli complet → UC11 prendra le relais)
   */
    async playCard(mancheId: number, joueurId: number, carteId: number) {
        return this.prisma.$transaction(async (tx) => {
            //0. Charger la manche, la partie, les seats,la main du joueur, le pli courant
            const manche = await tx.manche.findUnique({
                where: { id: mancheId },
                include: {
                    partie: {
                        include: {
                            equipes: { include: { joueurs: true } }
                        }
                    },
                    mains: {
                        where: { jouee: false },
                        include: { carte: true }
                    },
                    plis: {
                        orderBy: { numero: 'asc' },
                        include: {
                            cartes: {
                                orderBy: { ordre: 'asc' },
                                include: { carte: true }
                            }
                        }
                    }
                }
            })
            if (!manche) throw new NotFoundException(`Manche ${mancheId} introuvable.`)
            if (manche.joueurActuelId !== joueurId) {
                throw new ForbiddenException(`Ce n'est pas au joueur ${joueurId} de jouer.`)
            }

            //Si aucune carte en main (juste par sécurité)
            const mainJoueur = manche.mains.filter(m => m.joueurId === joueurId).map(m => m.carte)
            if (mainJoueur.length === 0) { throw new BadRequestException(`Le joueur ${joueurId} n'a plus de carte disponible.`) }

            //Vérifier que la carte demandée est bien dans la main
            const carte = mainJoueur.find(c => c.id === carteId)
            if (!carte) throw new BadRequestException(`La carte ${carteId} n'est pas dans la main du joueur.`)

            //Seats 0..3 + team
            const seats = manche.partie.equipes.flatMap((eq, idxEquipe) =>
                eq.joueurs.map(j => ({
                    seat: j.ordreSiege,
                    joueurId: j.joueurId,
                    team: (j.ordreSiege % 2 === 0) ? 1 : 2 as 1 | 2,
                }))
            ).sort((a, b) => a.seat - b.seat);

            // Pli courant : dernier pli dont cartes.length < 4, sinon on en crée un
            let pli = this.findCurrentTrick(manche);
            if (!pli || pli.cartes.length >= 4) {
                const numero = (manche.plis.length || 0) + 1;
                pli = await tx.pli.create({
                    data: { mancheId, numero }
                });
                // Recharge pour avoir structure homogène
                pli = await tx.pli.findUnique({
                    where: { id: pli.id },
                    include: { cartes: { orderBy: { ordre: 'asc' }, include: { carte: true } } }
                }) as any;
            }

            // ---- UC10 intégré : vérifier la légalité de la carte choisie
            const trickCards = await Promise.all(
                pli.cartes.map(async (pc) => ({
                    ordre: pc.ordre,
                    joueurId: (await this.findPlayerIdByPliCarte(tx, pc.id))!, // helper
                    carte: pc.carte as any
                }))
            )
            const playableRes = this.rules.isPlayable({
                cardId: carteId,
                hand: mainJoueur,
                trickCards,
                atoutId: manche.couleurAtoutId,
                seats,
                currentPlayerId: joueurId,
            })
            if (!playableRes.valid) {
                // on refuse et on laisse le joueur rejouer immédiatement
                throw new BadRequestException('Carte illégale selon UC10 (fournir/couper/surcouper).');
            }

            // 1) Enregistrer la carte dans le pli (ordre = nb cartes déjà posées)
            const ordre = pli.cartes.length;
            await tx.pliCarte.create({
                data: {
                    pliId: pli.id,
                    joueurId,
                    carteId,
                    ordre,
                }
            })

            // 2) Marquer la carte comme jouée dans Main (on garde l'historique)
            await tx.main.updateMany({
                where: { joueurId, mancheId, carteId, jouee: false },
                data: { jouee: true }
            })

            // 3) Calculer le prochain joueur actif (si pli pas complet)
            const nowPli = await tx.pli.findUnique({
                where: { id: pli.id },
                include: { cartes: { orderBy: { ordre: 'asc' } } }
            });
            const cartesCount = nowPli!.cartes.length

            if (cartesCount < 4) {
                const nextPlayerId = this.nextPlayerId(seats, joueurId);
                await tx.manche.update({
                    where: { id: mancheId },
                    data: { joueurActuelId: nextPlayerId }
                })
                return {
                    message: 'Carte jouée.',
                    pliNumero: nowPli!.numero,
                    cartesDansPli: cartesCount,
                    nextPlayerId,
                    requiresEndOfTrick: false,
                };
            } else {
                // Pli complet → UC11 décidera du gagnant et du prochain joueur
                return {
                    message: 'Carte jouée (pli complet).',
                    pliNumero: nowPli!.numero,
                    cartesDansPli: cartesCount,
                    nextPlayerId: null,
                    requiresEndOfTrick: true,
                }
            }
        }, { isolationLevel: 'Serializable' })
    }

    private findCurrentTrick(manche: any) {
        const plis = (manche.plis || []).sort((a, b) => a.numero - b.numero);
        if (plis.length === 0) return null
        const last = plis[plis.length - 1]
        if (last.cartes.length < 4) return last
        return null;
    }

    private async findPlayerIdByPliCarte(tx: Prisma.TransactionClient, pliCarteId: number) {
        const pc = await tx.pliCarte.findUnique({ where: { id: pliCarteId }, select: { joueurId: true } })
        return pc?.joueurId ?? null
    }

    private nextPlayerId(seats: { seat: number; joueurId: number }[], currentId: number) {
        const idx = seats.findIndex(s => s.joueurId === currentId);
        const next = seats[(idx + 1) % 4]
        return next.joueurId
    }
}
