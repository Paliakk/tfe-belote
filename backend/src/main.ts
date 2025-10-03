import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from './users/users.service';
import { WsAuthAdapter } from './auth/ws-auth.adapter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Validation globale des DTOs
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  // CORS pour le front pour plus tard
  app.enableCors({
    origin: [
    'http://localhost:5173',
    'https://scintillating-reverence-production.up.railway.app'
      
    ], // ou ['http://localhost:5173'] plus tard pour le front
    methods: 'GET,HEAD,POST,PUT,PATCH,DELETE,OPTIONS',
    allowedHeaders: 'Content-Type, Authorization',
    credentials: true,
  });

  //Adapter WS (auth au handshake)
  const jwt = app.get(JwtService)
  const users = app.get(UsersService)
  app.useWebSocketAdapter(new WsAuthAdapter(app,jwt,users))

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
