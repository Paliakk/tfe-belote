import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { RulesService } from './services/rules.service';
import { Prisma } from '@prisma/client';
import { TrickService } from './services/trick.service';
import { MancheService } from 'src/manche/manche.service';
import { PartieGuard } from 'src/common/guards/partie.guard';
import { GameService } from 'src/game/game.service';
import { RealtimeService } from 'src/realtime/realtime.service';
import { PlayQueriesService } from './play.queries';
import { GameEvent } from 'src/realtime/ws-events';


const TURN_TIMEOUT_MS = Number(process.env.TURN_TIMEOUT_MS ?? 20000);
const TURN_GRACE_MS = Number(process.env.TURN_GRACE_MS ?? 200);


@Injectable()
export class PlayService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rules: RulesService,
    private readonly trick: TrickService,
    private readonly mancheService: MancheService,
    private readonly partieGuard: PartieGuard,
    private readonly gameService: GameService,
    private readonly rt: RealtimeService,
    private readonly queries: PlayQueriesService,
  ) { }

  private playTimers = new Map<number, NodeJS.Timeout>(); // clé: partieId
  private playDeadlines = new Map<number, { mancheId: number; joueurId: number; deadlineTs: number }>();
  /**
   * UC07 — Jouer une carte
   * - vérifie tour
   * - calcule cartes jouables (UC10)
   * - enregistre la carte dans le pli courant
   * - marque la carte "jouee" dans Main
   * - fait avancer le joueur (sauf si pli complet → UC11 prendra le relais)
   */
  async playCard(mancheId: number, joueurId: number, carteId: number, isAuto = false) {
    await this.partieGuard.ensureEnCoursByMancheId(mancheId);
    let partieIdLocal = 0;

    const result = await this.prisma.$transaction(
      async (tx) => {
        // 0) Charger état nécessaire
        const manche = await tx.manche.findUnique({
          where: { id: mancheId },
          include: {
            partie: { include: { equipes: { include: { joueurs: true } } } },
            mains: { where: { jouee: false }, include: { carte: true } },
            plis: {
              orderBy: { numero: 'asc' },
              include: {
                cartes: { orderBy: { ordre: 'asc' }, include: { carte: true } },
              },
            },
          },
        });
        if (!manche)
          throw new NotFoundException(`Manche ${mancheId} introuvable.`);
        if (manche.joueurActuelId !== joueurId) {
          throw new ForbiddenException(
            `Ce n'est pas au joueur ${joueurId} de jouer.`,
          );
        }
        const partieId = manche.partieId; // on en aura besoin plus tard
        partieIdLocal = partieId;

        // Le joueur (ou auto-play) vient d'agir → on coupe le timer courant
        this.clearPlayTimer(partieId);
        if (!isAuto) {
          this.gameService.resetTimeout(partieId, joueurId);
        }

        const mainJoueur = manche.mains
          .filter((m) => m.joueurId === joueurId)
          .map((m) => m.carte);
        if (mainJoueur.length === 0) {
          throw new BadRequestException(
            `Le joueur ${joueurId} n'a plus de carte disponible.`,
          );
        }

        const carte = mainJoueur.find((c) => c.id === carteId);
        if (!carte)
          throw new BadRequestException(
            `La carte ${carteId} n'est pas dans la main du joueur.`,
          );

        const seats = manche.partie.equipes
          .flatMap((eq) =>
            eq.joueurs.map((j) => ({
              seat: j.ordreSiege,
              joueurId: j.joueurId,
              team: ((j.ordreSiege % 2 === 0) ? 1 : 2) as 1 | 2,
            })),
          )
          .sort((a, b) => a.seat - b.seat);

        // Pli courant (dernier incomplet) ou création
        let pli = this.findCurrentTrick(manche);
        if (!pli || pli.cartes.length >= 4) {
          const numero = (manche.plis.length || 0) + 1;
          pli = await tx.pli.create({ data: { mancheId, numero } });
          pli = (await tx.pli.findUnique({
            where: { id: pli.id },
            include: {
              cartes: { orderBy: { ordre: 'asc' }, include: { carte: true } },
            },
          })) as any;
        }

        // UC10 — légalité de la carte
        const trickCards = await Promise.all(
          pli.cartes.map(async (pc) => ({
            ordre: pc.ordre,
            joueurId: (await this.findPlayerIdByPliCarte(tx, pc.id))!,
            carte: pc.carte,
          })),
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
          throw new BadRequestException(
            'Carte illégale selon UC10 (fournir/couper/surcouper).',
          );
        }

        // 1) Insérer la carte dans le pli
        const ordre = pli.cartes.length; // 0..3
        await tx.pliCarte.create({
          data: { pliId: pli.id, joueurId, carteId, ordre },
        });

        // 2) Marquer la carte "jouée"
        await tx.main.updateMany({
          where: { joueurId, mancheId, carteId, jouee: false },
          data: { jouee: true },
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
          const hasTrumpK = mainJoueur.some(
            (c) => c.couleurId === atoutId && isK(c.valeur),
          );
          const hasTrumpQ = mainJoueur.some(
            (c) => c.couleurId === atoutId && isQ(c.valeur),
          );

          if (hasTrumpK && hasTrumpQ) {
            // 2) A-t-il déjà joué l'une des deux auparavant ?
            const alreadyPlayedCount = await tx.pliCarte.count({
              where: {
                joueurId,
                pli: { mancheId },
                carte: {
                  couleurId: atoutId,
                  valeur: { in: ['Roi', 'Dame', 'roi', 'dame', 'K', 'Q'] },
                },
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
          include: { cartes: { orderBy: { ordre: 'asc' } } },
        });
        const cartesCount = nowPli!.cartes.length;

        if (cartesCount < 4) {
          const nextPlayerId = this.nextPlayerId(seats, joueurId);
          await tx.manche.update({
            where: { id: mancheId },
            data: { joueurActuelId: nextPlayerId },
          });

          return {
            message: 'Carte jouée.',
            pliNumero: nowPli!.numero,
            cartesDansPli: cartesCount,
            nextPlayerId,
            requiresEndOfTrick: false, // (flag lu après le tx)
            beloteEvent,
          };
        } else {
          // Pli complet → on ne clôture pas ici
          return {
            message: 'Carte jouée (pli complet).',
            pliNumero: nowPli!.numero,
            cartesDansPli: cartesCount,
            nextPlayerId: null,
            requiresEndOfTrick: true, // (flag lu après le tx)
            beloteEvent,
          };
        }
      },
      { isolationLevel: 'Serializable' },
    );

    // déclenchement automatique UC11 (après le tx)
    if (result.requiresEndOfTrick) {
      const closed = await this.trick.closeCurrentTrick(mancheId);

      // Après fermeture du pli, si la manche est toujours ACTIVE et qu’un joueur doit jouer,
      // on redémarre le timer sur le joueurCourant (défini par UC11).
      const m = await this.prisma.manche.findUnique({
        where: { id: mancheId },
        select: { partieId: true, statut: true, joueurActuelId: true },
      });
      if (m && m.statut === 'active' && m.joueurActuelId) {
        // ➜ notifier l’UI + relancer le timer du joueur suivant
        this.afterTurnAdvanced(m.partieId, mancheId, m.joueurActuelId);
      }
      // Si la manche s’est terminée (8e pli -> UC12), pas de timer ici.

      return {
        ...closed,
        beloteEvent: (result as any).beloteEvent ?? null,
      };
    }

    // Sinon on renvoie l’info UC07 classique
    if (!result.requiresEndOfTrick && result.nextPlayerId) {
      // ➜ notifier l’UI + relancer le timer du joueur suivant
      this.afterTurnAdvanced(partieIdLocal, mancheId, result.nextPlayerId);
    }
    return result;
  }

  private findCurrentTrick(manche: any) {
    const plis = (manche.plis || []).sort((a, b) => a.numero - b.numero);
    if (plis.length === 0) return null;
    const last = plis[plis.length - 1];
    if (last.cartes.length < 4) return last;
    return null;
  }

  private async findPlayerIdByPliCarte(
    tx: Prisma.TransactionClient,
    pliCarteId: number,
  ) {
    const pc = await tx.pliCarte.findUnique({
      where: { id: pliCarteId },
      select: { joueurId: true },
    });
    return pc?.joueurId ?? null;
  }

  private nextPlayerId(
    seats: { seat: number; joueurId: number }[],
    currentId: number,
  ) {
    const idx = seats.findIndex((s) => s.joueurId === currentId);
    const next = seats[(idx + 1) % 4];
    return next.joueurId;
  }

  private clearPlayTimer(partieId: number) {
    const t = this.playTimers.get(partieId);
    if (t) {
      clearTimeout(t);
      this.playTimers.delete(partieId);
    }
    // 🧹 enlève aussi la deadline mémorisée
    this.playDeadlines.delete(partieId);
  }

  private async autoPlayRandom(mancheId: number, joueurId: number) {
    // 1) Charger tout ce qu’il faut pour construire l’input de RulesService.playableCards(...)
    const manche = await this.prisma.manche.findUnique({
      where: { id: mancheId },
      include: {
        couleurAtout: true,
        mains: { where: { joueurId, jouee: false }, include: { carte: true } },
        plis: {
          orderBy: { numero: 'asc' },
          include: {
            cartes: {
              orderBy: { ordre: 'asc' },
              // ⛔️ AVANT : include + select en même temps -> crash Prisma
              // include: { carte: true },
              // select: { id: true, ordre: true, joueurId: true, carte: true },

              // ✅ APRÈS : un seul 'select' qui inclut la carte complète
              select: { ordre: true, joueurId: true, carte: true },
            },
          },
        },
        partie: { include: { equipes: { include: { joueurs: true } } } },
      },
    });
    if (!manche) return; // manche disparue

    // 2) Seats 0..3
    const seats = manche.partie.equipes
      .flatMap(eq =>
        eq.joueurs.map(j => ({
          seat: j.ordreSiege,
          joueurId: j.joueurId,
          team: ((j.ordreSiege % 2 === 0) ? 1 : 2) as 1 | 2, // 👈 AJOUT
        })),
      )
      .sort((a, b) => a.seat - b.seat);

    // 3) Pli courant = dernier pli incomplet (cartes < 4), sinon aucun pli en cours
    const plis = (manche.plis || []).sort((a, b) => a.numero - b.numero);
    const curPli = plis.length ? plis[plis.length - 1] : null;
    const isIncomplete = !!curPli && curPli.cartes.length < 4;

    // 4) Construire les paramètres attendus par RulesService.playableCards
    const params = {
      hand: (manche.mains || []).map(m => m.carte),                                   // Carte[]
      trickCards: isIncomplete
        ? curPli!.cartes.map(pc => ({ ordre: pc.ordre, joueurId: pc.joueurId, carte: pc.carte })) // TrickCard[]
        : [],                                                                           // aucun pli en cours
      atoutId: manche.couleurAtoutId ?? null,
      seats,                                                                            // {seat, joueurId}[]
      currentPlayerId: joueurId,
    };

    // 5) Appeler la règle et normaliser la sortie
    const playableRes = await this.rules.playableCards(params);

    let ids: number[] = [];
    if (Array.isArray(playableRes)) {
      ids = playableRes as number[];
    } else if (Array.isArray((playableRes as any)?.ids)) {
      ids = (playableRes as any).ids;
    } else if (Array.isArray((playableRes as any)?.carteIds)) {
      ids = (playableRes as any).carteIds;
    } else if (Array.isArray((playableRes as any)?.cartes)) {
      ids = (playableRes as any).cartes.map((c: any) => c?.id).filter(Boolean);
    }

    // 6) Fallback / 7) Choix aléatoire
    const pick = ids.length
      ? ids[Math.floor(Math.random() * ids.length)]
      : null;

    if (!pick) {
      const any = await this.prisma.main.findFirst({
        where: { mancheId, joueurId, jouee: false },
        select: { carteId: true },
      });
      if (!any) return;
      const res = await this.playCard(mancheId, joueurId, any.carteId, true);
      // 🔔 NEW: diffuser l’état comme le ferait le gateway
      await this.broadcastAfterAutoPlay(mancheId, joueurId, res);
      return;
    }

    const res = await this.playCard(mancheId, joueurId, pick, true);
    // 🔔 NEW: diffuser l’état comme le ferait le gateway
    await this.broadcastAfterAutoPlay(mancheId, joueurId, res);
  }
  private startPlayTimer(partieId: number, mancheId: number, joueurId: number) {
    this.clearPlayTimer(partieId);
    const deadline = Date.now() + TURN_TIMEOUT_MS;

    // 🔴 ENREGISTRE la deadline côté serveur
    this.playDeadlines.set(partieId, { mancheId, joueurId, deadlineTs: deadline });

    this.rt.emitTurnDeadline(partieId, {
      mancheId, joueurId, phase: 'play', deadlineTs: deadline, remainingMs: TURN_TIMEOUT_MS,
    });

    const handle = setTimeout(async () => {
      try {
        await new Promise(r => setTimeout(r, TURN_GRACE_MS));

        const m = await this.prisma.manche.findUnique({
          where: { id: mancheId },
          select: { joueurActuelId: true, partieId: true, statut: true },
        });
        if (!m || m.statut !== 'active' || m.joueurActuelId !== joueurId) return;

        this.rt.emitTurnTimeout(partieId, { mancheId, joueurId, phase: 'play' });

        // 1) Compter le timeout
        const count = this.gameService.incTimeout(partieId, joueurId);

        // 2) 🛑 Si c'est le 2e -> abandon immédiat (ne tente pas d'auto-play)
        if (count >= 2) {
          await this.gameService.abandonPartie(partieId, joueurId);
          this.clearPlayTimer(partieId);
          return;
        }

        // 3) Sinon, tenter l’auto-play (et ignorer l’erreur éventuelle)
        try {
          await this.autoPlayRandom(mancheId, joueurId);
        } catch (e) {
          console.error('[PlayTimer] auto-play error (ignored)', e);
        }

        // 4) Re-synchroniser
        const m2 = await this.prisma.manche.findUnique({
          where: { id: mancheId },
          select: { joueurActuelId: true, partieId: true, statut: true },
        });
        if (m2 && m2.statut === 'active' && m2.joueurActuelId) {
          this.afterTurnAdvanced(m2.partieId, mancheId, m2.joueurActuelId);
        }
      } catch (e) {
        console.error('[PlayTimer] timeout handler error', e);
      }
    }, TURN_TIMEOUT_MS);

    this.playTimers.set(partieId, handle);
  }

  /** Émet l'état de tour et relance le timer pour le joueur suivant. */
  private afterTurnAdvanced(partieId: number, mancheId: number, nextPlayerId: number) {
    // informe tous les clients de la partie
    this.rt.emitToPartie(partieId, 'turn:state', { mancheId, joueurActuelId: nextPlayerId });
    // (optionnel) on peut pousser un score live ici si tu en as un service dédié
    // relancer le timer pour le nouveau joueur
    this.startPlayTimer(partieId, mancheId, nextPlayerId);
    this.rt.emitToPartie(partieId, 'debug:server', { ev: 'turn:state', mancheId, next: nextPlayerId });
  }

  public armPlayTimer(partieId: number, mancheId: number, joueurId: number) {
    // petite sécurité: si un autre timer tourne pour cette partie, on le remplace
    this.startPlayTimer(partieId, mancheId, joueurId);
  }

  public stopTimersForPartie(partieId: number) {
    this.clearPlayTimer(partieId);
    // 🧹 bonus: purge les compteurs d’AFK sur fin “technique”
    this.gameService.clearTimeoutsForPartie(partieId);
  }
  public isTurnExpired(partieId: number, mancheId: number, joueurId: number): boolean {
    const meta = this.playDeadlines.get(partieId);
    if (!meta) return false;
    if (meta.mancheId !== mancheId) return false;
    if (meta.joueurId !== joueurId) return false;
    return Date.now() > meta.deadlineTs;
  }
  public getTurnDeadline(partieId: number) {
    return this.playDeadlines.get(partieId) ?? null;
  }
  private async broadcastAfterAutoPlay(
    mancheId: number,
    joueurId: number,
    result: any, // PlayCardResult
  ) {
    const m = await this.prisma.manche.findUnique({
      where: { id: mancheId },
      select: { partieId: true, joueurActuelId: true },
    });
    if (!m) return;
    const { partieId } = m;

    // a) Tapis courant
    const trick = await this.queries.getActiveTrick(mancheId);
    this.rt.emitToPartie(partieId, GameEvent.TrickState, trick);

    // b) Main MAJ du joueur (AFK) qui vient d’auto-jouer
    const myCards = await this.prisma.main.findMany({
      where: { mancheId, joueurId, jouee: false },
      include: { carte: true },
      orderBy: { id: 'asc' },
    });
    this.rt.emitHandTo(joueurId, {
      mancheId,
      cartes: myCards.map(m => ({
        id: m.carteId,
        valeur: m.carte.valeur,
        couleurId: m.carte.couleurId,
      })),
    });

    // c) Si le pli s’est fermé → dernier pli + score live
    const trickClosed =
      ('requiresEndOfHand' in result && result.requiresEndOfHand) ||
      ('createdNextTrick' in result && result.createdNextTrick) ||
      /pli.+clôtur/i.test(result?.message ?? '');

    if (trickClosed) {
      const prev = await this.trick.previousTrick(mancheId);
      if (prev?.cartes?.length) {
        this.rt.emitToPartie(partieId, GameEvent.TrickClosed, {
          cartes: prev.cartes,
          gagnantId: prev.gagnantId,
          numero: prev.numero,
        });
      }
      const live = await this.trick.scoreLive(mancheId);
      this.rt.emitToPartie(partieId, GameEvent.ScoreLive, live);
    }

    // d) (optionnel) Jouables du prochain — tu peux t’en passer car le front
    // demande déjà play:getPlayable en réception de turn:state.
    // Si tu veux pousser pro-activement :
    if (m.joueurActuelId) {
      const nextId = m.joueurActuelId;
      const playableNextRaw = await this.queries.getPlayable(mancheId, nextId);
      const nextIds = Array.isArray((playableNextRaw as any)?.playableIds)
        ? (playableNextRaw as any).playableIds
        : [];
      if (nextIds.length) {
        this.rt.emitToJoueur(nextId, GameEvent.PlayPlayable, { carteIds: nextIds });
      }
    }
  }
}
