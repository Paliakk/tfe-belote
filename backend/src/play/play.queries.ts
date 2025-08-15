import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { RulesService } from './rules.service';

@Injectable()
export class PlayQueriesService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly rules: RulesService
    ) { }

    async getHand(mancheId: number, joueurId: number) {
        const manche = await this.prisma.manche.findUnique({
            where: { id: mancheId },
            include: {
                mains: {
                    where: { joueurId, jouee: false },
                    include: { carte: { include: { couleur: true } } }
                }
            }
        })
        if (!manche) return { mancheId, joueurId, cartes: [], message: `Manche ${mancheId} introuvable.` }

        const cartes = manche.mains.map(m => ({
            id: m.carte.id,
            valeur: m.carte.valeur,
            couleurId: m.carte.couleurId,
            couleur: m.carte.couleur.nom
        }))
        return { mancheId, joueurId, cartes }
    }
    async getPlayable(mancheId: number, joueurId: number) {
        const manche = await this.prisma.manche.findUnique({
            where: { id: mancheId },
            include: {
                partie: { include: { equipes: { include: { joueurs: true } } } },
                mains: { where: { joueurId, jouee: false }, include: { carte: true } },
                plis: {
                    orderBy: { numero: 'asc' },
                    include: {
                        cartes: {
                            orderBy: { ordre: 'asc' },
                            select: { ordre: true, joueurId: true, carte: true }
                        }
                    }
                }
            }
        })
        if (!manche) return { playableIds: [], message: `Manche ${mancheId} introuvable.` }
        if (manche.joueurActuelId !== joueurId) {
            return { playableIds: [], message: `Ce n'est pas au joueur ${joueurId} de jouer.` }
        }
        const seats = manche.partie.equipes
            .flatMap(eq => eq.joueurs.map(j => ({
                seat: j.ordreSiege, joueurId: j.joueurId, team: (j.ordreSiege % 2 === 0 ? 1 : 2) as 1 | 2
            })))
            .sort((a, b) => a.seat - b.seat)

        const plisSorted = (manche.plis || []).sort((a, b) => a.numero - b.numero)
        const last = plisSorted.length ? plisSorted[plisSorted.length - 1] : null
        const currentTrick = last && last.cartes.length < 4 ? last : null

        const trickCards = currentTrick
            ? currentTrick.cartes.map(pc => ({ ordre: pc.ordre, joueurId: pc.joueurId, carte: pc.carte as any }))
            : []

        const hand = manche.mains.map(m => m.carte)

        const playableIds = this.rules.playableCards({
            hand,
            trickCards,
            atoutId: manche.couleurAtoutId ?? null,
            seats,
            currentPlayerId: joueurId,
        })

        return {
            mancheId,
            joueurId,
            playableIds,
            trickSize: trickCards.length,
            atoutId: manche.couleurAtoutId ?? null
        }
    }

    async getActiveTrick(mancheId: number) {
        const manche = await this.prisma.manche.findUnique({
            where: { id: mancheId },
            include: {
                plis: {
                    orderBy: { numero: 'asc' },
                    include: {
                        cartes: {
                            orderBy: { ordre: 'asc' },
                            select: {
                                ordre: true, joueurId: true,
                                carte: { include: { couleur: true } },
                            },
                        },
                    },
                },
                couleurAtout: true,
            },
        })
        if (!manche) return { mancheId, message: `Manche ${mancheId} introuvable.` }

        const plis = (manche.plis || []).sort((a, b) => a.numero - b.numero)
        const last = plis.length ? plis[plis.length - 1] : null
        const current = last && last.cartes.length < 4 ? last : null

        return current ? {
            mancheId,
            pliId: current.id,
            numero: current.numero,
            cartes: current.cartes.map(pc => ({
                ordre: pc.ordre,
                joueurId: pc.joueurId,
                carte: {
                    id: pc.carte.id,
                    valeur: pc.carte.valeur,
                    couleurId: pc.carte.couleurId,
                    couleur: pc.carte.couleur.nom
                }
            })),
            atout: manche.couleurAtout ? { id: manche.couleurAtout.id, nom: manche.couleurAtout.nom } : null,
        } : {
            mancheId,
            pliId: null,
            numero: plis.length + 1,
            cartes: [],
            atout: manche.couleurAtout ? { id: manche.couleurAtout.id, nom: manche.couleurAtout.nom } : null
        }
    }

    async getActiveManche(partieId: number) {
        const partie = await this.prisma.partie.findUnique({
            where: { id: partieId },
            include: { manches: { orderBy: { numero: 'desc' }, take: 1 } },
        });
        if (!partie || partie.manches.length === 0) return { partieId, activeMancheId: null };
        const m = partie.manches[0];
        return { partieId, activeMancheId: m.id, numero: m.numero };
    }

    async listCardsHuman() {
        const cards = await this.prisma.carte.findMany({
            include: { couleur: true },
            orderBy: [{ couleurId: 'asc' }, { id: 'asc' }],
        });
        return cards.map(c => ({
            id: c.id,
            label: `${c.valeur} de ${c.couleur.nom}`,
            valeur: c.valeur,
            couleurId: c.couleurId,
            couleur: c.couleur.nom,
        }));
    }
}