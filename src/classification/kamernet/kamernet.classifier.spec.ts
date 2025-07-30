import { Test, TestingModule } from '@nestjs/testing';
import { KamernetClassifier } from './kamernet.classifier';

describe('KamernetClassifierService', () => {
  let service: KamernetClassifier;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [KamernetClassifier],
    }).compile();

    service = module.get<KamernetClassifier>(KamernetClassifier);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
