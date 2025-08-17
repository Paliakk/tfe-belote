import { Test, TestingModule } from '@nestjs/testing';
import { MancheController } from './manche.controller';
import { MancheService } from './manche.service';

describe('MancheController', () => {
  let controller: MancheController;

  const serviceMock = {
    relancerMancheByMancheId: jest.fn(),
    relancerMancheByPartieId: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [MancheController],
      providers: [{ provide: MancheService, useValue: serviceMock }],
    }).compile();

    controller = module.get<MancheController>(MancheController);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('POST /manche/:mancheId/relancer -> service.relancerMancheByMancheId', async () => {
    serviceMock.relancerMancheByMancheId.mockResolvedValue({ newMancheId: 123, numero: 2 });
    await expect(controller.relancerByManche(10)).resolves.toEqual({ newMancheId: 123, numero: 2 });
    expect(serviceMock.relancerMancheByMancheId).toHaveBeenCalledWith(10);
  });

  it('POST /partie/:partieId/relancer -> service.relancerMancheByPartieId', async () => {
    serviceMock.relancerMancheByPartieId.mockResolvedValue({ newMancheId: 456, numero: 3 });
    await expect(controller.relancerByPartie(9)).resolves.toEqual({ newMancheId: 456, numero: 3 });
    expect(serviceMock.relancerMancheByPartieId).toHaveBeenCalledWith(9);
  });
});
