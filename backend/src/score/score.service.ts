import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { ScoreResultDto, TeamScore } from './dto/score-result.dto';

/**
 * UC09 – Calculer les scores d'une manche.
 * - Calcule points par équipe à partir des plis gagnés
 * - Applique bonus: dix_de_der (+10), capot (+90 si 8 plis), belote (+20 si beloteJoueurId)
 * - Contrat: 82 HORS bonus (si chute: base 162 à la défense ; bonus conservés)
 * - Persiste ScoreManche + Bonus et renvoie un résultat frontend-friendly
 */
@Injectable()
export class ScoreService {
    constructor(private readonly prisma: PrismaService) { }

    async calculateScoresForManche(mancheId: number): Promise<ScoreResultDto> {
        return this.prisma.$transaction(async (tx) => {
            // Charger la manche complète
            const manche = await tx.manche.findUnique({
                where: { id: mancheId },
                include: {
                    couleurAtout: true,
                    partie: { include: { equipes: { include: { joueurs: true } } } },
                    plis: {
                        orderBy: { numero: 'asc' },
                        include: {
                            cartes: {
                                include: {
                                    carte: {
                                        select: {
                                            id: true, valeur: true, couleurId: true,
                                            pointsAtout: true, pointsNonAtout: true,
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
            });
            if (!manche) throw new NotFoundException(`Manche ${mancheId} introuvable.`);
            if (!manche.partie?.equipes || manche.partie.equipes.length !== 2) {
                throw new BadRequestException(`Manche ${mancheId}: parties/équipes invalides.`);
            }
            if (manche.plis.length !== 8 || manche.plis.some(p => !p.gagnantId)) {
                throw new BadRequestException(`Manche ${mancheId}: les 8 plis doivent être terminés.`);
            }

            // Mapping joueur -> teamNumero, et teamNumero -> equipeId
            const teamNumeroToEquipeId = new Map<number, number>();
            const joueurToTeamNumero: Record<number, 1 | 2> = {} as any;
            manche.partie.equipes.forEach(eq => {
                teamNumeroToEquipeId.set(eq.numero, eq.id);
                eq.joueurs.forEach(j => (joueurToTeamNumero[j.joueurId] = eq.numero as 1 | 2));
            });

            const atoutId = manche.couleurAtout?.id ?? manche.couleurAtoutId ?? null;

            // Somme base par équipe (hors bonus)
            const pointsBaseByTeam: Record<1 | 2, number> = { 1: 0, 2: 0 };
            const plisCountByTeam: Record<1 | 2, number> = { 1: 0, 2: 0 };

            for (const pli of manche.plis) {
                const sumPli = pli.cartes.reduce((sum, pc) => {
                    const isAtout = atoutId != null && pc.carte.couleurId === atoutId;
                    return sum + (isAtout ? pc.carte.pointsAtout : pc.carte.pointsNonAtout);
                }, 0);
                const winnerTeam = joueurToTeamNumero[pli.gagnantId!];
                plisCountByTeam[winnerTeam] += 1;
                pointsBaseByTeam[winnerTeam] += sumPli;
            }

            // BONUS
            const bonusTypesApplied: ('dix_de_der' | 'belote' | 'capot')[] = [];

            // Dix de Der (+10 à l'équipe gagnante du dernier pli)
            const lastTrickWinnerTeam: 1 | 2 = joueurToTeamNumero[manche.plis[7].gagnantId!];
            const bonusDix = 10;
            bonusTypesApplied.push('dix_de_der');

            // Capot (+90 si 8 plis)
            const capotTeam: 1 | 2 | null =
                plisCountByTeam[1] === 8 ? 1 : plisCountByTeam[2] === 8 ? 2 : null;
            const bonusCapot = capotTeam ? 90 : 0;
            if (capotTeam) bonusTypesApplied.push('capot');

            // Belote (+20 si beloteJoueurId défini) — provisoire en attendant UC08 complet
            const beloteTeam: 1 | 2 | null = manche.beloteJoueurId
                ? (joueurToTeamNumero[manche.beloteJoueurId] ?? null)
                : null;
            const bonusBelote = beloteTeam ? 20 : 0;
            if (beloteTeam) bonusTypesApplied.push('belote');

            // Contrat
            const preneurId = manche.preneurId ?? null;
            const preneurTeamNumero: 1 | 2 | null = preneurId != null ? joueurToTeamNumero[preneurId] : null;
            const preneurEquipeId = preneurTeamNumero ? teamNumeroToEquipeId.get(preneurTeamNumero)! : null;

            let contratReussi: boolean | null = null;
            if (preneurTeamNumero) {
                const basePreneur = pointsBaseByTeam[preneurTeamNumero];
                contratReussi = basePreneur >= 82; // HORS bonus
            }

            // Répartition bonus par équipe
            const bonusMap: Record<1 | 2, { pts: number; details: TeamScore['detailsBonus'] }> = {
                1: { pts: 0, details: [] },
                2: { pts: 0, details: [] },
            };
            // dix de der
            bonusMap[lastTrickWinnerTeam].pts += bonusDix;
            bonusMap[lastTrickWinnerTeam].details.push({ type: 'dix_de_der', points: bonusDix });
            // capot
            if (capotTeam) {
                bonusMap[capotTeam].pts += bonusCapot;
                bonusMap[capotTeam].details.push({ type: 'capot', points: bonusCapot });
            }
            // belote
            if (beloteTeam) {
                bonusMap[beloteTeam].pts += bonusBelote;
                bonusMap[beloteTeam].details.push({ type: 'belote', points: bonusBelote });
            }

            // Application CHUTE si nécessaire (base seulement)
            let base1 = pointsBaseByTeam[1];
            let base2 = pointsBaseByTeam[2];

            if (preneurTeamNumero) {
                if (contratReussi === false) {
                    const defenseTeam: 1 | 2 = preneurTeamNumero === 1 ? 2 : 1;
                    // La somme "base" des cartes = 152 (pas 162). Le "dix_de_der" reste un BONUS.
                    const MAX_BASE = pointsBaseByTeam[1] + pointsBaseByTeam[2]; // normalement 152
                    if (defenseTeam === 1) { base1 = MAX_BASE; base2 = 0; }
                    else { base1 = 0; base2 = MAX_BASE; }
                }
            }

            const equipeId1 = teamNumeroToEquipeId.get(1)!;
            const equipeId2 = teamNumeroToEquipeId.get(2)!;

            const team1: TeamScore = {
                equipeId: equipeId1,
                pointsBase: base1,
                bonus: bonusMap[1].pts,
                total: base1 + bonusMap[1].pts,
                capot: capotTeam === 1,
                detailsBonus: bonusMap[1].details,
            };
            const team2: TeamScore = {
                equipeId: equipeId2,
                pointsBase: base2,
                bonus: bonusMap[2].pts,
                total: base2 + bonusMap[2].pts,
                capot: capotTeam === 2,
                detailsBonus: bonusMap[2].details,
            };

            // Persistance ScoreManche (2 lignes) + Bonus liés
            const score1 = await tx.scoreManche.create({
                data: { mancheId, equipeId: equipeId1, points: team1.total },
            });
            const score2 = await tx.scoreManche.create({
                data: { mancheId, equipeId: equipeId2, points: team2.total },
            });

            const ops: Prisma.PrismaPromise<any>[] = [];
            for (const d of team1.detailsBonus) {
                ops.push(tx.bonus.create({ data: { scoreboardId: score1.id, type: d.type as any, points: d.points } }));
            }
            for (const d of team2.detailsBonus) {
                ops.push(tx.bonus.create({ data: { scoreboardId: score2.id, type: d.type as any, points: d.points } }));
            }
            if (ops.length) await Promise.all(ops);

            return {
                mancheId,
                preneurId,
                preneurEquipeId,
                scores: [team1, team2],
                contratReussi,
                bonusAppliques: [
                    ...(capotTeam ? (['capot'] as const) : []),
                    'dix_de_der',
                    ...(beloteTeam ? (['belote'] as const) : []),
                ],
                scoreMancheIds: [score1.id, score2.id],
            };
        }, { isolationLevel: 'Serializable' });
    }
}
