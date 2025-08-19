import {
    WebSocketGateway, SubscribeMessage, MessageBody,
    OnGatewayConnection, OnGatewayDisconnect, WebSocketServer, ConnectedSocket
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Injectable, Logger, UnauthorizedException, NotFoundException, UseGuards } from '@nestjs/common'
import { PrismaService } from 'src/prisma/prisma.service';
import { PlayService } from './play.service';
import { GameEvent } from './game-events';
import type { JouerCarteDto, PingMancheStateDto, CarteJoueePayload } from './game-events';
import { WsJwtGuard } from 'src/auth/ws-jwt.guard';

@WebSocketGateway({ cors: { origin: '*' } })
@UseGuards(WsJwtGuard)
@Injectable()
export class PlayGateway implements OnGatewayConnection, OnGatewayDisconnect {
    @WebSocketServer() server: Server;
    private readonly logger = new Logger('PlayGateway');

    constructor(
        private readonly prisma: PrismaService,
        private readonly play: PlayService,
    ) { }


    private async resolveJoueur(client: Socket) {
        const sub: string | undefined = client.data.user?.sub || client.data.user?.auth0Sub;
        if (!sub) throw new UnauthorizedException('Token WS absent ou invalide');

        // on tente via auth0Sub puis fallback via email
        let joueur = await this.prisma.joueur.findUnique({ where: { auth0Sub: sub } });
        if (!joueur && client.data.user?.email) {
            joueur = await this.prisma.joueur.findUnique({ where: { email: client.data.user.email } });
        }
        if (!joueur) throw new UnauthorizedException('Joueur introuvable (provisionnement nécessaire)');

        return joueur;
    }

    async handleConnection(client: Socket) {
        // WsJwtGuard a déjà validé et posé le payload dans client.data.user
        const u = client.data.user as { sub?: string; email?: string; nickname?: string } | undefined;

        if (u?.sub) {
            // Sauvegarder le connectionId côté DB (facultatif mais pratique)
            await this.prisma.joueur.updateMany({
                where: { auth0Sub: u.sub },
                data: { connectionId: client.id },
            });
        }

        this.logger.log(`WS connecté: ${u?.nickname || u?.email || u?.sub || client.id}`);
    }


    async handleDisconnect(client: Socket) {
        await this.prisma.joueur.updateMany({
            where: { connectionId: client.id },
            data: { connectionId: null },
        });
        this.logger.log(`WS déconnecté: ${client.id}`);
    }

    private async emitToPartieByManche(mancheId: number, event: GameEvent, payload: any) {
        const partie = await this.prisma.partie.findFirst({
            where: { manches: { some: { id: mancheId } } },
            select: { id: true },
        });
        if (partie) this.server.to(`partie-${partie.id}`).emit(GameEvent.CarteJouee, payload);
    }

