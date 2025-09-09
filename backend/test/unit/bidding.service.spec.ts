import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { BiddingService } from 'src/bidding/bidding.service';

class TxMock {
  manche = { findUnique: jest.fn(), findFirst: jest.fn(), update: jest.fn() };
  enchere = { create: jest.fn() };
  main = { count: jest.fn(), create: jest.fn(), createMany: jest.fn() };
  carte = { findMany: jest.fn() };
  $queryRaw = jest.fn();
}

class PrismaMock {
  _tx = new TxMock();
  $transaction = async (cb: any) => cb(this._tx);
}

class MancheServiceMock {
  relancerMancheByMancheId = jest.fn();
}

const baseManche = (over?: Partial<any>) => ({
  id: 1,
  partieId: 2,
  partie: {
    statut: 'en_cours',
    equipes: [
      {
        joueurs: [
          { ordreSiege: 0, joueurId: 10 },
          { ordreSiege: 2, joueurId: 12 },
        ],
      },
      {
        joueurs: [
          { ordreSiege: 1, joueurId: 11 },
          { ordreSiege: 3, joueurId: 13 },
        ],
      },
    ],
    lobby: null,
  },
  carteRetourneeId: 999,
  carteRetournee: { id: 999, couleurId: 4, valeur: '7' },
  tourActuel: 1,
  joueurActuelId: 10,
  preneurId: null,
  donneurJoueurId: 13,
  paquet: Array.from({ length: 32 }, (_, i) => i + 100),
  ...over,
});

describe('BiddingService', () => {
  let service: BiddingService;
  let prisma: PrismaMock;
  let mancheService: MancheServiceMock;

  beforeEach(() => {
    prisma = new PrismaMock();
    mancheService = new MancheServiceMock();
    service = new BiddingService(prisma as any, mancheService as any);
  });

  it('tour 1 : CHOOSE_COLOR interdit → BadRequest', async () => {
    prisma._tx.manche.findUnique.mockResolvedValueOnce(
      baseManche({ tourActuel: 1, joueurActuelId: 10 }),
    );
    prisma._tx.manche.findFirst.mockResolvedValueOnce({ id: 1, numero: 1 }); // latest = self

    await expect(
      service.placeBid(1, {
        joueurId: 10,
        type: 'choose_color' as any,
        couleurAtoutId: 2,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma._tx.enchere.create).not.toHaveBeenCalled();
  });

  it('tour 2 : TAKE_CARD interdit → BadRequest', async () => {
    prisma._tx.manche.findUnique.mockResolvedValueOnce(
      baseManche({ tourActuel: 2, joueurActuelId: 10 }),
    );
    prisma._tx.manche.findFirst.mockResolvedValueOnce({ id: 1, numero: 1 });

    await expect(
      service.placeBid(1, {
        joueurId: 10,
        type: 'take_card' as any,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma._tx.enchere.create).not.toHaveBeenCalled();
  });

  it('manche introuvable → NotFound', async () => {
    prisma._tx.manche.findUnique.mockResolvedValueOnce(null);

    await expect(
      service.placeBid(1, { joueurId: 10, type: 'pass' as any }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('ordre de tour : si joueurActuel ≠ joueurId → BadRequest', async () => {
    prisma._tx.manche.findUnique.mockResolvedValueOnce(
      baseManche({ joueurActuelId: 11 }),
    );
    prisma._tx.manche.findFirst.mockResolvedValueOnce({ id: 1, numero: 1 });

    await expect(
      service.placeBid(1, { joueurId: 10, type: 'pass' as any }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
