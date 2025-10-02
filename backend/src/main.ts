import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from './users/users.service';
import { WsAuthAdapter } from './auth/ws-auth.adapter';
import helmet from 'helmet';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Validation globale des DTOs
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  // CORS pour le front pour plus tard
app.enableCors({
  origin: (origin, cb) => {
    const allowed = [
      'http://localhost:5173',
      process.env.FRONTEND_URL,     // ex: https://app.ton-domaine.tld
    ].filter(Boolean) as string[]
    // autoriser les apps installées (origin null) ↴
    if (!origin || allowed.includes(origin)) return cb(null, true)
    return cb(new Error(`CORS: ${origin} not allowed`), false)
  },
  credentials: true,
})
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));
  //Adapter WS (auth au handshake)
  const jwt = app.get(JwtService)
  const users = app.get(UsersService)
  app.useWebSocketAdapter(new WsAuthAdapter(app,jwt,users))

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
