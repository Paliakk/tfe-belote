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

// username "générique" (créé sans info: user, user1234, …)
function isGenericUsername(u?: string | null): boolean {
  return !!u && /^user(\d+)?$/i.test(u);
}

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

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
    if (!u?.sub) throw new Error('ensureFromAuth0: missing sub');

    // 1) par sub
    const joueur = await this.prisma.joueur.findUnique({ where: { auth0Sub: u.sub } });
    if (joueur) {
      // Mise à jour douce des champs visibles
      const data: any = {
        email: u.email ?? joueur.email,
        displayName: u.name ?? joueur.displayName ?? joueur.username,
        avatarUrl: u.picture ?? joueur.avatarUrl,
      };

      // 👉 Upgrade du username si l'actuel est "générique"
      if (isGenericUsername(joueur.username)) {
        const localPart = u.email ? u.email.split('@')[0] : '';
        const seedCandidate =
          normalizeUsernameSeed(localPart) ||
          normalizeUsernameSeed(u.nickname) ||
          normalizeUsernameSeed(u.name) ||
          '';

        if (seedCandidate) {
          let username = seedCandidate;
          while (await this.prisma.joueur.findUnique({ where: { username } })) {
            const bump = Math.floor(1000 + Math.random() * 9000);
            username = `${seedCandidate}${bump}`;
          }
          data.username = username;
        }
      }

      return this.prisma.joueur.update({ where: { id: joueur.id }, data });
    }

    // 2) par email si dispo
    if (u.email) {
      const byEmail = await this.prisma.joueur.findUnique({ where: { email: u.email } });
      if (byEmail) {
        const data: any = {
          auth0Sub: u.sub,
          displayName: u.name ?? byEmail.displayName ?? byEmail.username,
          avatarUrl: u.picture ?? byEmail.avatarUrl,
        };

        // 👉 Upgrade aussi si ce compte email avait un username générique
        if (isGenericUsername(byEmail.username)) {
          const localPart = u.email.split('@')[0];
          const seedCandidate =
            normalizeUsernameSeed(localPart) ||
            normalizeUsernameSeed(u.nickname) ||
            normalizeUsernameSeed(u.name) ||
            '';

          if (seedCandidate) {
            let username = seedCandidate;
            while (await this.prisma.joueur.findUnique({ where: { username } })) {
              const bump = Math.floor(1000 + Math.random() * 9000);
              username = `${seedCandidate}${bump}`;
            }
            data.username = username;
          }
        }

        return this.prisma.joueur.update({ where: { id: byEmail.id }, data });
      }
    }

    // 3) création propre
    const localPart = u.email ? u.email.split('@')[0] : '';
    let seed =
      normalizeUsernameSeed(localPart) ||
      normalizeUsernameSeed(u.nickname) ||
      normalizeUsernameSeed(u.name);

    if (!seed) seed = 'user'; // dernier filet de sécurité

    let username = seed;
    while (await this.prisma.joueur.findUnique({ where: { username } })) {
      const bump = Math.floor(1000 + Math.random() * 9000);
      username = `${seed}${bump}`;
    }

    // email : vrai email si fourni, sinon fabrique un unique "no-email" stable
    let email = u.email ?? `${username}@no-email.local`;
    if (!u.email) {
      while (await this.prisma.joueur.findUnique({ where: { email } })) {
        const r = Math.floor(1000 + Math.random() * 9000);
        email = `${username}${r}@no-email.local`;
      }
    }

    const displayName = u.name && u.name.trim() ? u.name.trim() : username;

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
