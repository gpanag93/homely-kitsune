import { Module } from '@nestjs/common';
import { KamernetScrapingService } from './kamernet.service';
import { EmailModule } from '../email/email.module';
import { ErrorBufferModule } from '../monitoring/error-buffer.module';

@Module({
    imports: [EmailModule, ErrorBufferModule],
    providers: [KamernetScrapingService],
    exports: [KamernetScrapingService],
})
export class ScraperModule {}