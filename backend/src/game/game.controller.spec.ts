import { Test, TestingModule } from '@nestjs/testing';
import { GameController } from './game.controller';
import { GameService } from './game.service';

describe('GameController', () => {
  let controller: GameController;

  const serviceMock = {
    quitGame: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [GameController],
      providers: [{ provide: GameService, useValue: serviceMock }],
    }).compile();

    controller = module.get<GameController>(GameController);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('POST /:id/quit -> gameService.quitGame', async () => {
    serviceMock.quitGame.mockResolvedValue({ message: 'ok' });
    await expect(controller.quitGame(55, { joueurId: 7 } as any)).resolves.toEqual({ message: 'ok' });
    expect(serviceMock.quitGame).toHaveBeenCalledWith(55, 7);
  });
});
