import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { JwtStrategy } from './jwt.strategy';
import { PrismaModule } from 'src/prisma/prisma.module';
import { EnsureJoueurGuard } from './ensure-joueur.guard';
import { JwtAuthGuard } from './jwt-auth.guard';
import { AuthController } from './auth.controller';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    PrismaModule,
    JwtModule.register({}) // <- même vide, nécessaire pour fournir JwtService
  ],
  providers: [
    JwtStrategy,
    JwtAuthGuard,
    EnsureJoueurGuard,
  ],
  exports: [
    JwtStrategy,
    JwtAuthGuard,
    EnsureJoueurGuard,
    JwtModule, // <- important pour réexporter JwtService
  ],
  controllers: [AuthController],
})
export class AuthModule {}
