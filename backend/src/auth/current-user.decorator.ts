import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export const CurrentJoueurId = createParamDecorator(
  (data: unknown, ctx: ExecutionContext) => {
    const req = ctx.switchToHttp().getRequest();
    return req.user?.joueurId as number | undefined;
  },
);
export interface AuthUser {
  sub: number;            // id du Joueur
  username?: string;
  email?: string;
}
export interface JwtPayloadLike { sub: number; username?: string; email?: string; }

// Décorateur pour les contrôleurs HTTP (req.user rempli par ton guard JWT)
export const CurrentUser = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): JwtPayloadLike => {
    const req = ctx.switchToHttp().getRequest();
    return req.user; // doit contenir { sub:number, ... }
  },
);

// (Optionnel) helper pour WebSocket si besoin plus tard
export function getWsUser(ctx: ExecutionContext): AuthUser | undefined {
  const client = ctx.switchToWs().getClient();
  return client?.user as AuthUser | undefined;
}
