import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class MancheService {
    constructor(private readonly prisma: PrismaService) { }

    /**
   * Relance explicitement une donne par son ID (doit être la manche courante).
   * Effets atomiques (transaction) :
   *  - ancienne manche -> statut 'relancee'
   *  - donneur avance d'un siège (gauche de l'ancien)
   *  - nouvelle manche (# +1), paquet mélangé, #21 retournée, 5 cartes/joueur
   *  - Partie.mancheCouranteId = newManche.id
   *  - (TODO) émission WS
   */

    async relancerMancheByMancheId(mancheId: number) {
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
}
