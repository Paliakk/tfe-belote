// src/manche/manche.service.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { MancheService } from './manche.service';
import { PrismaService } from 'src/prisma/prisma.service';

describe('MancheService', () => {
  let service: MancheService;

  const prismaMock = {
    manche: { findUnique: jest.fn(), findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
    partie: { update: jest.fn() },
    carte: { findMany: jest.fn() },
    main: { createMany: jest.fn() },
    $transaction: (fn: any) => fn(prismaMock),
  } as unknown as PrismaService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MancheService,
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();

    service = module.get<MancheService>(MancheService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
