import { Test, TestingModule } from '@nestjs/testing';
import { KamernetScrapingService } from './kamernet.service';

describe('KamernetScrapingService', () => {
  let service: KamernetScrapingService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [KamernetScrapingService],
    }).compile();

    service = module.get<KamernetScrapingService>(KamernetScrapingService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
