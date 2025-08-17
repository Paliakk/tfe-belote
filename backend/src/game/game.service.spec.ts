// src/game/game.service.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { GameService } from './game.service';
import { PrismaService } from 'src/prisma/prisma.service';

describe('GameService', () => {
  let service: GameService;

  const prismaMock = {
    partie: { findUnique: jest.fn(), update: jest.fn() },
    lobby: { update: jest.fn() },
    $transaction: (fn: any) => fn(prismaMock),
  } as unknown as PrismaService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GameService,
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();

    service = module.get<GameService>(GameService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
