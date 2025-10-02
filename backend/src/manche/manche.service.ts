import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PartieGuard } from 'src/common/guards/partie.guard';
import { PrismaService } from 'src/prisma/prisma.service';
import { ScoreResultDto } from 'src/score/dto/score-result.dto';
import { ScoreService } from 'src/score/score.service';
import { GameService } from 'src/game/game.service'; // 👈 NEW

@Injectable()
export class MancheService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly score: ScoreService,
    private readonly partieGuard: PartieGuard,
    private readonly gameService: GameService, // 👈 NEW
  ) { }

  // ---------------------------------------------------------------------------
  // 🔁 Helper retry pour les transactions conflictuelles
  // ---------------------------------------------------------------------------
  private async runWithRetry<T>(
    fn: () => Promise<T>,
    retries = 2,
    backoffMs = 80,
  ): Promise<T> {
    try {
      return await fn();
    } catch (e: any) {
      // Prisma P2034: transaction conflict / deadlock
      if (
        retries > 0 &&
        (e.code === 'P2034' || /write conflict|deadlock/i.test(e.message ?? ''))
      ) {
        await new Promise((r) => setTimeout(r, backoffMs));
        return this.runWithRetry(fn, retries - 1, backoffMs * 2);
      }
      throw e;
    }
  }

  // ---------------------------------------------------------------------------
  // 🔧 Normalisation du +10 "Dix de Der" (affichage base/bonus cohérent)
  // ---------------------------------------------------------------------------
  private normalizeDixDeDer(payload: ScoreResultDto): ScoreResultDto {
    const fix = (s: ScoreResultDto['scores'][number]) => {
      const dixBonus = (s.detailsBonus || [])
        .filter((b) => (b.type as any) === 'dix_de_der')
        .reduce((sum, b) => sum + (b.points ?? 0), 0);

      if (dixBonus <= 0) return s;

      // Si la base contient le +10, alors base + bonus == total + 10
      const baseInclutDix = s.pointsBase + s.bonus === s.total + dixBonus;

      const pointsBaseCorr = baseInclutDix
        ? Math.max(0, s.pointsBase - dixBonus)
        : s.pointsBase;
      const totalCorr = pointsBaseCorr + s.bonus;

      return { ...s, pointsBase: pointsBaseCorr, total: totalCorr };
    };

    const [s1, s2] = payload.scores;
    const fixed: typeof payload.scores = [fix(s1), fix(s2)];
    return { ...payload, scores: fixed };
  }

  // ---------------------------------------------------------------------------
  // 🔁 UC14 — Relancer une donne par son ID (idempotent)
  // ---------------------------------------------------------------------------
  async relancerMancheByMancheId(mancheId: number) {
    await this.partieGuard.ensureEnCoursByMancheId(mancheId);
    return this.prisma.$transaction(
      async (tx: Prisma.TransactionClient) => {
        const m = await tx.manche.findUnique({
          where: { id: mancheId },
          include: {
            partie: {
              include: { equipes: { include: { joueurs: true } }, lobby: true },
            },
            carteRetournee: true,
          },
        });
        if (!m) throw new NotFoundException(`Manche ${mancheId} introuvable.`);
        if (m.partie.statut !== 'en_cours')
          throw new BadRequestException(`La partie n'est pas en cours.`);

        // Vérifier que c'est la manche courante
        const latest = await tx.manche.findFirst({
          where: { partieId: m.partieId },
          orderBy: [{ numero: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
          select: { id: true },
        });
        if (latest?.id !== m.id) {
          throw new BadRequestException(`Cette manche n'est pas la manche active.`);
        }

        // 1) Marquer l'ancienne manche 'relancee' si encore active
        if (m.statut === 'active') {
          await tx.manche.update({
            where: { id: m.id },
            data: { statut: 'relancee' },
          });
        }

        // 2) Sièges 0..3
        const seats = m.partie.equipes
          .flatMap((eq) =>
            eq.joueurs.map((j) => ({
              seat: j.ordreSiege,
              joueurId: j.joueurId,
            })),
          )
          .sort((a, b) => a.seat - b.seat);

        const dealerSeat = seats.find(s => s.joueurId === (m.donneurJoueurId as number))!.seat;
        const nextDealerSeat = (dealerSeat + 1) % 4;
        const nextDealerId = seats[nextDealerSeat].joueurId;
        const leftOfNewDealerId = seats[(nextDealerSeat + 1) % 4].joueurId;
        // 3) Nouveau paquet + carte retournée(index 20)
        const cartes = await tx.carte.findMany();
        const paquet = [...cartes].sort(() => Math.random() - 0.5);
        const paquetIds = paquet.map((c) => c.id);
        const carteRetournee = paquet[20];

        // 4) Créer la nouvelle manche
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
            statut: 'active',
          },
        });

        // 5) Distribuer 5 cartes par joueur
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

        // 6) Mettre à jour la partie (pointeur manche courante)
        await tx.partie.update({
          where: { id: m.partieId },
          data: { mancheCouranteId: newManche.id },
        });

        // TODO: WS 'donne:relancee' + 'donne:cree'

        return { newMancheId: newManche.id, numero: newManche.numero, partieId: m.partieId, joueurActuelId: leftOfNewDealerId };
      },
      { isolationLevel: 'Serializable' },
    );
  }

  // Variante: relancer via partieId
  async relancerMancheByPartieId(partieId: number) {
    const latest = await this.prisma.manche.findFirst({
      where: { partieId },
      orderBy: [{ numero: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
      select: { id: true },
    });
    if (!latest)
      throw new NotFoundException(`Aucune manche pour la partie ${partieId}`);
    return this.relancerMancheByMancheId(latest.id);
  }

  // ---------------------------------------------------------------------------
  // ✅ UC12 — Fin de manche (idempotent) + déclenchement UC13 (fin de partie)
  // ---------------------------------------------------------------------------
  /**
   * - Vérifie 8 plis terminés
   * - Si ScoreManche déjà présent -> renvoie l'existant + cumul
   * - Sinon appelle UC09 (ScoreService), marque la manche 'terminee', calcule les cumuls
   * - Si seuil atteint (partie.scoreMax), déclenche UC13 via GameService après la transaction :
   *   fin de partie + retour automatique au lobby d'origine.
   */
  async endOfHand(mancheId: number) {
    const result = await this.runWithRetry(async () => {
      return this.prisma.$transaction(async (tx) => {
        const manche = await tx.manche.findUnique({
          where: { id: mancheId },
          include: {
            partie: { include: { equipes: { include: { joueurs: true } } } },
            plis: { select: { id: true, numero: true, gagnantId: true } },
            donneur: true,
          },
        });
        if (!manche)
          throw new NotFoundException(`Manche ${mancheId} introuvable.`);
        if (!manche.partie)
          throw new BadRequestException(`Manche ${mancheId}: partie introuvable.`);
        if (manche.plis.length !== 8 || manche.plis.some((p) => !p.gagnantId)) {
          throw new BadRequestException(
            `Manche ${mancheId}: les 8 plis doivent être terminés.`,
          );
        }

        // Idempotence: si ScoreManche existe déjà pour cette manche, retourner les infos existantes
        const existingScores = await tx.scoreManche.findMany({
          where: { mancheId },
          include: { bonus: true },
          orderBy: { equipeId: 'asc' },
        });

        let scorePayload: ScoreResultDto;
        if (existingScores.length === 2) {
          // 1) On récupère les deux équipes (pour l’ordre 1 puis 2)
          const equipes = await tx.equipe.findMany({
            where: { partieId: manche.partieId },
            select: { id: true, numero: true },
          });
          const sorted = equipes.sort((a, b) => a.numero - b.numero);
          const team1 = existingScores.find(
            (s) => s.equipeId === sorted[0].id,
          )!;
          const team2 = existingScores.find(
            (s) => s.equipeId === sorted[1].id,
          )!;

          // Calcul du preneurEquipeId (fallback)
          const preneurEquipeId =
            manche.preneurId == null
              ? null
              : ((
                await tx.equipeJoueur.findFirst({
                  where: {
                    joueurId: manche.preneurId,
                    equipe: { partieId: manche.partieId },
                  },
                  select: { equipeId: true },
                })
              )?.equipeId ?? null);

          // Payload reconstruit
          scorePayload = {
            mancheId,
            preneurId: manche.preneurId ?? null,
            preneurEquipeId,
            scores: [
              {
                equipeId: team1.equipeId,
                pointsBase: 0,
                bonus: (team1.bonus || []).reduce((s, b) => s + b.points, 0),
                total: team1.points,
                capot: !!(team1.bonus || []).find((b) => b.type === 'capot'),
                detailsBonus: (team1.bonus || []).map((b) => ({
                  type: b.type as any,
                  points: b.points,
                })),
              },
              {
                equipeId: team2.equipeId,
                pointsBase: 0,
                bonus: (team2.bonus || []).reduce((s, b) => s + b.points, 0),
                total: team2.points,
                capot: !!(team2.bonus || []).find((b) => b.type === 'capot'),
                detailsBonus: (team2.bonus || []).map((b) => ({
                  type: b.type as any,
                  points: b.points,
                })),
              },
            ],
            contratReussi: null,
            bonusAppliques: Array.from(
              new Set(
                (team1.bonus || [])
                  .concat(team2.bonus || [])
                  .map((b) => b.type),
              ),
            ) as any,
            scoreMancheIds: [team1.id, team2.id],
          };
          scorePayload = this.normalizeDixDeDer(scorePayload);
        } else {
          // Calculer les scores définitifs via UC09
          scorePayload = await this.score.calculateScoresForManche(mancheId);
          scorePayload = this.normalizeDixDeDer(scorePayload);
        }

        // Marquer 'terminee' si ce n'est pas déjà le cas
        await tx.manche.updateMany({
          where: { id: mancheId, NOT: { statut: 'terminee' } },
          data: { statut: 'terminee' },
        });

        // ---- Cumul partie & décision fin de partie (avec scoreMax dynamique) ----
        const equipes = await tx.equipe.findMany({
          where: { partieId: manche.partieId },
          select: { id: true, numero: true },
        });
        const equipeIdByNumero = new Map<number, number>();
        equipes.forEach((e) => equipeIdByNumero.set(e.numero, e.id));

        const totalsRows = await tx.scoreManche.findMany({
          where: { manche: { partieId: manche.partieId } },
          select: { equipeId: true, points: true },
        });
        const acc = new Map<number, number>();
        totalsRows.forEach((r) =>
          acc.set(r.equipeId, (acc.get(r.equipeId) ?? 0) + r.points),
        );
        const t1 = acc.get(equipeIdByNumero.get(1)!) ?? 0;
        const t2 = acc.get(equipeIdByNumero.get(2)!) ?? 0;

        const scoreMax = manche.partie.scoreMax ?? 301; // 👈 seuil dynamique
        let shouldEndGame = false;
        let winnerTeamNumero: 1 | 2 | undefined;
        let reason: 'reach_threshold' | 'tie_over_threshold' | undefined;

        if (t1 >= scoreMax || t2 >= scoreMax) {
          if (t1 === t2) {
            shouldEndGame = false;
            reason = 'tie_over_threshold';
          } else {
            shouldEndGame = true;
            winnerTeamNumero = t1 > t2 ? 1 : 2;
            reason = 'reach_threshold';
          }
        }

        // NB: On NE modifie PAS ici Partie/Lobby si fin de partie.
        // On laisse GameService orchestrer (statut, retour lobby, WS) APRES la transaction.

        // ---- Préparer un éventuel enchaînement (nextManche) si la partie continue ----
        let nextMancheSummary:
          | {
            id: number;
            numero: number;
            donneurId: number;
            joueurActuelId: number;
            carteRetourneeId: number;
          }
          | undefined;

        if (!shouldEndGame) {
          const seats = manche.partie.equipes
            .flatMap((eq) =>
              eq.joueurs.map((j) => ({
                seat: j.ordreSiege,
                joueurId: j.joueurId,
              })),
            )
            .sort((a, b) => a.seat - b.seat);

          const previousDealerId = manche.donneurJoueurId as number;
          const dealerSeat = seats.find(
            (s) => s.joueurId === previousDealerId,
          )!.seat;
          const nextDealerId = seats[(dealerSeat + 1) % 4].joueurId;
          const leftOfNewDealerId = seats[(dealerSeat + 3) % 4].joueurId;

          const cartes = await tx.carte.findMany();
          const paquet = [...cartes].sort(() => Math.random() - 0.5);
          const paquetIds = paquet.map((c) => c.id);
          const carteRetournee = paquet[20];

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
            },
          });

          const mainsInit = seats.flatMap((s) => {
            const start = s.seat * 5;
            const five = paquet.slice(start, start + 5);
            return five.map((carte) => ({
              joueurId: s.joueurId,
              mancheId: newManche.id,
              carteId: carte.id,
              jouee: false,
            }));
          });
          await tx.main.createMany({ data: mainsInit });

          await tx.partie.update({
            where: { id: manche.partieId },
            data: { mancheCouranteId: newManche.id },
          });

          nextMancheSummary = {
            id: newManche.id,
            numero: newManche.numero,
            donneurId: nextDealerId,
            joueurActuelId: leftOfNewDealerId,
            carteRetourneeId: carteRetournee.id,
          };
        }

        // (on renvoie tout ce qu'il faut pour la couche supérieure)
        return {
          message: 'UC12 – Fin de manche effectuée.',
          mancheId,
          partieId: manche.partieId, // 👈 pour post-traitement
          scores: scorePayload,
          cumule: { team1: t1, team2: t2 },
          decision: {
            shouldEndGame,
            winnerTeamNumero,
            reason,
            totals: { team1: t1, team2: t2 },
            scoreMax, // 👈 info utile
          },
          nextManche: shouldEndGame ? null : (nextMancheSummary ?? null),
          gameOver: shouldEndGame
            ? {
              partieId: manche.partieId,
              winnerTeamNumero,
              totals: { team1: t1, team2: t2 },
              lobbyId: null, // (facultatif) laissé à GameService
            }
            : null,
        };
      });
    });

    // -----------------------------------------------------------------------
    // 🧠 Post-transaction : déclenchement fin de partie + retour lobby
    // -----------------------------------------------------------------------
    if (result?.decision?.shouldEndGame && result?.partieId) {
      await this.gameService.endPartieAndReturnToLobby(result.partieId, {
        winnerTeamNumero: result.decision.winnerTeamNumero as 1 | 2 | undefined,
        totals: result.decision.totals as { team1: number; team2: number } | undefined,
      });
    }

    return result;
  }

  // ---------------------------------------------------------------------------
  // 🔎 Détection Belote "live" (idempotent)
  // ---------------------------------------------------------------------------
  async markBeloteIfNeeded(
    mancheId: number,
    joueurId: number,
    tx?: Prisma.TransactionClient,
  ): Promise<{ applied: boolean }> {
    const db = tx ?? this.prisma;

    const manche = await db.manche.findUnique({
      where: { id: mancheId },
      select: { couleurAtoutId: true, beloteJoueurId: true },
    });
    if (!manche) throw new NotFoundException(`Manche ${mancheId} introuvable.`);
    const atoutId = manche.couleurAtoutId;
    if (!atoutId) return { applied: false };

    if (manche.beloteJoueurId != null) return { applied: false };

    const duo = await db.pliCarte.findMany({
      where: {
        joueurId,
        pli: { mancheId },
        carte: {
          couleurId: atoutId,
          valeur: { in: ['Roi', 'Dame', 'roi', 'dame', 'K', 'Q'] },
        },
      },
      select: { id: true, carte: { select: { valeur: true } } },
    });

    const norm = (v: string) => v.trim().toLowerCase();
    const vals = duo.map((x) => norm(x.carte.valeur));

    const hasRoi = vals.includes('roi') || vals.includes('k');
    const hasDame = vals.includes('dame') || vals.includes('q');

    if (hasRoi && hasDame) {
      await db.manche.update({
        where: { id: mancheId },
        data: { beloteJoueurId: joueurId },
      });
      return { applied: true };
    }

    return { applied: false };
  }
}
