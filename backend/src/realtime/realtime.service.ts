import { Injectable, OnModuleInit } from '@nestjs/common';
import { Server, Socket } from 'socket.io';

@Injectable()
export class RealtimeService implements OnModuleInit {
  private server: Server;
  private clients = new Map<number, Socket>();

  setServer(server: Server) { this.server = server; }
  onModuleInit() { }

  registerClient(socket: Socket, joueurId: number) {
    this.clients.set(joueurId, socket);
  }

  // ——— Émissions réutilisables ———
  emitLobbyState(lobbyId: number, membres: { id: number; username: string }[]) {
    const payload = { lobbyId, membres };
    this.server?.to(`lobby-${lobbyId}`).emit('lobby:state', payload);
  }

  emitLobbyStateToClient(socket: Socket, lobbyId: number, membres: { id: number; username: string }[]) {
    socket.emit('lobby:state', { lobbyId, membres });
  }

  emitLobbyClosed(lobbyId: number) {
    this.server?.to(`lobby-${lobbyId}`).emit('lobby:closed', { lobbyId });
  }

  emitLobbyEvent(lobbyId: number, type: 'join' | 'leave', joueur: string) {
    this.server?.to(`lobby-${lobbyId}`).emit('lobby:update', { lobbyId, type, joueur });
  }

  emitGameStarted(lobbyId:number,partieId:number){
    this.server?.to(`lobby-${lobbyId}`).emit('lobby:gameStarted',{
      lobbyId,
      partieId
    })
  }
  // src/realtime/realtime.service.ts
  emitToPartie(partieId: number, event: string, payload: any) {
    this.server?.to(`partie-${partieId}`).emit(event, payload);
  }
}
