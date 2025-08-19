// src/realtime/realtime.service.ts
import { Injectable, Logger } from '@nestjs/common';
import type { Server } from 'socket.io';

@Injectable()
export class RealtimeService {
  private server: Server | null = null;
  private readonly logger = new Logger('RealtimeService');

  setServer(server: Server) {
    this.server = server;
    this.logger.log('Socket.IO server registered.');
  }

  /** Émettre à tous les sockets du lobby */
  emitToLobby(lobbyId: number, event: string, payload: any) {
    if (!this.server) return;
    this.server.to(`lobby-${lobbyId}`).emit(event, payload);
  }

  /** Émettre à tous les sockets de la partie */
  emitToPartie(partieId: number, event: string, payload: any) {
    if (!this.server) return;
    this.server.to(`partie-${partieId}`).emit(event, payload);
  }

  /** Laisser un socket rejoindre/quitter une room */
  joinRoom(clientId: string, room: string) {
    this.server?.in(clientId).socketsJoin(room);
  }
  leaveRoom(clientId: string, room: string) {
    this.server?.in(clientId).socketsLeave(room);
  }
}
