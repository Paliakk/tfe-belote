import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { JwtStrategy } from './jwt.strategy';
import { PrismaModule } from 'src/prisma/prisma.module';
import { EnsureJoueurGuard } from './ensure-joueur.guard';
import { JwtAuthGuard } from './jwt-auth.guard';
import { AuthController } from './auth.controller';

@Module({
  imports: [PassportModule.register({ defaultStrategy: 'jwt' }), PrismaModule],
  providers: [JwtStrategy, EnsureJoueurGuard,JwtAuthGuard],
  exports: [EnsureJoueurGuard,JwtAuthGuard],
  controllers:[AuthController]
})
export class AuthModule {}