import { Logger } from '@nestjs/common';
import { ErrorBufferService } from './error-buffer.service';

export function captureAndLogError(
  logger: Logger,
  errorBuffer: ErrorBufferService,
  scope: string,
  err: unknown,
  msg: string = ""
) {
  const stack = err instanceof Error ? err.stack : undefined;
  let message = err instanceof Error ? err.message : String(err);
  if (msg) {
    message = `${msg}\n${message}`;
  } 

  logger.error(`Error in ${scope}`, stack);

  errorBuffer.addError({
    timestamp: new Date().toISOString(),
    path: `/${scope}`,
    method: 'SYSTEM',
    message,
    stack,
  });
}
