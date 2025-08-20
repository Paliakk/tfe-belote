import { Injectable, OnModuleInit } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class RealtimeService implements OnModuleInit {
  private server: Server;
  private clients = new Map<number, Socket>();

  setServer(server: Server) { this.server = server; }
  onModuleInit() { }

  registerClient(socket: Socket, joueurId: number) {
    const prev = this.clients.get(joueurId);
    if (prev && prev.id !== socket.id) { try { prev.disconnect(true); } catch { } }
    this.clients.set(joueurId, socket);
  }

  getClient(joueurId: number): Socket | undefined {
    return this.clients.get(joueurId);
  }
  emitToJoueur(joueurId: number, event: string, payload: any) {
    this.getClient(joueurId)?.emit(event, payload);
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

  emitGameStarted(lobbyId: number, partieId: number) {
    this.server?.to(`lobby-${lobbyId}`).emit('lobby:gameStarted', {
      lobbyId,
      partieId
    })
  }
  // src/realtime/realtime.service.ts
  emitToPartie(partieId: number, event: string, payload: any) {
    this.server?.to(`partie-${partieId}`).emit(event, payload);
  }
  emitHandTo(joueurId: number, payload: { mancheId: number; cartes: any[] }) {
    this.getClient(joueurId)?.emit('hand:state', payload);
  }

  async emitHandsForPartie(prisma: PrismaService, partieId: number, mancheId: number) {
    // récupère tous les joueurs de la partie + leur main courante
    const joueurs = await prisma.equipeJoueur.findMany({
      where: { equipe: { partieId } },
      select: { joueurId: true },
    });

    for (const { joueurId } of joueurs) {
      const cartes = await prisma.main.findMany({
        where: { mancheId, joueurId, jouee: false },
        include: { carte: true },
        orderBy: { id: 'asc' },
      });
      this.emitHandTo(
        joueurId,
        { mancheId, cartes: cartes.map(m => ({ id: m.carteId, valeur: m.carte.valeur, couleurId: m.carte.couleurId })) }
      );
    }
  }
}
