import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class AuthUserMapService {
  constructor(private prisma: PrismaService) {}

  /**
   * Résout l'ID Joueur numérique depuis req.user (Auth0 payload décoré par JwtStrategy).
   * - Si user.sub est un nombre => on retourne tel quel.
   * - Sinon on s'appuie sur auth0Sub (ou sub string) et on upsert Joueur.
   */
  async ensureJoueurId(user: any): Promise<number> {
    // cas futur: JwtStrategy retourne déjà sub: number
    if (typeof user?.sub === 'number' && Number.isFinite(user.sub)) {
      return user.sub;
    }

    const auth0Sub = user?.auth0Sub ?? user?.sub;
    if (typeof auth0Sub !== 'string' || !auth0Sub) {
      throw new BadRequestException('Invalid principal: missing auth0Sub/sub');
    }

    const username =
      user?.nickname || user?.name || `user_${Math.random().toString(36).slice(2, 8)}`;
    const email =
      user?.email || `${auth0Sub.replace(/\W+/g, '_')}@example.local`;

    const joueur = await this.prisma.joueur.upsert({
      where: { auth0Sub },
      update: {
        // ici tu peux hydrater displayName / avatar si tu veux
      },
      create: {
        auth0Sub,
        username,
        email,
        estConnecte: true,
      },
      select: { id: true },
    });

    return joueur.id;
  }
}
