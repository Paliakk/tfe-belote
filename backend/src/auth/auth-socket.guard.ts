import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Socket } from 'socket.io';
import { PrismaService } from 'src/prisma/prisma.service';
import { UsersService } from 'src/users/users.service';

type WsAuthed = Socket & { user?: { sub: number; username?: string; email?: string } };

@Injectable()
export class AuthGuardSocket implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
    private readonly users: UsersService,
  ) { }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const client: Socket = context.switchToWs().getClient<Socket>();
    console.log('[WS] canActivate called'); // <= doit apparaître à chaque tentative socket

    const accessToken = client.handshake.auth?.token as string | undefined;
    const idToken = client.handshake.auth?.id_token as string | undefined;
    if (!accessToken && !idToken) {
      console.warn('[WS] no tokens provided');
      return false;
    }

    const it = idToken ? (this.jwtService.decode(idToken) as any || {}) : {};
    const at = accessToken ? (this.jwtService.decode(accessToken) as any || {}) : {};

    const sub = it.sub || at.sub;
    const email = it.email ?? at.email ?? null;
    const name = it.name ?? at.name ?? null;
    const nickname = it.nickname ?? at.nickname ?? null;
    const picture = it.picture ?? at.picture ?? null;

    console.log('[WS][id_token claims]', { sub, email, nickname, name, hasPicture: !!picture });

    if (!sub) return false;

    const joueur = await this.users.ensureFromAuth0({ sub, email, name, nickname, picture });

    (client as any).user = { sub: joueur.id, username: joueur.username, email: joueur.email };

    await this.prisma.joueur.update({
      where: { id: joueur.id },
      data: { estConnecte: true, derniereConnexion: new Date(), connectionId: client.id },
    });

    client.once('disconnect', async () => {
      try {
        await this.prisma.joueur.update({
          where: { id: joueur.id },
          data: { estConnecte: false, connectionId: null },
        });
      } catch { }
    });

    return true;
  }
}
