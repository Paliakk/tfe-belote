import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { RulesService } from './rules.service';
import { Prisma } from '@prisma/client';
import { TrickService } from './trick.service';
import { MancheService } from 'src/manche/manche.service';
import { PartieGuard } from 'src/common/partie.guard';

@Injectable()
export class PlayService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly rules: RulesService,
        private readonly trick: TrickService,
        private readonly mancheService: MancheService,
        private readonly partieGuard: PartieGuard
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
        await this.partieGuard.ensureEnCoursByMancheId(mancheId);

        const result = await this.prisma.$transaction(async (tx) => {
            // 0) Charger état nécessaire
            const manche = await tx.manche.findUnique({
                where: { id: mancheId },
                include: {
                    partie: { include: { equipes: { include: { joueurs: true } } } },
                    mains: { where: { jouee: false }, include: { carte: true } },
                    plis: {
                        orderBy: { numero: 'asc' },
                        include: { cartes: { orderBy: { ordre: 'asc' }, include: { carte: true } } }
                    }
                }
            });
            if (!manche) throw new NotFoundException(`Manche ${mancheId} introuvable.`);
            if (manche.joueurActuelId !== joueurId) {
                throw new ForbiddenException(`Ce n'est pas au joueur ${joueurId} de jouer.`);
            }

            const mainJoueur = manche.mains.filter(m => m.joueurId === joueurId).map(m => m.carte);
            if (mainJoueur.length === 0) {
                throw new BadRequestException(`Le joueur ${joueurId} n'a plus de carte disponible.`);
            }

            const carte = mainJoueur.find(c => c.id === carteId);
            if (!carte) throw new BadRequestException(`La carte ${carteId} n'est pas dans la main du joueur.`);

            const seats = manche.partie.equipes
                .flatMap(eq => eq.joueurs.map(j => ({
                    seat: j.ordreSiege,
                    joueurId: j.joueurId,
                    team: (j.ordreSiege % 2 === 0 ? 1 : 2) as 1 | 2,
                })))
                .sort((a, b) => a.seat - b.seat);

            // Pli courant (dernier incomplet) ou création
            let pli = this.findCurrentTrick(manche);
            if (!pli || pli.cartes.length >= 4) {
                const numero = (manche.plis.length || 0) + 1;
                pli = await tx.pli.create({ data: { mancheId, numero } });
                pli = await tx.pli.findUnique({
                    where: { id: pli.id },
                    include: { cartes: { orderBy: { ordre: 'asc' }, include: { carte: true } } }
                }) as any;
            }

            // UC10 — légalité de la carte
            const trickCards = await Promise.all(
                pli.cartes.map(async (pc) => ({
                    ordre: pc.ordre,
                    joueurId: (await this.findPlayerIdByPliCarte(tx, pc.id))!,
                    carte: pc.carte as any
                }))
            );
            const playableRes = this.rules.isPlayable({
                cardId: carteId,
                hand: mainJoueur,
                trickCards,
                atoutId: manche.couleurAtoutId,
                seats,
                currentPlayerId: joueurId,
            });
            if (!playableRes.valid) {
                throw new BadRequestException('Carte illégale selon UC10 (fournir/couper/surcouper).');
            }

            // 1) Insérer la carte dans le pli
            const ordre = pli.cartes.length; // 0..3
            await tx.pliCarte.create({
                data: { pliId: pli.id, joueurId, carteId, ordre }
            });

            // 2) Marquer la carte "jouée"
            await tx.main.updateMany({
                where: { joueurId, mancheId, carteId, jouee: false },
                data: { jouee: true }
            });
            // 🔒 Idempotent : s’assure qu’on marque belote si le duo Roi&Dame d’atout est désormais complété
            await this.mancheService.markBeloteIfNeeded(mancheId, joueurId, tx);
            // Helpers
            const norm = (v: string) => v.trim().toLowerCase();
            const isK = (v: string) => ['roi', 'k'].includes(norm(v));
            const isQ = (v: string) => ['dame', 'q'].includes(norm(v));

            let beloteEvent: 'belote' | 'rebelote' | null = null;

            const atoutId = manche.couleurAtoutId ?? null;
            const isTrump = atoutId != null && carte.couleurId === atoutId;
            const isTrumpKQ = isTrump && (isK(carte.valeur) || isQ(carte.valeur));

            if (isTrumpKQ) {
                // 1) Est-ce que le joueur a K et Q d'atout EN MAIN à cet instant ?
                const hasTrumpK = mainJoueur.some(c => c.couleurId === atoutId && isK(c.valeur));
                const hasTrumpQ = mainJoueur.some(c => c.couleurId === atoutId && isQ(c.valeur));

                if (hasTrumpK && hasTrumpQ) {
                    // 2) A-t-il déjà joué l'une des deux auparavant ?
                    const alreadyPlayedCount = await tx.pliCarte.count({
                        where: {
                            joueurId,
                            pli: { mancheId },
                            carte: { couleurId: atoutId, valeur: { in: ['Roi', 'Dame', 'roi', 'dame', 'K', 'Q'] } },
                        },
                    });

                    if (alreadyPlayedCount === 0) {
                        // 👉 Déclaration BEL0TE (première carte du duo, l’autre est encore en main)
                        // On marque la manche tout de suite (points assurés au score)
                        if (manche.beloteJoueurId == null) {
                            await tx.manche.update({
                                where: { id: mancheId },
                                data: { beloteJoueurId: joueurId },
                            });
                        }
                        beloteEvent = 'belote';
                    } else {
                        // 👉 REBELOTE (deuxième carte du duo posée)
                        beloteEvent = 'rebelote';
                    }
                }
            }

            // 3) Pli complet ?
            const nowPli = await tx.pli.findUnique({
                where: { id: pli.id },
                include: { cartes: { orderBy: { ordre: 'asc' } } }
            });
            const cartesCount = nowPli!.cartes.length;

            if (cartesCount < 4) {
                const nextPlayerId = this.nextPlayerId(seats, joueurId);
                await tx.manche.update({
                    where: { id: mancheId },
                    data: { joueurActuelId: nextPlayerId }
                });

                return {
                    message: 'Carte jouée.',
                    pliNumero: nowPli!.numero,
                    cartesDansPli: cartesCount,
                    nextPlayerId,
                    requiresEndOfTrick: false, // (flag lu après le tx)
                    beloteEvent
                };
            } else {
                // Pli complet → on ne clôture pas ici
                return {
                    message: 'Carte jouée (pli complet).',
                    pliNumero: nowPli!.numero,
                    cartesDansPli: cartesCount,
                    nextPlayerId: null,
                    requiresEndOfTrick: true, // (flag lu après le tx)
                    beloteEvent
                };
            }
        }, { isolationLevel: 'Serializable' });

        // déclenchement automatique UC11 (après le tx)
        if (result.requiresEndOfTrick) {
            const closed = await this.trick.closeCurrentTrick(mancheId);
            // Merge minimal pour conserver l’info belote de ce coup
            return {
                ...closed,
                beloteEvent: (result as any).beloteEvent ?? null
            };
        }

        // Sinon on renvoie l’info UC07 classique
        return result;
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
