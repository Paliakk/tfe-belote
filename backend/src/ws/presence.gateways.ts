import { WebSocketGateway, WebSocketServer, OnGatewayConnection, OnGatewayDisconnect } from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import { RealtimeService } from 'src/realtime/realtime.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { FriendsService } from 'src/friends/friends.service'; // ⬅️ NEW
import type { SocketWithUser } from 'src/types/ws';

@WebSocketGateway({
  namespace: '/',
  cors: {
    origin: [
      'http://localhost:5173',
      'https://scintillating-reverence-production.up.railway.app'
    ],
    credentials: true
  }
})
export class PresenceGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server: Server;

  constructor(
    private readonly rt: RealtimeService,
    private readonly prisma: PrismaService,
    private readonly friends: FriendsService,           // ⬅️ NEW
  ) {}

  afterInit() { this.rt.setServer(this.server); }

  private async notifyFriends(userId: number, online: boolean) {
    // Récupère uniquement les IDs (évite de charger tout le profil)
    const friendIds = await this.friends.getFriendIds(userId); // ⬅️ voir étape 2
    for (const fid of friendIds) {
      this.rt.emitToJoueur(fid, 'presence:changed', { userId, online });
    }
  }

  async handleConnection(client: Socket) {
    const c = client as SocketWithUser;
    const userId = c.user?.sub;
    if (!userId) return;

    const wasOnline = this.rt.isOnline(userId);   // avant enregistrement
    this.rt.registerClient(c, userId);            // enregistre (multi-onglets)

    // DB (idempotent)
    await this.prisma.joueur.update({
      where: { id: userId },
      data: { estConnecte: true, derniereConnexion: new Date(), connectionId: c.id },
    });

    if (!wasOnline) {
      // seuil 0→1 : broadcast à mes amis
      await this.notifyFriends(userId, true);
    }
  }

  async handleDisconnect(client: Socket) {
    const c = client as SocketWithUser;
    const userId = c.user?.sub;
    if (!userId) return;

    setTimeout(async () => {
      const stillOnline = this.rt.isOnline(userId);  // après purge des Maps
      if (!stillOnline) {
        await this.prisma.joueur.update({
          where: { id: userId },
          data: { estConnecte: false, connectionId: null },
        });
        // seuil 1→0 : broadcast à mes amis
        await this.notifyFriends(userId, false);
      }
    }, 0);
  }
}
