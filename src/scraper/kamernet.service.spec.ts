import { Test, TestingModule } from '@nestjs/testing';
import { KamernetService } from './kamernet.service';

describe('KamernetService', () => {
  let service: KamernetService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [KamernetService],
    }).compile();

    service = module.get<KamernetService>(KamernetService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
