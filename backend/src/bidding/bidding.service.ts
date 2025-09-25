import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { BidType, CreateBidDto } from './dto/create-bid.dto';
import { Prisma } from '@prisma/client';
import { MancheService } from 'src/manche/manche.service';
import { PartieGuard } from 'src/common/guards/partie.guard';
import { GameService } from 'src/game/game.service';
import { RealtimeService } from 'src/realtime/realtime.service';
import { PlayService } from 'src/play/play.service';

const TURN_TIMEOUT_MS = Number(process.env.TURN_TIMEOUT_MS ?? 20000);
const TURN_GRACE_MS = Number(process.env.TURN_GRACE_MS ?? 200);

@Injectable()
export class BiddingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mancheService: MancheService,
    private readonly partieGuard: PartieGuard,
    private readonly gameService: GameService,
    private readonly rt: RealtimeService,
    private readonly playService: PlayService
  ) { }

  // Etat
  async getState(mancheId: number) {
    const manche = await this.prisma.manche.findUnique({
      where: { id: mancheId },
      include: {
        encheres: {
          orderBy: { createdAt: 'asc' },
          include: {
            joueur: { select: { id: true, username: true } },
            couleurAtout: true,
          },
        },
        carteRetournee: { include: { couleur: true } },
        couleurAtout: true,
      },
    });
    if (!manche) throw new NotFoundException(`Manche ${mancheId} introuvable.`);

    const seats = await this.getSeatsForManche(mancheId);

    return {
      mancheId,
      tourActuel: manche.tourActuel,
      joueurActuelId: manche.joueurActuelId,
      preneurId: manche.preneurId,
      atout: manche.couleurAtout
        ? { id: manche.couleurAtout.id, nom: manche.couleurAtout.nom }
        : null,
      carteRetournee: manche.carteRetournee
        ? {
          id: manche.carteRetournee.id,
          valeur: manche.carteRetournee.valeur,
          couleurId: manche.carteRetournee.couleurId,
        }
        : null,
      historique: manche.encheres.map((e) => ({
        joueur: e.joueur,
        type: e.enchereType,
        couleurAtoutId: e.couleurAtoutId ?? null,
        at: e.createdAt,
      })),
      seats,
    };
  }
  // ---- TIMER STATE (enchères) ----
  private biddingTimers = new Map<number, NodeJS.Timeout>(); // clé: partieId

  // Action
  async placeBid(mancheId: number, joueurId: number, dto: CreateBidDto, isAuto = false) {
    await this.partieGuard.ensureEnCoursByMancheId(mancheId);
    const { type, couleurAtoutId } = dto;

    const res = await this.prisma.$transaction(
      async (tx: Prisma.TransactionClient) => {
        // 0 Charger la manche + la partie + les sièges (ordreSiege)
        const manche = await tx.manche.findUnique({
          where: { id: mancheId },
          include: {
            partie: {
              include: {
                equipes: { include: { joueurs: true } },
                lobby: true,
              },
            },
            carteRetournee: true,
          },
        });
        if (!manche)
          throw new NotFoundException(`Manche ${mancheId} introuvable.`);
        if (manche.partie.statut !== 'en_cours') {
          throw new BadRequestException(`La partie n'est pas en cours.`);
        }
        const partieId = manche.partieId;
        this.clearBiddingTimer(partieId);
        if (!isAuto) {
          this.gameService.resetTimeout(partieId, joueurId);
        }

        //Vérifier que cette manche est bien la dernière de la partie
        const latest = await tx.manche.findFirst({
          where: { partieId: manche.partieId },
          orderBy: { createdAt: 'desc' },
          select: { id: true, numero: true },
        });
        if (latest && latest.id !== manche.id) {
          throw new ConflictException({
            message: `Cette manche n'est plus active (une nouvelle donne a été créée).`,
            activeMancheId: latest.id,
            activeMancheNumero: latest.numero,
          });
        }

        // Si déjà preneur -> enchères terminées
        if (manche.preneurId) {
          throw new BadRequestException(
            `Les enchères sont terminées (preneur déjà désigné).`,
          );
        }

        // Calcul des seats 0..3 via equipeJoueur.ordreSiege
        const seats = manche.partie.equipes
          .flatMap((eq) =>
            eq.joueurs.map((j) => ({
              seat: j.ordreSiege,
              joueurId: j.joueurId,
            })),
          )
          .sort((a, b) => a.seat - b.seat);

        //Vérifier l'appartenance et le tour actif
        const isInGame = seats.some((s) => s.joueurId === joueurId);
        if (!isInGame)
          throw new ForbiddenException(
            `Le joueur ${joueurId} ne participe pas à cette manche.`,
          );
        if (manche.joueurActuelId !== joueurId) {
          throw new BadRequestException(
            `Ce n'est pas le tour du joueur ${joueurId}.`,
          );
        }

        //Règles de type autorisé par tour
        if (manche.tourActuel === 1 && type === BidType.CHOOSE_COLOR) {
          throw new BadRequestException(
            `Au tour 1, seul 'pass' ou 'take_card' sont autorisés.`,
          );
        }
        if (manche.tourActuel === 2 && type === BidType.TAKE_CARD) {
          throw new BadRequestException(
            `Au tour 2, 'take_card' n'est pas autorisé (utilise 'choose_color' ou 'pass').`,
          );
        }
        if (type === BidType.CHOOSE_COLOR) {
          if (!couleurAtoutId)
            throw new BadRequestException(
              `'couleurAtoutId' est requis pour 'choose_color'.`,
            );
          //Interdit de choisir la même couleur que la carte retournée au 2e tour
          if (manche.carteRetourneeId) {
            const ret = manche.carteRetournee!;
            if (couleurAtoutId === ret.couleurId) {
              throw new BadRequestException(
                `La couleur choisie doit être différente de la carte retournée.`,
              );
            }
          }
        }
        //1. Enregistrer l'enchère
        await tx.enchere.create({
          data: {
            joueurId,
            mancheId,
            valeur: type, //Stockage de la valuer en clair c'est plus simple
            enchereType: type as any,
            couleurAtoutId:
              type === BidType.CHOOSE_COLOR ? couleurAtoutId! : null,
          },
        });
        //2. Si prise -> clôturer l'enchère, fixer preneur/atout et compléter la distrib
        if (type === BidType.TAKE_CARD || type === BidType.CHOOSE_COLOR) {
          const atoutId =
            type === BidType.TAKE_CARD
              ? manche.carteRetournee!.couleurId
              : couleurAtoutId!;

          // Fixer preneur, atout, ET faire DEMARRER le PRENEUR (joueurId)
          await tx.manche.update({
            where: { id: mancheId },
            data: {
              preneurId: joueurId,
              couleurAtoutId: atoutId,
              joueurActuelId: joueurId, // 👈 le preneur commence la phase de jeu
              tourActuel: 2,            // (optionnel) on force la fin d’enchères
            },
          });

          // Distrib finale : preneur (2 + carte retournée), les autres 3
          await this.completeDistributionAfterTake(tx, manche, joueurId);

          // IMPORTANT: on ne démarre pas de timer d’ENCHÈRES ici (fini)
          // On remonte l'info, on émettra les events + timer de jeu après la transaction
          return {
            message: `Preneur fixé: joueur ${joueurId}, atout=${atoutId}. Distribution complétée.`,
            partieId: manche.partieId,
            atoutId,
            preneurId: joueurId,
            mancheId,
            _biddingEnded: true, // 👈 marqueur interne pour post-tx
          };
        }
        //3. Sinon, c'est un "pass" -> avancer au joueur suivant ou changer de tour

        //Joueur à gauche du donneur (début de chaque tour)
        const dealerSeat = seats.find(
          (s) => s.joueurId === (manche.donneurJoueurId as number),
        )!.seat;
        const leftOfDealerId = seats[(dealerSeat + 1) % 4].joueurId;

        const nextPlayerId = this.nextPlayerId(seats, manche.joueurActuelId);

        //Fin de tour? -> le prochain à joueur revient à gauche du donneur
        const isEndOfRound = nextPlayerId === leftOfDealerId;

        if (isEndOfRound) {
          if (manche.tourActuel === 1) {
            // Tour 2 commence
            await tx.manche.update({
              where: { id: mancheId },
              data: { tourActuel: 2, joueurActuelId: leftOfDealerId },
            });
            this.startBiddingTimer(partieId, mancheId, leftOfDealerId)
            return {
              message: `Tour 1 terminé sans preneur. Passage au tour 2.`,
              partieId: manche.partieId,
            };
          } else {
            //Tour 2 terminé sans preneur -> UC14 Relancer donne
            const relance = await this.mancheService.relancerMancheByMancheId(
              manche.id,
            );
            return {
              message: `Personne n'a pris au tour 2. Donne relancée (UC14).`,
              newMancheId: relance.newMancheId, // service renvoie { newMancheId, numero }
              numero: relance.numero,
              partieId: manche.partieId,
            };
          }
        } else {
          // Continuer dans le même tour
          await tx.manche.update({
            where: { id: mancheId },
            data: { joueurActuelId: nextPlayerId },
          });
          this.startBiddingTimer(partieId, mancheId, nextPlayerId)
          return {
            message: `Pass. Joueur suivant: ${nextPlayerId}.`,
            partieId: manche.partieId,
          };
        }
      },
      { isolationLevel: 'Serializable' },
    );

    // === Post-transaction side effects ===
    // Si les enchères viennent de se terminer, on informe tout le monde et on démarre le timer de JEU
    if ((res as any)?._biddingEnded && res.partieId && res.mancheId && res.preneurId) {
      // 1) prévenir le front que les enchères sont finies
      this.rt.emitToPartie(res.partieId, 'bidding:ended', {
        mancheId: res.mancheId,
        atoutId: res.atoutId,
        preneurId: res.preneurId,
      });

      // 2) annoncer le premier joueur de JEU (le preneur)
      this.rt.emitToPartie(res.partieId, 'turn:state', {
        mancheId: res.mancheId,
        joueurActuelId: res.preneurId,
      });

      // 3) démarrer le timer de JEU (pas d’enchère) côté serveur
      this.playService.armPlayTimer(res.partieId, res.mancheId, res.preneurId);
    }

    return res;
  }
  // Utils
  private nextPlayerId(
    seats: { seat: number; joueurId: number }[],
    currentPlayerId: number,
  ) {
    const cur = seats.find((s) => s.joueurId === currentPlayerId)!;
    const nextSeat = (cur.seat + 1) % 4;
    return seats[nextSeat].joueurId;
  }
  private async completeDistributionAfterTake(
    tx: Prisma.TransactionClient,
    manche: any,
    preneurId: number,
  ) {
    // Récup des infos nécessaire à la distrib finale
    const m = await tx.manche.findUnique({
      where: { id: manche.id },
      include: {
        partie: { include: { equipes: { include: { joueurs: true } } } },
      },
    });
    if (!m) throw new NotFoundException(`Manche ${manche.id} introuvable.`);

    const seats = m.partie.equipes
      .flatMap((eq) =>
        eq.joueurs.map((j) => ({ seat: j.ordreSiege, joueurId: j.joueurId })),
      )
      .sort((a, b) => a.seat - b.seat);

    //Comptes actuels (devraient être 5 partout)
    const counts = Object.fromEntries(
      await Promise.all(
        seats.map(async (s) => {
          const c = await tx.main.count({
            where: { mancheId: m.id, joueurId: s.joueurId },
          });
          return [s.joueurId, c];
        }),
      ),
    );
    //Reste du paquet après index 21 (0 à 19 distribuées, 20 est retournée)
    const remaining = m.paquet.slice(21); //11 cartes

    //Donner la carte retournée au preneur
    const ops: Prisma.PrismaPromise<any>[] = [];
    ops.push(
      tx.main.create({
        data: {
          joueurId: preneurId,
          mancheId: m.id,
          carteId: m.carteRetourneeId!,
          jouee: false,
        },
      }),
    );
    counts[preneurId] += 1;

    /**
     * Nombre de cartes à donner encore à chacun
     * preneur : +2 (en plus de la carte retournée)
     * autre: +3
     */
    const needs: Record<number, number> = {};
    seats.forEach((s) => {
      needs[s.joueurId] =
        s.joueurId === preneurId
          ? 8 - counts[s.joueurId]
          : 8 - counts[s.joueurId];
      //Comme counts vaut 6 pour le preneur après la carte retournée, needs = 2; pour les autres counts =5 -> needs = 3
    });

    //Répartition simple (ordre des seats, on parcourt remaining)
    let idx = 0;
    for (const s of seats) {
      const toGive = needs[s.joueurId];
      for (let k = 0; k < toGive; k++) {
        const carteId = remaining[idx++];
        ops.push(
          tx.main.create({
            data: {
              joueurId: s.joueurId,
              mancheId: m.id,
              carteId,
              jouee: false,
            },
          }),
        );
      }
    }
    await Promise.all(ops);
  }
  private async relancerDonne(
    tx: Prisma.TransactionClient,
    manche: { id: number },
  ) {
    // Simplification MVP : on marque la manche comme "échouée", on crée une nouvelle manche avec donneur suivant,
    // on redistribue 5 cartes + 1 retournée, et on reset l'état d'enchère.
    // Ici, on applique la même logique que UC14 prévue, en version courte.

    //Charger partie + sièges
    const m = await tx.manche.findUnique({
      where: { id: manche.id },
      include: {
        partie: {
          include: { equipes: { include: { joueurs: true } }, lobby: true },
        },
      },
    });
    if (!m) throw new NotFoundException(`Manche ${manche.id} introuvable.`);

    const seats = m.partie.equipes
      .flatMap((eq) =>
        eq.joueurs.map((j) => ({ seat: j.ordreSiege, joueurId: j.joueurId })),
      )
      .sort((a, b) => a.seat - b.seat);

    //Donneur suivant
    const dealerSeat = seats.find(
      (s) => s.joueurId === (m.donneurJoueurId as number),
    )!.seat;
    const nextDealerId = seats[(dealerSeat + 1) % 4].joueurId;
    const leftOfDealerId = seats[(dealerSeat + 2) % 4].joueurId; // à gauche du nouveau donneur

    // Marquer la manche actuelle comme "échouée" (pas de champ status -> on se contente de la laisser et on repart)
    // Nouveau paquet
    const cartes = await tx.carte.findMany();
    const paquet = [...cartes].sort(() => Math.random() - 0.5);
    const paquetIds = paquet.map((c) => c.id);
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
      orderBy: [{ numero: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
      select: { id: true, numero: true },
    });
    if (!m)
      throw new NotFoundException(`Aucune manche pour la partie ${partieId}`);
    return m;
  }
  async getSeatsForManche(mancheId: number) {
    const manche = await this.prisma.manche.findUnique({
      where: { id: mancheId },
      select: { partieId: true },
    });
    if (!manche) throw new NotFoundException(`Manche ${mancheId} introuvable.`);

    const seats = await this.prisma.equipeJoueur.findMany({
      where: { equipe: { partieId: manche.partieId } },
      include: { joueur: { select: { id: true, username: true } } },
      orderBy: { ordreSiege: 'asc' }, // 0..3
    });

    return seats.map((s) => ({
      seat: s.ordreSiege,
      joueurId: s.joueurId,
      username: s.joueur.username,
    }));
  }

  private clearBiddingTimer(partieId: number) {
    const t = this.biddingTimers.get(partieId);
    if (t) {
      clearTimeout(t);
      this.biddingTimers.delete(partieId);
    }
  }

  private startBiddingTimer(partieId: number, mancheId: number, joueurId: number) {
    this.clearBiddingTimer(partieId);
    const deadline = Date.now() + TURN_TIMEOUT_MS;
    this.rt.emitTurnDeadline(partieId, {
      mancheId, joueurId, phase: 'bidding', deadlineTs: deadline, remainingMs: TURN_TIMEOUT_MS,
    });

    const handle = setTimeout(async () => {
      try {
        // petite grâce
        await new Promise(r => setTimeout(r, TURN_GRACE_MS));

        // ✅ Re-check: on NE lit PAS un "manche.statut" (qui n'existe pas chez toi).
        // On valide seulement que c'est TOUJOURS au même joueur ET que la partie est encore en cours.
        const m = await this.prisma.manche.findUnique({
          where: { id: mancheId },
          select: {
            joueurActuelId: true,
            partie: { select: { statut: true } },
          },
        });
        if (!m) return;
        if (m.partie.statut !== 'en_cours') return;
        if (m.joueurActuelId !== joueurId) return;

        // log UI
        this.rt.emitTurnTimeout(partieId, { mancheId, joueurId, phase: 'bidding' });
        await this.prisma.playerEvent.create({
          data: {
            joueurId,
            partieId,
            mancheId,
            type: 'TURN_TIMEOUT',
          },
        })

        // 👉 auto-PASS
        await this.placeBid(mancheId, joueurId, { type: BidType.PASS }, true /* isAuto */)

        // 💡 IMPORTANT (chemin "timer"): diffuser l'état mis à jour à toute la table,
        // car ici on ne passe PAS par le gateway.
        const updated = await this.getState(mancheId);
        this.rt.emitToPartie(partieId, 'bidding:state', {
          mancheId: updated.mancheId,
          joueurActuelId: updated.joueurActuelId,
          tourActuel: updated.tourActuel as 1 | 2,
          encheres: updated.historique.map((e) => ({
            joueurId: e.joueur.id,
            type: e.type,
            couleurAtoutId: e.couleurAtoutId ?? undefined,
            encherePoints: undefined,
            createdAt: e.at.toISOString(),
          })),
          carteRetournee: updated.carteRetournee
            ? {
              id: updated.carteRetournee.id,
              valeur: updated.carteRetournee.valeur,
              couleurId: updated.carteRetournee.couleurId,
            }
            : null,
        });

        // streak
        const count = this.gameService.incTimeout(partieId, joueurId);
        if (count >= 2) {
          await this.gameService.abandonPartie(partieId, joueurId);
          this.clearBiddingTimer(partieId);
          await this.prisma.playerEvent.create({
            data: {
              joueurId,
              partieId,
              mancheId,
              type: 'ABANDON_TRIGGERED',
            },
          })
          return;
        }

        // 👉 Le timer du joueur suivant est relancé par placeBid() lui-même
        // (on n’enchaîne pas ici pour éviter les doublons).
      } catch (e) {
        console.error('[BiddingTimer] auto-pass error', e);
      }
    }, TURN_TIMEOUT_MS);

    this.biddingTimers.set(partieId, handle);
  }

  public async armBiddingTimerForManche(mancheId: number) {
    const m = await this.prisma.manche.findUnique({
      where: { id: mancheId },
      select: { partieId: true, preneurId: true, joueurActuelId: true, partie: { select: { statut: true } } },
    });
    if (!m) return;
    if (m.partie.statut !== 'en_cours') return; // ✅ check sur la partie, pas la manche
    if (m.preneurId) return; // plus en enchères
    if (!m.joueurActuelId) return;

    this.startBiddingTimer(m.partieId, mancheId, m.joueurActuelId);
  }

}
