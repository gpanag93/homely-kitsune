import { Module } from '@nestjs/common';
import { ClassificationService } from './classification.service';
import { KamernetClassifier } from './kamernet/kamernet.classifier';
import { HuurwoClassifier } from './huurwo/huurwo.classifier';
import { ErrorBufferModule } from '../monitoring/error-buffer.module';

@Module({
  imports: [ErrorBufferModule],
  providers: [ClassificationService, KamernetClassifier, HuurwoClassifier],
  exports: [ClassificationService]
})
export class ClassificationModule {}
