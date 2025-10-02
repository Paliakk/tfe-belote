import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';

type StatsWindow = { from?: Date; to?: Date };
const inRange = (from?: Date, to?: Date) =>
  (!from && !to) ? undefined : { gte: from ?? undefined, lte: to ?? undefined };

type RecentResult = {
  partieId: number;
  createdAt: Date;
  statut: string;                   // 'terminee' | 'abandonnee' | ...
  lobbyId?: number | null;
  myScore: number;
  oppScore: number;
  won: boolean;
};

@Injectable()
export class StatsService {
  constructor(private readonly prisma: PrismaService) { }
  async getRecentResults(joueurId: number, limit = 5): Promise<RecentResult[]> {
    // 1) Parties où il a joué (ordonnées par date décroissante, limitées)
    const eq = await this.prisma.equipeJoueur.findMany({
      where: { joueurId },
      select: { equipe: { select: { partieId: true, partie: true } } },
    });

    // parties triées par createdAt desc, sans doublon
    const uniqueById = new Map<number, { id: number; createdAt: Date; statut: string; lobbyId?: number | null }>();
    for (const x of eq) {
      if (!x?.equipe?.partie) continue;
      const p = x.equipe.partie;
      const prev = uniqueById.get(p.id);
      if (!prev || prev.createdAt < p.createdAt) {
        uniqueById.set(p.id, { id: p.id, createdAt: p.createdAt, statut: p.statut, lobbyId: (p as any).lobbyId ?? null });
      }
    }
    const sorted = Array.from(uniqueById.values())
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, limit);

    if (sorted.length === 0) return [];

    const partieIds = sorted.map(p => p.id);

    // 2) Scores d’équipe par manche -> totals par (partieId, equipeId)
    // On charge les scores des manches des parties concernées
    const scoreRows = await this.prisma.scoreManche.findMany({
      where: { manche: { partieId: { in: partieIds } } },
      select: { equipeId: true, points: true, manche: { select: { partieId: true } } },
    });

    // Reduce: totals[partieId][equipeId] = sum(points)
    const totalsByPartie = new Map<number, Map<number, number>>();
    for (const row of scoreRows) {
      const pid = row.manche.partieId;
      if (!totalsByPartie.has(pid)) totalsByPartie.set(pid, new Map());
      const byTeam = totalsByPartie.get(pid)!;
      byTeam.set(row.equipeId, (byTeam.get(row.equipeId) ?? 0) + row.points);
    }

    const results: RecentResult[] = [];
    for (const meta of sorted) {
      const pid = meta.id;
      const myEquipeId = await this.equipeIdFor(pid, joueurId);
      const byTeam = totalsByPartie.get(pid) ?? new Map<number, number>();
      let myScore = 0, oppScore = 0, won = false;

      if (myEquipeId) {
        myScore = byTeam.get(myEquipeId) ?? 0;
        // premier autre équipeId (il y en a deux normalement)
        const oppEntry = Array.from(byTeam.entries()).find(([eid]) => eid !== myEquipeId);
        oppScore = oppEntry ? oppEntry[1] : 0;

        if (meta.statut === 'abandonnee') {
          // Qui a abandonné ? -> la team opposée gagne
          const ev = await this.prisma.playerEvent.findFirst({
            where: { partieId: pid, type: 'ABANDON_TRIGGERED' },
            orderBy: { createdAt: 'desc' },
            select: { joueurId: true },
          });
          if (ev?.joueurId) {
            const leaverEquipeId = await this.equipeIdFor(pid, ev.joueurId);
            won = !!leaverEquipeId && leaverEquipeId !== myEquipeId;
          } else {
            // si inconnu, considère perdu (ou laisse false)
            won = false;
          }
        } else {
          // Cas normal : compare scores
          won = myScore > oppScore;
        }
      }

      results.push({
        partieId: pid,
        createdAt: meta.createdAt,
        statut: meta.statut,
        lobbyId: meta.lobbyId ?? null,
        myScore,
        oppScore,
        won,
      });
    }

