// ws-jwt.guard.ts
import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Socket } from 'socket.io';
import * as jwt from 'jsonwebtoken';
import jwksRsa from 'jwks-rsa';

@Injectable()
export class WsJwtGuard implements CanActivate {
  private client;

  constructor() {
    // Config identique à jwt.strategy.ts
    const issuer = (process.env.AUTH0_ISSUER_URL ?? '').replace(/\/+$/, '') + '/';
    this.client = jwksRsa({
      cache: true,
      rateLimit: true,
      jwksRequestsPerMinute: 10,
      jwksUri: issuer + '.well-known/jwks.json',
    });
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const client: Socket = context.switchToWs().getClient();
    const token =
      client.handshake.auth?.token ||
      (client.handshake.query?.token as string);

    if (!token) return false;

    try {
      const decoded: any = await new Promise((resolve, reject) => {
        const getKey = (header, callback) => {
          this.client.getSigningKey(header.kid, (err, key) => {
            if (err) return callback(err, null);
            const signingKey = key.getPublicKey();
            callback(null, signingKey);
          });
        };

        jwt.verify(
          token,
          getKey,
          {
            algorithms: ['RS256'],
            audience: process.env.AUTH0_AUDIENCE,
            issuer: (process.env.AUTH0_ISSUER_URL ?? '').replace(/\/+$/, '') + '/',
          },
          (err, payload) => {
            if (err) return reject(err);
            resolve(payload);
          },
        );
      });

      client.data.user = decoded; // 👈 on stocke le user validé
      return true;
    } catch (e) {
      console.error('❌ WS JWT Guard: token invalide', e.message);
      return false;
    }
  }
}
