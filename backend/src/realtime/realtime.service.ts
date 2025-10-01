import { Injectable, Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { PrismaService } from 'src/prisma/prisma.service';
import { GameEvent } from './ws-events';

type SocketWithUser = Socket & { user?: { sub: number; username?: string } };

@Injectable()
export class RealtimeService {
  private readonly log = new Logger('Realtime');
  private server!: Server;

  // mapping joueurId -> socketIds (un joueur peut avoir plusieurs onglets)
  private socketsByJoueur = new Map<number, Set<string>>();
  // mapping socketId -> joueurId
  private joueurBySocket = new Map<string, number>();
  private online = new Map<number, Set<string>>();

  // -------------------------------------------------------------------------
  // 👇 Initialisation / binding serveur + hooks de nettoyage
  // -------------------------------------------------------------------------

  setServer(server: Server) {
    if (this.server && this.server === server) return;
    this.server = server;

    // hook de ménage à la déconnexion
    this.server.on('connection', (sock: SocketWithUser) => {
      // (NB) l'enregistrement "socket <-> joueur" est fait explicitement via registerClient()
      sock.on('disconnect', () => {
        const jid = this.joueurBySocket.get(sock.id);
        if (jid != null) {
          this.joueurBySocket.delete(sock.id);
          const set = this.socketsByJoueur.get(jid);
          if (set) {
            set.delete(sock.id);
            if (set.size === 0) this.socketsByJoueur.delete(jid);
          }
        }
      });
    });
    this.log.log('Socket.IO server bound in RealtimeService');
  }

  /** Appelé par chaque gateway après avoir joint les rooms pour lier socket<->joueur */
  registerClient(client: SocketWithUser, joueurId: number) {
    console.log(`🔗 Registering client ${client.id} for joueur ${joueurId}`);

    this.joueurBySocket.set(client.id, joueurId);
    let set = this.socketsByJoueur.get(joueurId);
    if (!set) {
      set = new Set<string>();
      this.socketsByJoueur.set(joueurId, set);
    }
    set.add(client.id);

    if (!this.online.has(joueurId)) this.online.set(joueurId, new Set());
    this.online.get(joueurId)!.add(client.id);

    console.log(`📊 Now ${set.size} socket(s) for joueur ${joueurId}`);

    client.on('disconnect', () => {
      console.log(`🚪 Client ${client.id} disconnected`);
      const set = this.online.get(joueurId);
      if (set) {
        set.delete(client.id);
        if (set.size === 0) this.online.delete(joueurId);
      }

      // Nettoyage aussi dans socketsByJoueur
      const joueurSockets = this.socketsByJoueur.get(joueurId);
      if (joueurSockets) {
        joueurSockets.delete(client.id);
        if (joueurSockets.size === 0) {
          this.socketsByJoueur.delete(joueurId);
        }
      }
      this.joueurBySocket.delete(client.id);
    });
  }

  // -------------------------------------------------------------------------
  // 👇 Rooms utilitaires (noms inchangés pour compat)
  // -------------------------------------------------------------------------

  private roomLobby(lobbyId: number) {
    return `lobby-${lobbyId}`;
  }
  private roomPartie(partieId: number) {
    return `partie-${partieId}`;
  }

  // -------------------------------------------------------------------------
  // 👇 Émissions ciblées (joueur / partie / lobby)
  // -------------------------------------------------------------------------

  /** Emit à tous les sockets d'un joueur (multi-onglets supportés) */
  emitToJoueur(joueurId: number, event: string, data: any) {
    console.log(`🔊 Emitting to joueur ${joueurId}:`, { event, data });

    const socketIds = this.socketsByJoueur.get(joueurId);
    console.log(`🔍 Socket IDs for joueur ${joueurId}:`, socketIds ? Array.from(socketIds) : 'none');

    if (socketIds && socketIds.size > 0 && this.server) {
      console.log(`📡 Sending to ${socketIds.size} socket(s)`);
      socketIds.forEach(socketId => {
        this.server!.to(socketId).emit(event, data);
      });
      return true;
    } else {
      console.log(`❌ Joueur ${joueurId} not connected or server not available`);
      return false;
    }
  }

  /** Emit à une partie (room partie-xxx) */
  emitToPartie(partieId: number, event: string, payload?: any) {
    if (!this.server) return;
    this.server.to(this.roomPartie(partieId)).emit(event, payload);
  }

  /** Emit à un lobby (room lobby-xxx) */
  emitToLobby(lobbyId: number, event: string, payload?: any) {
    if (!this.server) return;
    this.server.to(this.roomLobby(lobbyId)).emit(event, payload);
  }

  // -------------------------------------------------------------------------
  // 👇 Helpers WS "métier" prêts-à-l'emploi (inchangés pour compat front)
  // -------------------------------------------------------------------------

  /** Push l'état "liste des membres" du lobby */
  emitLobbyState(
    lobbyId: number,
    membres: { id: number; username: string }[],
    lobbyName?: string,
    hostId? : number
  ) {
    this.emitToLobby(lobbyId, 'lobby:state', { lobbyId, lobbyName, membres,hostId  });
  }

  /** Même chose mais à un client précis (utile quand il quitte) */
  emitLobbyStateToClient(
    client: Socket,
    lobbyId: number,
    membres: { id: number; username: string }[],
    lobbyName?: string,
    hostId?: number
  ) {
    client.emit('lobby:state', { lobbyId, lobbyName, membres,hostId  });
  }

  /** Petit event court pour feed un log côté UI */
  emitLobbyEvent(lobbyId: number, type: 'join' | 'leave', joueur: string) {
    this.emitToLobby(lobbyId, 'lobby:update', { lobbyId, type, joueur });
  }

  /** Notifie le démarrage de la partie (redirigera le front) */
  emitGameStarted(lobbyId: number, partieId: number) {
    // Compat : certains front écoutent lobby:gameStarted, d'autres partie:started
    this.emitToLobby(lobbyId, 'lobby:gameStarted', { lobbyId, partieId });
    this.emitToLobby(lobbyId, 'partie:started', { partieId });
  }

  /** Notifie que le lobby est fermé/supprimé */
  emitLobbyClosed(lobbyId: number) {
    this.emitToLobby(lobbyId, 'lobby:closed', { lobbyId });
  }

  /** Envoie la main privée d'un joueur (format attendu par ton front) */
  emitHandTo(
    joueurId: number,
    payload: {
      mancheId: number;
      cartes: { id: number; valeur: string; couleurId: number }[];
      mancheNumero?: number
    },
  ) {
    this.emitToJoueur(joueurId, 'hand:state', payload);
  }
  /** Informe tous les joueurs d’une partie de la deadline du tour courant */
  emitTurnDeadline(partieId: number, payload: {
    mancheId: number;
    joueurId: number;           // à qui c’est de jouer
    phase: 'bidding' | 'play';
    deadlineTs: number;         // Date.now() + TURN_TIMEOUT_MS
    remainingMs?: number;       // optionnel, pour debug
  }) {
    if (!this.server) return;
    this.emitToPartie(partieId, 'turn:deadline', payload);
  }

  /** Petit event loggable quand le timer expire (avant l’auto-action) */
  emitTurnTimeout(partieId: number, payload: {
    mancheId: number;
    joueurId: number;
    phase: 'bidding' | 'play';
  }) {
    if (!this.server) return;
    this.emitToPartie(partieId, 'turn:timeout', payload);
  }

  /**
   * Diffuse les mains complètes de la manche en cours à TOUS les joueurs d'une partie.
   * (lit la DB pour chaque joueur → pas d'info privée croisée)
   */
  async emitHandsForPartie(prisma: PrismaService, partieId: number, mancheId: number) {
    const [joueurs, manche] = await Promise.all([
      prisma.equipeJoueur.findMany({
        where: { equipe: { partieId } },
        select: { joueurId: true },
        orderBy: { ordreSiege: 'asc' },
      }),
      prisma.manche.findUnique({ where: { id: mancheId }, select: { numero: true } }),
    ]);

    for (const j of joueurs) {
      const hand = await prisma.main.findMany({
        where: { mancheId, joueurId: j.joueurId, jouee: false },
        include: { carte: true },
        orderBy: { id: 'asc' },
      });
      this.emitHandTo(j.joueurId, {
        mancheId,
        mancheNumero: manche?.numero, // 👈 new
        cartes: hand.map(m => ({
          id: m.carteId,
          valeur: m.carte.valeur,
          couleurId: m.carte.couleurId,
        })),
      });
    }
  }

  // -------------------------------------------------------------------------
  // 👇 Helpers état de présence
  // -------------------------------------------------------------------------

  isOnline(joueurId: number): boolean {
    const isOnline = this.socketsByJoueur.has(joueurId) && this.socketsByJoueur.get(joueurId)!.size > 0;
    console.log(`🌐 Joueur ${joueurId} online status: ${isOnline}`);
    return isOnline;
  }
  isJoueurOnline(joueurId: number): boolean {
    return this.socketsByJoueur.has(joueurId) && this.socketsByJoueur.get(joueurId)!.size > 0;
  }
  getOnlineJoueurs(): number[] {
    return Array.from(this.socketsByJoueur.keys());
  }

  // -------------------------------------------------------------------------
  // 👇 NOUVEAU — Helpers de déplacement de rooms (fin de partie -> retour lobby)
  // -------------------------------------------------------------------------

  /**
   * Déplace tous les sockets de la room "partie-{id}" vers "lobby-{id}".
   * Strictement serveur-side ; ne publie pas d'événements UI.
   */
  async movePartieToLobby(partieId: number, lobbyId: number) {
    if (!this.server) return;

    const from = this.roomPartie(partieId);
    const to = this.roomLobby(lobbyId);

    const room = this.server.sockets.adapter.rooms.get(from);
    if (!room || room.size === 0) {
      this.log.debug(`[WS] movePartieToLobby: no sockets in ${from}`);
      return;
    }

    this.log.debug(`[WS] Moving ${room.size} sockets from ${from} -> ${to}`);

    for (const socketId of room) {
      const s: Socket | undefined = this.server.sockets.sockets.get(socketId);
      if (!s) continue;
      try {
        await s.leave(from);
        await s.join(to);
      } catch (e) {
        this.log.warn(`[WS] Failed to move ${socketId} from ${from} to ${to}: ${e}`);
      }
    }
  }
}
