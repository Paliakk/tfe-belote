// jwt.strategy.ts
import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import * as jwksRsa from 'jwks-rsa';
import { UsersService } from 'src/users/users.service';

function issuerBase() {
  const raw = process.env.AUTH0_ISSUER_URL ?? '';
  // remove trailing slashes then add one
  return raw.replace(/\/+$/, '') + '/';
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly users: UsersService) {
    const issuer = issuerBase();
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      issuer,
      audience: process.env.AUTH0_AUDIENCE, // 'https://belote-api'
      algorithms: ['RS256'],
      secretOrKeyProvider: jwksRsa.passportJwtSecret({
        cache: true,
        rateLimit: true,
        jwksRequestsPerMinute: 10,
        jwksUri: issuer + '.well-known/jwks.json',
      }),
    });
  }

  async validate(payload: any) {
    // ⚠️ Les claims "custom namespace" Auth0 restent supportés
    const NS = 'https://belote-api/claims';
    const email = payload[`${NS}/email`] ?? payload.email ?? null;
    const name = payload[`${NS}/name`] ?? payload.name ?? null;
    const nickname = payload[`${NS}/nickname`] ?? payload.nickname ?? null;
    const picture = payload[`${NS}/picture`] ?? payload.picture ?? null;

    // ✅ Mappe le sub Auth0 (string) -> Joueur (id numérique), via ta logique existante
    const joueur = await this.users.ensureFromAuth0({
      sub: String(payload.sub),
      email,
      name,
      nickname,
      picture,
    });

    // ✅ Uniformise le "user" exposé aux contrôleurs HTTP
    return {
      sub: joueur.id,            // number (Joueur.id)
      username: joueur.username, // optionnel mais pratique
      email: joueur.email,       // optionnel
      // on peut garder l’auth0Sub en plus si tu veux t’en servir quelque part :
      auth0Sub: String(payload.sub),
    };
  }
}
export interface JwtPayload {
  sub: number; // joueurId
  email: string;
  username: string;
}
