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
      issuer,                                       // e.g. https://xxx.eu.auth0.com/
      audience: process.env.AUTH0_AUDIENCE,         // https://belote-api
      algorithms: ['RS256'],
      secretOrKeyProvider: jwksRsa.passportJwtSecret({
        cache: true,
        rateLimit: true,
        jwksRequestsPerMinute: 10,
        jwksUri: issuer + '.well-known/jwks.json',  // .../.well-known/jwks.json
      }),
      ignoreExpiration: false,
    });
  }

  async validate(payload: any) {
    return {
      auth0Sub: payload.sub as string,
      email: payload.email,
      name: payload.name,
      nickname: payload.nickname,
      picture: payload.picture,
    };
  }
}
export interface JwtPayload {
  sub: number; // joueurId
  email: string;
  username: string;
}