    return results;
  }
  private async equipeIdFor(partieId: number, joueurId: number) {
    const ej = await this.prisma.equipeJoueur.findFirst({
      where: { joueurId, equipe: { partieId } },
      select: { equipeId: true },
    });
    return ej?.equipeId ?? null;
  }

  async getPlayerCoreStats(joueurId: number, win?: StatsWindow) {
    const from = win?.from, to = win?.to;

    // 1) Parties où il a joué
    const eq = await this.prisma.equipeJoueur.findMany({
      where: { joueurId },
      select: { equipe: { select: { partieId: true, partie: true } } },
    });
    const partieIds = eq.map(x => x.equipe.partieId);

    const parties = await this.prisma.partie.findMany({
      where: { id: { in: partieIds }, createdAt: inRange(from, to) },
      select: { id: true, statut: true, createdAt: true },
    });
    const playedParties = parties.length;

    // 2) Victoires / défaites (abandonnées = défaite)
    let wonParties = 0;
    for (const p of parties) {
      const myEquipeId = await this.equipeIdFor(p.id, joueurId);
      if (!myEquipeId) continue;

      // cumul points (inchangé)
      const totals = await this.prisma.scoreManche.groupBy({
        by: ['equipeId'],
        where: { manche: { partieId: p.id } },
        _sum: { points: true },
      });

      if (p.statut === 'abandonnee') {
        // 🔹 Qui a abandonné ? (event)
        const ev = await this.prisma.playerEvent.findFirst({
          where: { partieId: p.id, type: 'ABANDON_TRIGGERED' },
          orderBy: { createdAt: 'desc' },
          select: { joueurId: true },
        });

        // 🔹 fallback: si tu as ajouté Partie.abandonByJoueurId, lis-le ici
        // const partieRow = await this.prisma.partie.findUnique({ where: { id: p.id }, select: { abandonByJoueurId: true } })
        // const leaverId = partieRow?.abandonByJoueurId ?? ev?.joueurId ?? null

        const leaverId = ev?.joueurId ?? null;
        if (leaverId) {
          const leaverEquipeId = await this.equipeIdFor(p.id, leaverId);
          if (leaverEquipeId) {
            // mon équipe a-t-elle abandonné ?
            if (myEquipeId !== leaverEquipeId) {
              wonParties++; // ✅ victoire pour l’équipe adverse
            }
            // sinon: défaite (ne rien ajouter, on comptera plus bas)
            continue;
          }
        }

        // Si on ne sait pas qui a abandonné → ne rien compter comme gagné
        continue;
      }

      // Cas normal (partie finie par le score)
      if (totals.length >= 2) {
        const my = totals.find(t => t.equipeId === myEquipeId)?._sum.points ?? 0;
        const opp = totals.find(t => t.equipeId !== myEquipeId)?._sum.points ?? 0;
        if (my > opp) wonParties++;
      }
    }
    const lostParties = playedParties - wonParties; // inclut “abandonnee”
    const winRate = playedParties ? wonParties / playedParties : 0;

    // 3) Manches terminées dans ces parties
    const manches = await this.prisma.manche.findMany({
      where: {
        partieId: { in: partieIds },
        createdAt: inRange(from, to),
        statut: 'terminee',
      },
      select: {
        id: true, partieId: true, preneurId: true, couleurAtoutId: true, beloteJoueurId: true,
      },
    });
    const mancheIds = manches.map(m => m.id);

    // Map partie -> équipe du joueur
    const myEquipeByPartie = new Map<number, number>();
    for (const pid of partieIds) {
      const eid = await this.equipeIdFor(pid, joueurId);
      if (eid) myEquipeByPartie.set(pid, eid);
    }

    // Points et différentiels
    let sumPoints = 0, sumDiff = 0;
    for (const m of manches) {
      const myEquipeId = myEquipeByPartie.get(m.partieId);
      if (!myEquipeId) continue;
      const rows = await this.prisma.scoreManche.findMany({
        where: { mancheId: m.id },
        select: { equipeId: true, points: true },
      });
      const my = rows.find(r => r.equipeId === myEquipeId)?.points ?? 0;
      const opp = rows.find(r => r.equipeId !== myEquipeId)?.points ?? 0;
      sumPoints += my;
      sumDiff += (my - opp);
    }

    // Plis (dont 8e pli)
    const plisWon = await this.prisma.pli.count({
      where: { gagnantId: joueurId, mancheId: { in: mancheIds } },
    });
    const lastTricksWon = await this.prisma.pli.count({
      where: { gagnantId: joueurId, mancheId: { in: mancheIds }, numero: 8 },
    });

    // Prises tentées & réussite + points moyens preneur / non-preneur
    let takesAttempted = 0, takesSucceeded = 0;
    let takerPoints = 0, takerCount = 0, nonTakerPoints = 0, nonTakerCount = 0;

    for (const m of manches) {
      const myEquipeId = myEquipeByPartie.get(m.partieId);
      if (!myEquipeId) continue;

      const rows = await this.prisma.scoreManche.findMany({
        where: { mancheId: m.id },
        select: { equipeId: true, points: true },
      });
      const my = rows.find(r => r.equipeId === myEquipeId)?.points ?? 0;
      const opp = rows.find(r => r.equipeId !== myEquipeId)?.points ?? 0;

      if (m.preneurId === joueurId) {
        takesAttempted++;
        takerPoints += my; takerCount++;
        if (my > opp) takesSucceeded++;
      } else {
        nonTakerPoints += my; nonTakerCount++;
      }
    }

    // Atout préféré + réussite par couleur (quand preneur)
    const byColor = new Map<number, { attempted: number; succeeded: number }>();
    for (const m of manches) {
      if (m.preneurId !== joueurId || !m.couleurAtoutId) continue;
      const stat = byColor.get(m.couleurAtoutId) ?? { attempted: 0, succeeded: 0 };
      stat.attempted++;
      const myEquipeId = myEquipeByPartie.get(m.partieId);
      if (!myEquipeId) { byColor.set(m.couleurAtoutId, stat); continue; }
      const rows = await this.prisma.scoreManche.findMany({ where: { mancheId: m.id } });
      const my = rows.find(r => r.equipeId === myEquipeId)?.points ?? 0;
      const opp = rows.find(r => r.equipeId !== myEquipeId)?.points ?? 0;
      if (my > opp) stat.succeeded++;
      byColor.set(m.couleurAtoutId, stat);
    }
    const successByColor = Array.from(byColor.entries()).map(([couleurId, v]) => ({
      couleurId,
      attempted: v.attempted,
      succeeded: v.succeeded,
      successRate: v.attempted ? v.succeeded / v.attempted : 0,
    })).sort((a, b) => b.attempted - a.attempted);
    const mostChosen = successByColor[0]
      ? { couleurId: successByColor[0].couleurId, count: successByColor[0].attempted }
      : undefined;

    // Bonus (belote perso + bonus d’équipe capot/dix_de_der)
    const beloteCount = manches.filter(m => m.beloteJoueurId === joueurId).length;
    let dixDeDerCount = 0, capotCount = 0;
    for (const m of manches) {
      const myEquipeId = myEquipeByPartie.get(m.partieId);
      if (!myEquipeId) continue;
      const myRows = await this.prisma.scoreManche.findMany({
        where: { mancheId: m.id, equipeId: myEquipeId },
        include: { bonus: true },
      });
      for (const sc of myRows) {
        for (const b of sc.bonus) {
          if (b.type === 'dix_de_der') dixDeDerCount++;
          if (b.type === 'capot') capotCount++;
        }
      }
    }

    // Discipline (AFK + abandons)
    const timeouts = await this.prisma.playerEvent.count({
      where: {
        joueurId,
        type: 'TURN_TIMEOUT',
        createdAt: inRange(from, to),
      },
    });
    const abandons = parties.filter(p => p.statut === 'abandonnee').length;

    const handsPlayed = manches.length;

    return {
      joueurId,
      range: { from: from?.toISOString(), to: to?.toISOString() },

      games: {
        played: playedParties,
        won: wonParties,
        lost: lostParties,
        winRate,
      },

      points: {
        perMancheAvg: handsPlayed ? (sumPoints / handsPlayed) : 0,
        perPartieAvg: playedParties ? (sumPoints / playedParties) : 0,
        diffPerMancheAvg: handsPlayed ? (sumDiff / handsPlayed) : 0,
      },

      preneur: {
        attempted: takesAttempted,
        succeeded: takesSucceeded,
        successRate: takesAttempted ? (takesSucceeded / takesAttempted) : 0,
        pointsAsPreneurAvg: takerCount ? (takerPoints / takerCount) : 0,
        pointsAsNonPreneurAvg: nonTakerCount ? (nonTakerPoints / nonTakerCount) : 0,
      },

      plis: {
        total: plisWon,
        perMancheAvg: handsPlayed ? (plisWon / handsPlayed) : 0,
        lastTrickWonPct: handsPlayed ? (lastTricksWon / handsPlayed) : 0,
      },

      atouts: { mostChosen, successByColor },

      bonus: { beloteCount, capotCount, dixDeDerCount },

      discipline: { timeouts, abandons },
    };
  }
}
