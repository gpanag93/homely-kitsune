import { Injectable } from '@nestjs/common';
import { KamernetClassifier } from './kamernet/kamernet.classifier';

@Injectable()
export class ClassificationService {
  constructor(
    private kamernetClassifier: KamernetClassifier,
    // inject others later if needed
  ) {}

  async classify(): Promise<void> {
    await this.kamernetClassifier.classify();
  }
}

