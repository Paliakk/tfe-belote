import { IoAdapter } from '@nestjs/platform-socket.io';
import type { INestApplication } from '@nestjs/common';
import type { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from 'src/users/users.service';

export class WsAuthAdapter extends IoAdapter {
  constructor(
    app: INestApplication,
    private readonly jwt: JwtService,
    private readonly users: UsersService,
  ) {
    super(app);
  }

  createIOServer(port: number, options?: any): Server {
    const server: Server = super.createIOServer(port, {
      cors: { origin: true, credentials: true },
      ...options,
    });

    server.use(async (socket: Socket, next) => {
      try {
        const accessToken = socket.handshake.auth?.token as string | undefined;
        const idToken = socket.handshake.auth?.id_token as string | undefined;
        if (!accessToken && !idToken) return next(new Error('No tokens provided'));

        const it: any = idToken ? this.jwt.decode(idToken) || {} : {};
        const at: any = accessToken ? this.jwt.decode(accessToken) || {} : {};
        const sub = it.sub || at.sub;
        if (!sub) return next(new Error('No sub in tokens'));

        const email = it.email ?? at.email ?? null;
        const name = it.name ?? at.name ?? null;
        const nickname = it.nickname ?? at.nickname ?? null;
        const picture = it.picture ?? at.picture ?? null;

        // Ensure user in DB
        const joueur = await this.users.ensureFromAuth0({ sub, email, name, nickname, picture });

        // Injecte l’utilisateur sur le socket → accessible dès handleConnection
        (socket as any).user = { sub: joueur.id, username: joueur.username, email: joueur.email };
        next();
      } catch {
        next(new Error('Auth handshake failed'));
      }
    });

    return server;
  }
}
