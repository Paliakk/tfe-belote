import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
   // Validation globale des DTOs
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  // CORS pour le front pour plus tard
  app.enableCors({
    origin: true, // ou ['http://localhost:5173'] plus tard pour le front
    credentials: true,
  });
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
