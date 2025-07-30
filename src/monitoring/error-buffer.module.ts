// error-buffer/error-buffer.module.ts
import { Module } from '@nestjs/common';
import { ErrorBufferService } from './error-buffer.service';

@Module({
  providers: [ErrorBufferService],
  exports: [ErrorBufferService],
})
export class ErrorBufferModule {}
