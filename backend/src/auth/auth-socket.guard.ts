import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Socket } from 'socket.io';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class AuthGuardSocket implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
  ) { console.log('[WS] Authguardsocket initialized') }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const client: Socket = context.switchToWs().getClient<Socket>();
    const token = client.handshake.auth?.token as string;
    console.log('[AuthGuardSocket] handshake.auth =', client.handshake?.auth)
    console.log('[AuthGuardSocket] handshake.headers =', client.handshake?.headers);

    if (!token) return false;

    try {
      const payload = this.jwtService.decode(token) as any;
      if (!payload?.sub) return false;

      // Facultatif : vérifier que le joueur existe encore
      const joueur = await this.prisma.joueur.findUnique({
        where: { auth0Sub: payload.sub },
      });
      if (!joueur) return false;

      client.user = {
        sub: joueur.id,
        email: joueur.email,
        username: joueur.username,
      };
      console.log('AuthGuardSocket called')
      console.log(`[AuthGuardSocket] Auth OK pour joueur ${client.user.username} (id=${client.user.sub})`);
      return true;
    } catch {
      return false;
    }
  }
}
