import { Test, TestingModule } from '@nestjs/testing';
import { MancheController } from './manche.controller';

describe('MancheController', () => {
  let controller: MancheController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [MancheController],
    }).compile();

    controller = module.get<MancheController>(MancheController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
