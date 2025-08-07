import { Module } from '@nestjs/common';
import { KamernetScrapingService } from './kamernet/kamernet.service';
import { HuurwoScrapingService } from './huurwoningen/huurwoningen.service';
import { EmailModule } from '../email/email.module';
import { ErrorBufferModule } from '../monitoring/error-buffer.module';

@Module({
    imports: [EmailModule, ErrorBufferModule],
    providers: [KamernetScrapingService, HuurwoScrapingService],
    exports: [KamernetScrapingService, HuurwoScrapingService],
})
export class ScraperModule {}