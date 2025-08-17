// src/play/play.service.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { PlayService } from './play.service';
import { RulesService } from './rules.service';
import { TrickService } from './trick.service';
import { PrismaService } from 'src/prisma/prisma.service';

describe('PlayService', () => {
  let service: PlayService;

  const prismaMock = {
    $transaction: (cb: any) => cb(prismaTxMock),
  } as unknown as PrismaService;

  // tx minimal pour que l’initialisation passe si on l’utilise
  const prismaTxMock: any = {
    manche: { findUnique: jest.fn() },
    pli: { create: jest.fn(), findUnique: jest.fn() },
    pliCarte: { create: jest.fn(), findUnique: jest.fn() },
    main: { updateMany: jest.fn() },
    // …ajoute au besoin d’autres modèles
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PlayService,
        RulesService,
        TrickService,
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();

    service = module.get<PlayService>(PlayService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
