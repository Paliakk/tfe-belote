import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export const CurrentJoueurId = createParamDecorator(
  (data: unknown, ctx: ExecutionContext) => {
    const req = ctx.switchToHttp().getRequest();
    return req.user?.joueurId as number | undefined;
  },
);
