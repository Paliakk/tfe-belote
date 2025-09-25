import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';

type StatsWindow = { from?: Date; to?: Date };
const inRange = (from?: Date, to?: Date) =>
  (!from && !to) ? undefined : { gte: from ?? undefined, lte: to ?? undefined };

@Injectable()
export class StatsService {
  constructor(private readonly prisma: PrismaService) {}

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

      // cumul points par équipe sur la partie
      const totals = await this.prisma.scoreManche.groupBy({
        by: ['equipeId'],
        where: { manche: { partieId: p.id } },
        _sum: { points: true },
      });

      if (p.statut === 'abandonnee') {
        // toujours défaite
        continue;
      }

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
    })).sort((a,b)=>b.attempted-a.attempted);
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
