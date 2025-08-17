// src/bidding/bidding.service.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { BiddingService } from './bidding.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { MancheService } from 'src/manche/manche.service';

describe('BiddingService', () => {
  let service: BiddingService;

  const prismaMock = {
    manche: { findUnique: jest.fn(), findFirst: jest.fn(), update: jest.fn() },
    enchere: { create: jest.fn() },
    main: { count: jest.fn(), create: jest.fn(), createMany: jest.fn() },
    $transaction: (fn: any) => fn(prismaMock),
  } as unknown as PrismaService;

  const mancheServiceMock = {
    relancerMancheByMancheId: jest.fn(),
  } as unknown as MancheService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BiddingService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: MancheService, useValue: mancheServiceMock },
      ],
    }).compile();

    service = module.get<BiddingService>(BiddingService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
