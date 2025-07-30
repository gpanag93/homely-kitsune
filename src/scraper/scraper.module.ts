import { Module } from '@nestjs/common';
import { KamernetService } from './kamernet.service';
import { EmailModule } from '../email/email.module';
import { ErrorBufferModule } from '../monitoring/error-buffer.module';

@Module({
    imports: [EmailModule, ErrorBufferModule],
    providers: [KamernetService],
    exports: [KamernetService],
})
export class ScraperModule {}