// background/background.module.ts
import { Module } from '@nestjs/common';
import { BackgroundService } from './background.service';
import { ErrorBufferModule } from '../monitoring/error-buffer.module';
import { EmailModule } from '../email/email.module';
import { ScraperModule } from '../scraper/scraper.module';
import { ClassificationModule } from '../classification/classification.module';

@Module({
  imports: [ErrorBufferModule, EmailModule, ScraperModule, ClassificationModule],
  providers: [BackgroundService],
})
export class BackgroundModule {}
