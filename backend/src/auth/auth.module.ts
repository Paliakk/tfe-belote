import { Global, Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { JwtStrategy } from './jwt.strategy';
import { PrismaModule } from 'src/prisma/prisma.module';
import { EnsureJoueurGuard } from './ensure-joueur.guard';
import { JwtAuthGuard } from './jwt-auth.guard';
import { AuthController } from './auth.controller';
import { UsersModule } from 'src/users/users.module';
import { AuthGuardSocket } from './auth-socket.guard';
@Global()
@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    PrismaModule,
    JwtModule.register({}), // <- même vide, nécessaire pour fournir JwtService
    UsersModule,
  ],
  providers: [JwtStrategy, JwtAuthGuard, EnsureJoueurGuard, AuthGuardSocket],
  exports: [
    JwtStrategy,
    JwtAuthGuard,
    EnsureJoueurGuard,
    JwtModule, // <- important pour réexporter JwtService
    AuthGuardSocket,
  ],
  controllers: [AuthController],
})
export class AuthModule {}
