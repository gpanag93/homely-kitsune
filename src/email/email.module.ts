import { Module } from '@nestjs/common';
import { EmailService } from './email.service';
import { ErrorBufferModule } from '../monitoring/error-buffer.module';

@Module({
  imports: [ErrorBufferModule],
  providers: [EmailService],
  exports: [EmailService],
})
export class EmailModule {}