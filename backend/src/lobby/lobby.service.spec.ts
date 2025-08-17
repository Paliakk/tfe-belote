// src/lobby/lobby.service.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { LobbyService } from './lobby.service';
import { PrismaService } from 'src/prisma/prisma.service';

describe('LobbyService', () => {
  let service: LobbyService;

  const prismaMock = {
    lobby: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn(), delete: jest.fn(), findFirst: jest.fn() },
    lobbyJoueur: { create: jest.fn(), delete: jest.fn(), deleteMany: jest.fn(), count: jest.fn(), findUnique: jest.fn(), findFirst: jest.fn() },
    joueur: { findUnique: jest.fn() },
    partie: { create: jest.fn(), update: jest.fn() },
    equipe: { create: jest.fn() },
    equipeJoueur: { createMany: jest.fn() },
    carte: { findMany: jest.fn() },
    main: { createMany: jest.fn() },
    $transaction: (fn: any) => fn(prismaMock),
  } as unknown as PrismaService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LobbyService,
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();

    service = module.get<LobbyService>(LobbyService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
