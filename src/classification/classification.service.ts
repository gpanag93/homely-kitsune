import { Injectable } from '@nestjs/common';
import { KamernetClassifier } from './kamernet/kamernet.classifier';
import { HuurwoClassifier } from './huurwo/huurwo.classifier';

@Injectable()
export class ClassificationService {
  constructor(
    private kamernetClassifier: KamernetClassifier,
    private huurwoClassifier: HuurwoClassifier,
    // inject others later if needed
  ) {}

  async classify(): Promise<void> {
    await this.kamernetClassifier.classify();
    await this.huurwoClassifier.classify();
  }
}

