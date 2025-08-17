// src/app.controller.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PlayQueriesService } from 'src/play/play.queries';

describe('AppController', () => {
  let appController: AppController;

  const playQueriesMock = {
    // ajoute des méthodes si AppController en utilise
    getActiveManche: jest.fn().mockResolvedValue({ id: 1 }),
  };

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [
        AppService,
        { provide: PlayQueriesService, useValue: playQueriesMock },
      ],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  it('root -> should return "Hello World!"', () => {
    expect(appController.getHello()).toBe('Hello World!');
  });
});
