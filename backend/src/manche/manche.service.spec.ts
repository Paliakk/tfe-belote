import { Test, TestingModule } from '@nestjs/testing';
import { MancheService } from './manche.service';

describe('MancheService', () => {
  let service: MancheService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [MancheService],
    }).compile();

    service = module.get<MancheService>(MancheService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
