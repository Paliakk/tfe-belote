import { Test, TestingModule } from '@nestjs/testing';
import { PlayController } from './play.controller';
import { PlayService } from './play.service';
import { RulesService } from './rules.service';
import { PlayQueriesService } from './play.queries';
import { TrickService } from './trick.service';

describe('PlayController', () => {
  let controller: PlayController;

  const playMock = { playCard: jest.fn() };
  const rulesMock = {}; // pas utilisé directement par le contrôleur
  const queriesMock = {
    getPlayable: jest.fn(),
    getHand: jest.fn(),
    getActiveTrick: jest.fn(),
    getActiveManche: jest.fn(),
  };
  const trickMock = { closeCurrentTrick: jest.fn(), previousTrick: jest.fn(), scoreLive: jest.fn() };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PlayController],
      providers: [
        { provide: PlayService, useValue: playMock },
        { provide: RulesService, useValue: rulesMock },
        { provide: PlayQueriesService, useValue: queriesMock },
        { provide: TrickService, useValue: trickMock },
      ],
    }).compile();

    controller = module.get<PlayController>(PlayController);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('POST /:mancheId/play -> play.playCard', async () => {
    playMock.playCard.mockResolvedValue({ ok: true });
    await expect(controller.playCard(10, { joueurId: 2, carteId: 15 })).resolves.toEqual({ ok: true });
    expect(playMock.playCard).toHaveBeenCalledWith(10, 2, 15);
  });

  it('GET /:mancheId/playable -> queries.getPlayable', async () => {
    queriesMock.getPlayable.mockResolvedValue({ ids: [1, 2] });
    await expect(controller.playable(3, 7)).resolves.toEqual({ ids: [1, 2] });
    expect(queriesMock.getPlayable).toHaveBeenCalledWith(3, 7);
  });

  it('GET /:mancheId/hand -> queries.getHand', async () => {
    queriesMock.getHand.mockResolvedValue({ cards: [1, 2, 3] });
    await expect(controller.hand(4, 8)).resolves.toEqual({ cards: [1, 2, 3] });
    expect(queriesMock.getHand).toHaveBeenCalledWith(4, 8);
  });

  it('GET /active-trick/:mancheId -> queries.getActiveTrick', async () => {
    queriesMock.getActiveTrick.mockResolvedValue({ pli: 2 });
    await expect(controller.activeTrick(11)).resolves.toEqual({ pli: 2 });
    expect(queriesMock.getActiveTrick).toHaveBeenCalledWith(11);
  });

  it('GET /active/:partieId -> queries.getActiveManche', async () => {
    queriesMock.getActiveManche.mockResolvedValue({ id: 44 });
    await expect(controller.activeManche(99)).resolves.toEqual({ id: 44 });
    expect(queriesMock.getActiveManche).toHaveBeenCalledWith(99);
  });

  it('POST /:mancheId/close-trick -> trick.closeCurrentTrick', async () => {
    trickMock.closeCurrentTrick.mockResolvedValue({ closed: true });
    await expect(controller.closeTrick(5)).resolves.toEqual({ closed: true });
    expect(trickMock.closeCurrentTrick).toHaveBeenCalledWith(5);
  });

  it('GET /previous-trick/:mancheId -> trick.previousTrick', async () => {
    trickMock.previousTrick.mockResolvedValue({ numero: 3 });
    await expect(controller.previousTrick(6)).resolves.toEqual({ numero: 3 });
    expect(trickMock.previousTrick).toHaveBeenCalledWith(6);
  });

  it('GET /score-live/:mancheId -> trick.scoreLive', async () => {
    trickMock.scoreLive.mockResolvedValue({ team1: 10, team2: 20 });
    await expect(controller.scoreLive(7)).resolves.toEqual({ team1: 10, team2: 20 });
    expect(trickMock.scoreLive).toHaveBeenCalledWith(7);
  });
});
