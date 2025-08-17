import { Test, TestingModule } from '@nestjs/testing';
import { LobbyController } from './lobby.controller';
import { LobbyService } from './lobby.service';
import { ValidationPipe } from '@nestjs/common';

describe('LobbyController', () => {
  let controller: LobbyController;

  const serviceMock = {
    create: jest.fn().mockResolvedValue({
      id: 1, nom: 'X', statut: 'en_attente', password: 'secret', // <= ajouter password
      createurId: 1, createdAt: new Date(), partieId: null,
    }),
    findByIdOrThrow: jest.fn().mockResolvedValue({
      id: 1, nom: 'X', statut: 'en_attente', password: 'secret',
      createdAt: new Date(),
      createur: { id: 1, username: 'u' },
      partie: null,
    }),
    join: jest.fn(),
    listMembers: jest.fn(),
    leave: jest.fn(),
    startGame: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [LobbyController],
      providers: [{ provide: LobbyService, useValue: serviceMock }],
    })
      // le pipe n’est pas strictement nécessaire ici, on teste la délégation
      .compile();

    controller = module.get<LobbyController>(LobbyController);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('POST / -> create', async () => {
    serviceMock.create.mockResolvedValue({ id: 1, nom: 'X', statut: 'en_attente', createurId: 1, createdAt: new Date(),partieId:null,password:'secret' });
    const dto = { nom: 'Mon Lobby', password: 'abc' };
    const res = await controller.createLobby(dto as any);
    expect(serviceMock.create).toHaveBeenCalledWith(dto, 1);
    expect(res).toMatchObject({ id: 1, nom: 'X', estPrive: true });
  });

  it('GET /:id -> findByIdOrThrow', async () => {
    serviceMock.findByIdOrThrow.mockResolvedValue({
      id: 2, nom: 'L2', statut: 'en_attente', password: null, createdAt: new Date(),
      createur: { id: 10, username: 'u' }, partie: null
    });
    const res = await controller.getLobby(2);
    expect(serviceMock.findByIdOrThrow).toHaveBeenCalledWith(2);
    expect(res).toMatchObject({ id: 2, nom: 'L2', estPrive: false });
  });

  it('POST /join -> join', async () => {
    serviceMock.join.mockResolvedValue({ ok: true });
    await expect(controller.joinLobby({ lobbyId: 3, joueurId: 7 } as any)).resolves.toEqual({ ok: true });
    expect(serviceMock.join).toHaveBeenCalledWith({ lobbyId: 3, joueurId: 7 });
  });

  it('GET /:id/members -> listMembers', async () => {
    serviceMock.listMembers.mockResolvedValue({ lobbyId: 5, nbMembres: 2 });
    await expect(controller.listMembers(5)).resolves.toEqual({ lobbyId: 5, nbMembres: 2 });
    expect(serviceMock.listMembers).toHaveBeenCalledWith(5);
  });

  it('POST /:id/leave -> leave', async () => {
    serviceMock.leave.mockResolvedValue({ message: 'ok' });
    await expect(controller.leave(9, { joueurId: 12 } as any)).resolves.toEqual({ message: 'ok' });
    expect(serviceMock.leave).toHaveBeenCalledWith(9, 12);
  });

  it('POST /:id/start -> startGame', async () => {
    serviceMock.startGame.mockResolvedValue({ started: true });
    await expect(controller.startGame(8, { joueurId: 1, scoreMax: 301 } as any)).resolves.toEqual({ started: true });
    expect(serviceMock.startGame).toHaveBeenCalledWith(8, { joueurId: 1, scoreMax: 301 });
  });
});
