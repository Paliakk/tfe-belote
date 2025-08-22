// jwt.strategy.ts
import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import * as jwksRsa from 'jwks-rsa';

function issuerBase() {
  const raw = process.env.AUTH0_ISSUER_URL ?? '';
  // remove trailing slashes then add one
  return raw.replace(/\/+$/, '') + '/';
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
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
    const NS = 'https://belote-api/claims';

    const email = payload[`${NS}/email`] ?? payload.email ?? null;
    const name = payload[`${NS}/name`] ?? payload.name ?? null;
    const nickname = payload[`${NS}/nickname`] ?? payload.nickname ?? null;
    const picture = payload[`${NS}/picture`] ?? payload.picture ?? null;

    return {
      auth0Sub: payload.sub as string, // ex: 'auth0|abc...'
      email,
      name,
      nickname,
      picture,
    };
  }
}
export interface JwtPayload {
  sub: number; // joueurId
  email: string;
  username: string;
}
