import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';

function normalizeUsernameSeed(s?: string | null): string {
  const raw = (s ?? '').toString().trim();
  if (!raw) return '';
  // enlève les accents, passe en minuscule, garde [a-z0-9._-]
  const noAccents = raw.normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
  const cleaned = noAccents.toLowerCase().replace(/[^a-z0-9._-]/g, '');
  return cleaned;
}

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) { }

  async findByAuth0Sub(auth0Sub: string | number) {
    if (typeof auth0Sub === 'number') {
      return this.prisma.joueur.findUnique({
        where: { id: auth0Sub },
        select: { id: true, username: true, email: true, auth0Sub: true },
      });
    }
    return this.prisma.joueur.findUnique({
      where: { auth0Sub }, // string
      select: { id: true, username: true, email: true, auth0Sub: true },
    });
  }


  async ensureFromAuth0(u: {
    sub: string;
    email?: string | null;
    name?: string | null;
    nickname?: string | null;
    picture?: string | null;
  }) {
    // 0) garde-fou
    if (!u?.sub) {
      throw new Error('ensureFromAuth0: missing sub');
    }

    // 1) par sub
    const joueur = await this.prisma.joueur.findUnique({
      where: { auth0Sub: u.sub },
    });
    if (joueur) {
      // mise à jour douce (ne JAMAIS écraser email par null)
      return this.prisma.joueur.update({
        where: { id: joueur.id },
        data: {
          email: u.email ?? joueur.email,
          displayName: u.name ?? joueur.displayName ?? joueur.username,
          avatarUrl: u.picture ?? joueur.avatarUrl,
        },
      });
    }

    // 2) par email si dispo
    if (u.email) {
      const byEmail = await this.prisma.joueur.findUnique({
        where: { email: u.email },
      });
      if (byEmail) {
        return this.prisma.joueur.update({
          where: { id: byEmail.id },
          data: {
            auth0Sub: u.sub,
            displayName: u.name ?? byEmail.displayName ?? byEmail.username,
            avatarUrl: u.picture ?? byEmail.avatarUrl,
          },
        });
      }
    }

    // 3) création propre
    // 3.a) choisir une graine de username (ordre: localPart(email), nickname, name)
    const localPart = u.email ? u.email.split('@')[0] : '';
    let seed =
      normalizeUsernameSeed(localPart) ||
      normalizeUsernameSeed(u.nickname) ||
      normalizeUsernameSeed(u.name);

    if (!seed) seed = 'user'; // dernier filet de sécurité

    // 3.b) garantir l'unicité du username
    let username = seed;
    let bump = 0;
    // essaie jusqu'à trouver un username libre (ex: igor.mio16, igor.mio161234, …)
    while (await this.prisma.joueur.findUnique({ where: { username } })) {
      bump = Math.floor(1000 + Math.random() * 9000);
      username = `${seed}${bump}`;
    }

    // 3.c) email : vrai email si fourni, sinon fabrique un unique "no-email" stable
    let email = u.email ?? `${username}@no-email.local`;
    if (!u.email) {
      // assure l'unicité (contrainte unique Prisma)
      while (await this.prisma.joueur.findUnique({ where: { email } })) {
        const r = Math.floor(1000 + Math.random() * 9000);
        email = `${username}${r}@no-email.local`;
      }
    }

    // 3.d) displayName
    const displayName = u.name && u.name.trim() ? u.name.trim() : username;

    // 3.e) création
    return this.prisma.joueur.create({
      data: {
        username,
        email,
        auth0Sub: u.sub,
        displayName,
        avatarUrl: u.picture ?? null,
        estConnecte: false, // mis à true par le guard WS
      },
    });
  }
  async findById(id: number) {
    return this.prisma.joueur.findUnique({
      where: { id },
      select: { id: true, username: true, email: true, auth0Sub: true },
    });
  }
}