    @SubscribeMessage('jouerCarte')
    async jouerCarte(@MessageBody() dto: JouerCarteDto, @ConnectedSocket() client: Socket) {
        try {
            const joueur = await this.resolveJoueur(client);
            const result = await this.play.playCard(dto.mancheId, joueur.id, dto.carteId);
            const carte = await this.prisma.carte.findUnique({ where: { id: dto.carteId } });
            if (!carte) throw new NotFoundException('Carte introuvable');

            const payload: CarteJoueePayload = {
                mancheId: dto.mancheId,
                pliNumero: ('pliNumero' in result ? result.pliNumero : ('numero' in result ? result.numero : -1)) as number,
                joueurId: joueur.id,
                carte: { id: carte!.id, couleurId: carte!.couleurId, valeur: carte!.valeur },
                cartesDansPli: 'cartesDansPli' in result ? (result as any).cartesDansPli : 0,
                nextPlayerId: 'nextPlayerId' in result ? (result as any).nextPlayerId ?? undefined : undefined,
                appliedBonuses: (result as any).appliedBonuses ?? [],
            };

            await this.emitToPartieByManche(dto.mancheId, GameEvent.CarteJouee, payload);
            // Résoudre la partie depuis la manche (sert pour les rooms + scores)
            const partie = await this.prisma.partie.findFirst({
                where: { manches: { some: { id: dto.mancheId } } },
                select: { id: true, statut: true, mancheCouranteId: true },
            });
            const partieId = partie?.id;
            if (!partieId) return { ok: true }; // sécurité

            // 1) Si le service a clôturé un pli, diffuse 'pliTermine'
            if ('winnerId' in result && 'numero' in result) {
                const pliTerminePayload = {
                    mancheId: dto.mancheId,
                    pliNumero: (result as any).numero,
                    winnerId: (result as any).winnerId,
                    winnerTeam: (result as any).winnerTeam,
                    trickPoints: (result as any).trickPoints,
                    totals: (result as any).totals,       // { team1, team2 } (live calculé côté service)
                    nextLeads: (result as any).nextLeads, // joueur qui entame le pli suivant
                };
                this.server.to(`partie-${partieId}`).emit('pliTermine', pliTerminePayload);
            }

            // 2) Fin de manche ?
            if ('requiresEndOfHand' in result && (result as any).requiresEndOfHand === true) {
                // Récupérer les scores cumulés depuis ScoreManche/Equipe.numero
                const { team1, team2, scoreMax } = await this.getCumulativeScoresByPartieId(partieId);

                // Diffuse 'mancheTerminee' (si ton TrickService a déjà un récap endOfHand, tu peux l’ajouter dans "recap")
                this.server.to(`partie-${partieId}`).emit('mancheTerminee', {
                    partieId,
                    mancheId: dto.mancheId,
                    scores: { team1, team2 },
                    scoreMax,
                    at: new Date().toISOString(),
                });

                // Recharger l'état de la partie (statut / mancheCouranteId) après endOfHand
                const fresh = await this.prisma.partie.findUnique({
                    where: { id: partieId },
                    select: { statut: true, mancheCouranteId: true },
                });

                // Nouvelle manche créée ?
                if (fresh?.statut === 'en_cours' && fresh.mancheCouranteId && fresh.mancheCouranteId !== dto.mancheId) {
                    this.server.to(`partie-${partieId}`).emit('nouvelleManche', {
                        partieId,
                        nouvelleMancheId: fresh.mancheCouranteId,
                        at: new Date().toISOString(),
                    });
                }

                // Partie finie ?
                if (fresh?.statut === 'finie') {
                    const winnerTeam = team1 >= team2 ? 1 : 2;
                    this.server.to(`partie-${partieId}`).emit('finDePartie', {
                        partieId,
                        winnerTeam,
                        finalScores: { team1, team2 },
                        at: new Date().toISOString(),
                    });
                }
            }

            return { ok: true }
        } catch (e) {
            // 👉 remonte l’erreur lisible au client
            client.emit('exception', {
                message: e?.message ?? 'Erreur jouerCarte',
                code: e?.status ?? 500,
                details: e?.response ?? null,
            });
            throw e; // laisse Nest gérer si tu veux aussi un ACK en erreur
        }
    }
    @SubscribeMessage('joinManche')
    async handleJoinManche(
        @MessageBody() data: { mancheId: number },
        @ConnectedSocket() client: Socket,
    ) {
        await client.join(`manche_${data.mancheId}`);
        client.emit('joinedManche', { mancheId: data.mancheId });
    }
    @SubscribeMessage('joinPartie')
    async HandleJoinPartie(
        @MessageBody() data: { partieId: number },
        @ConnectedSocket() client: Socket,
    ) {
        await client.join(`partie-${data.partieId}`);
        client.emit('joinedPartie', { partieId: data.partieId });
        return { ok: true, joined: `partie-${data.partieId}` };
    }

    @SubscribeMessage('pingMancheState')
    async pingMancheState(@MessageBody() dto: PingMancheStateDto) {
        // À implémenter côté service (voir 4) ci-dessous)
        const state = await (this.play as any).getEtatManche?.(dto.mancheId);
        return state ?? { mancheId: dto.mancheId, message: 'getEtatManche non disponible' };
    }
    private async getCumulativeScoresByPartieId(partieId: number) {
        const partie = await this.prisma.partie.findUnique({
            where: { id: partieId },
            include: { equipes: { select: { id: true, numero: true } } }, // numero = 1 | 2
        });

        const rows = await this.prisma.scoreManche.findMany({
            where: { manche: { partieId } },
            select: { equipeId: true, points: true },
        });

        const sumByEquipeId = new Map<number, number>();
        for (const r of rows) {
            sumByEquipeId.set(r.equipeId, (sumByEquipeId.get(r.equipeId) || 0) + r.points);
        }

        let team1 = 0, team2 = 0;
        for (const eq of (partie?.equipes || [])) {
            const pts = sumByEquipeId.get(eq.id) || 0;
            if (eq.numero === 1) team1 += pts;
            if (eq.numero === 2) team2 += pts;
        }
        return { team1, team2, scoreMax: partie?.scoreMax ?? null };
    }
}
