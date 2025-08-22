import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from 'src/prisma/prisma.service';
import { UsersService } from 'src/users/users.service';

@Injectable()
export class EnsureJoueurGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService, private readonly users: UsersService, private readonly jwt: JwtService) { }

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest();
    if (process.env.AUTH_DISABLED === 'true') {
      // Mode dev: mappe sur un joueur seed (id=1) si absent
      req.user = { joueurId: 1, auth0Sub: null };
      return true;
    }

    const u = req.user as any; // injecté par JwtStrategy
    if (!u?.auth0Sub) return false;

    // Essayez d'enrichir avec l'ID token si fourni par le front
    const idToken = (req.headers['x-id-token'] as string) || null;
    let enriched = { email: u.email, name: u.name, nickname: u.nickname, picture: u.picture };
    if (idToken) {
      try {
        // Pour un ID Token, l’audience = clientId SPA, l’issuer = AUTH0_ISSUER_URL
        const decoded: any = await this.jwt.decode(idToken);
        if (decoded) {
          enriched.email = enriched.email ?? decoded.email ?? null;
          enriched.name = enriched.name ?? decoded.name ?? null;
          enriched.nickname = enriched.nickname ?? decoded.nickname ?? null;
          enriched.picture = enriched.picture ?? decoded.picture ?? null;
        }
      } catch {
        // pas bloquant : on continue avec ce qu’on a
      }
    }

    const joueur = await this.users.ensureFromAuth0({
      sub: u.auth0Sub,
      email: enriched.email,
      name: enriched.name,
      nickname: enriched.nickname,
      picture: enriched.picture,
    });
    req.user.joueurId = joueur.id
    return true;
  }
}
