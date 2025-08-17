import { Test, TestingModule } from '@nestjs/testing';
import { BiddingController } from './bidding.controller';
import { BiddingService } from './bidding.service';

describe('BiddingController', () => {
  let controller: BiddingController;

  const serviceMock = {
    getState: jest.fn(),
    placeBid: jest.fn(),
    getActiveMancheIdByPartie: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [BiddingController],
      providers: [{ provide: BiddingService, useValue: serviceMock }],
    }).compile();

    controller = module.get<BiddingController>(BiddingController);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('state() délègue à service.getState', async () => {
    serviceMock.getState.mockResolvedValue({ ok: true });
    await expect(controller.state(42)).resolves.toEqual({ ok: true });
    expect(serviceMock.getState).toHaveBeenCalledWith(42);
  });

  it('placeBid() délègue à service.placeBid', async () => {
    const dto = { joueurId: 1, type: 'pass' as any };
    serviceMock.placeBid.mockResolvedValue({ msg: 'done' });
    await expect(controller.placeBid(7, dto as any)).resolves.toEqual({ msg: 'done' });
    expect(serviceMock.placeBid).toHaveBeenCalledWith(7, dto);
  });

  it('getActive() délègue à service.getActiveMancheIdByPartie', async () => {
    serviceMock.getActiveMancheIdByPartie.mockResolvedValue({ id: 99, numero: 3 });
    await expect(controller.getActive(5)).resolves.toEqual({ id: 99, numero: 3 });
    expect(serviceMock.getActiveMancheIdByPartie).toHaveBeenCalledWith(5);
  });
});
