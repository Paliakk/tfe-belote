import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class EnsureJoueurGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest();
    if (process.env.AUTH_DISABLED === 'true') {
      // Mode dev: mappe sur un joueur seed (id=1) si absent
      req.user = { joueurId: 1, auth0Sub: null };
      return true;
    }

    const u = req.user as any; // injecté par JwtStrategy
    if (!u?.auth0Sub) return false;

    let joueur = await this.prisma.joueur.findUnique({ where: { auth0Sub: u.auth0Sub } });
    if (!joueur) {
      // fallback par email si existant
      if (u.email) {
        const byEmail = await this.prisma.joueur.findUnique({ where: { email: u.email } });
        if (byEmail) {
          joueur = await this.prisma.joueur.update({
            where: { id: byEmail.id },
            data: {
              auth0Sub: u.auth0Sub,
              displayName: u.name ?? byEmail.username,
              avatarUrl: u.picture ?? null,
            }
          });
        }
      }
      if (!joueur) {
        // créer un joueur minimal
        const baseName = (u.nickname || u.name || 'user').replace(/\s+/g, '');
        const uniqueName = `${baseName}${Math.floor(1000 + Math.random()*9000)}`;
        joueur = await this.prisma.joueur.create({
          data: {
            username: uniqueName,
            email: u.email ?? `${uniqueName}@example.local`,
            auth0Sub: u.auth0Sub,
            displayName: u.name ?? uniqueName,
            avatarUrl: u.picture ?? null,
          }
        });
      }
    }

    req.user.joueurId = joueur.id;
    return true;
  }
}
