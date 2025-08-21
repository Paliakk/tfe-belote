import {
    ConnectedSocket, MessageBody, OnGatewayInit, SubscribeMessage,
    WebSocketGateway, WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { UseGuards, NotFoundException } from '@nestjs/common';
import { AuthGuardSocket } from 'src/auth/auth-socket.guard';
import { RealtimeService } from 'src/realtime/realtime.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { PlayService } from 'src/play/play.service';
import { PlayQueriesService } from 'src/play/play.queries';
import { TrickService } from 'src/play/trick.service';

type PlayCardOngoing =
    { message: string; pliNumero: number; cartesDansPli: number; nextPlayerId: number | null; requiresEndOfTrick: boolean; appliedBonuses: string[] };
type PlayCardClosed =
    {
        message: string; pliId: number; numero: number; winnerId: number; winnerTeam: 1 | 2;
        trickPoints: number; totals: { team1: number; team2: number };
        nextLeads: number; createdNextTrick: boolean; requiresEndOfHand: boolean;
        endOfHand?: any; endOfHandError?: string; appliedBonuses?: string[];
    };
type PlayCardResult = PlayCardOngoing | PlayCardClosed;

@WebSocketGateway({ cors: true })
@UseGuards(AuthGuardSocket)
export class PlayGateway implements OnGatewayInit {
    @WebSocketServer() server: Server;

    constructor(
        private readonly rt: RealtimeService,
        private readonly prisma: PrismaService,
        private readonly play: PlayService,
        private readonly queries: PlayQueriesService,
        private readonly trick: TrickService,
    ) { }

    afterInit(server: Server) {
        this.rt.setServer(server);
        console.log('[WS] PlayGateway afterInit');
    }

    private async getPartieIdFromManche(mancheId: number): Promise<number> {
        const m = await this.prisma.manche.findUnique({ where: { id: mancheId }, select: { partieId: true } });
        if (!m) throw new NotFoundException(`Manche ${mancheId} introuvable.`);
        return m.partieId;
    }

    private normalizeIds(playable: any): number[] {
        if (!playable) return [];
        if (Array.isArray(playable.carteIds)) return playable.carteIds;
        if (Array.isArray(playable.playable)) return playable.playable;
        if (Array.isArray(playable.ids)) return playable.ids;
        if (Array.isArray(playable.cartes)) {
            return playable.cartes.map((c: any) => (typeof c === 'number' ? c : c?.id)).filter(Boolean);
        }
        if (Array.isArray(playable.cards)) {
            return playable.cards.map((c: any) => c?.id).filter(Boolean);
        }
        return [];
    }

    /** nombre de cartes déjà posées dans le pli courant (0..4) */
    private async countCardsInCurrentTrick(mancheId: number): Promise<number> {
        const pli = await this.prisma.pli.findFirst({
            where: { mancheId },
            orderBy: { numero: 'desc' },
            include: { cartes: true },
        });
        return pli?.cartes?.length ?? 0;
    }

    /** couleur demandée (couleur de la 1ʳᵉ carte du pli courant) ou null si pas de pli en cours */
    private async getAskedColor(mancheId: number): Promise<number | null> {
        const pli = await this.prisma.pli.findFirst({
            where: { mancheId },
            orderBy: { numero: 'desc' },
            include: {
                cartes: {
                    orderBy: { ordre: 'asc' },
                    take: 1,
                    include: { carte: { select: { couleurId: true } } },
                },
            },
        });
        const first = pli?.cartes?.[0];
        return first?.carte?.couleurId ?? null;
    }

    /** IDs des cartes encore en main d’un joueur (avec couleur quand on en a besoin) */
    private async getHandIds(mancheId: number, joueurId: number): Promise<number[]> {
        const rows = await this.prisma.main.findMany({
            where: { mancheId, joueurId, jouee: false },
            select: { carteId: true },
            orderBy: { id: 'asc' },
        });
        return rows.map(r => r.carteId);
    }

    private async getHandWithColors(mancheId: number, joueurId: number) {
        return this.prisma.main.findMany({
            where: { mancheId, joueurId, jouee: false },
            include: { carte: { select: { id: true, couleurId: true } } },
            orderBy: { id: 'asc' },
        });
    }

    /** Fallback “début de pli” → toute la main ; “pli en cours” → suit-couleur si possible, sinon toute la main */
    private async computePlayableFallback(mancheId: number, joueurId: number): Promise<number[]> {
        const nb = await this.countCardsInCurrentTrick(mancheId);
        if (nb === 0) {
            // premier à jouer → tout est jouable
            return this.getHandIds(mancheId, joueurId);
        }
        // pli entamé → essayer de suivre la couleur demandée
        const asked = await this.getAskedColor(mancheId);
        if (asked == null) return this.getHandIds(mancheId, joueurId);

        const hand = await this.getHandWithColors(mancheId, joueurId);
        const sameColor = hand.filter(h => h.carte.couleurId === asked).map(h => h.carte.id);
        if (sameColor.length > 0) return sameColor;

        // sinon, on laisse tout (tu peux ici restreindre à l’atout si tu veux aller plus loin)
        return hand.map(h => h.carte.id);
    }

    // === Demander les cartes jouables pour le joueur courant ===
    @SubscribeMessage('play:getPlayable')
    async getPlayable(
        @ConnectedSocket() client: Socket & { user: { sub: number } },
        @MessageBody() data: { mancheId: number },
    ) {
        try {
            const joueurId = client.user.sub;
            const mancheId = data.mancheId;


            const turn = await this.prisma.manche.findUnique({
                where: { id: mancheId }, select: { joueurActuelId: true }
            });
            const isHisTurn = turn?.joueurActuelId === joueurId;

            const playableRaw = await this.queries.getPlayable(mancheId, joueurId);
            let carteIds = this.normalizeIds(playableRaw);

            if (isHisTurn && carteIds.length === 0) {
                carteIds = await this.computePlayableFallback(mancheId, joueurId);
                console.log('[play:getPlayable][fallback]', { mancheId, joueurId, carteIds });
            }

            console.log('[play:getPlayable]', {
                mancheId, joueurId, isHisTurn, carteIds,
                rawShape: playableRaw ? Object.keys(playableRaw) : null
            });

            this.rt.emitToJoueur(joueurId, 'play:playable', { carteIds });
        } catch (e: any) {
            console.error('[play:getPlayable] error', e?.message || e);
            client.emit('error', { scope: 'play:getPlayable', message: e?.message ?? 'unexpected error' });
        }
    }

    // === Jouer une carte ===
    @SubscribeMessage('play:card')
    async playCard(
        @ConnectedSocket() client: Socket & { user: { sub: number } },
        @MessageBody() data: { mancheId: number; carteId: number },
    ) {
        try {
            const joueurId = client.user.sub;
            const { mancheId, carteId } = data;

            const res = await this.play.playCard(mancheId, joueurId, carteId);
            const partieId = await this.getPartieIdFromManche(mancheId);
            
            // 0) Belote/Rebelote visuel (optionnel mais demandé)
            if ('beloteEvent' in res && res.beloteEvent) {
                // broadcast à toute la table
                this.rt.emitToPartie(partieId,
                    res.beloteEvent === 'belote' ? 'belote:declared' : 'belote:rebelote',
                    { mancheId, joueurId }
                );
            }

            // 1) Pli courant
            const trick = await this.queries.getActiveTrick(mancheId);
            this.rt.emitToPartie(partieId, 'trick:state', trick);

            // 2) Main MAJ pour le joueur qui vient de jouer
            const myCards = await this.prisma.main.findMany({
                where: { mancheId, joueurId, jouee: false },
                include: { carte: true },
                orderBy: { id: 'asc' },
            });
            this.rt.emitHandTo(joueurId, {
                mancheId,
                cartes: myCards.map(m => ({ id: m.carteId, valeur: m.carte.valeur, couleurId: m.carte.couleurId })),
            });

            // 3) Tour suivant
            const m = await this.prisma.manche.findUnique({
                where: { id: mancheId }, select: { joueurActuelId: true }
            });
            if (m?.joueurActuelId) {
                const nextId = m.joueurActuelId;
                this.rt.emitToPartie(partieId, 'turn:state', { mancheId, joueurActuelId: nextId });

                // Jouables du prochain (avec fallback couleur demandée)
                const playableNextRaw = await this.queries.getPlayable(mancheId, nextId);
                let nextIds = this.normalizeIds(playableNextRaw);
                if (nextIds.length === 0) {
                    nextIds = await this.computePlayableFallback(mancheId, nextId);
                    console.log('[play:card][fallback-next]', { mancheId, nextId, nextIds });
                }
                this.rt.emitToJoueur(nextId, 'play:playable', { carteIds: nextIds });
            }

            // 4) Pli clôturé → envoyer le pli précédent pour l’affichage
            const trickClosed =
                ('requiresEndOfHand' in res && res.requiresEndOfHand) ||
                ('createdNextTrick' in res && res.createdNextTrick) ||
                /pli.+clôtur/i.test(res.message);

            if (trickClosed) {
                const prev = await this.trick.previousTrick(mancheId);
                if (prev?.cartes?.length) {
                    this.rt.emitToPartie(partieId, 'trick:closed', {
                        cartes: prev.cartes, gagnantId: prev.gagnantId
                    });
                }

                // 🟢 score live à toute la partie
                const live = await this.trick.scoreLive(mancheId);
                this.rt.emitToPartie(partieId, 'score:live', live);
            }

            return { ok: true };
        } catch (e: any) {
            console.error('[play:card] error', e?.message || e);
            client.emit('error', { scope: 'play:card', message: e?.message ?? 'unexpected error' });
            return { ok: false, error: e?.message ?? 'unexpected error' };
        }
    }
    @SubscribeMessage('score:getLive')
    async scoreGetLive(
        @ConnectedSocket() client: Socket & { user: { sub: number } },
        @MessageBody() data: { mancheId: number },
    ) {
        const score = await this.trick.scoreLive(data.mancheId);
        // envoie le score uniquement à l'appelant
        this.rt.emitToJoueur(client.user.sub, 'score:live', score);
    }
}
