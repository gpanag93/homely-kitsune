import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { ErrorBufferService, ErrorEntry } from '../../monitoring/error-buffer.service';

@Catch() // catch *every* unhandled exception
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  constructor(private readonly errorBuffer: ErrorBufferService) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx      = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request  = ctx.getRequest<Request>();

    // 1️⃣ Determine status & message
    const status: number =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const message: string =
      exception instanceof HttpException
        ? exception.message
        : 'Internal server error';

    // 2️⃣ Build structured entry + push to buffer
    const errorEntry: ErrorEntry = {
      timestamp: new Date().toISOString(),
      path: request.url,
      method: request.method,
      message,
      stack: exception instanceof Error ? exception.stack : undefined,
    };
    this.errorBuffer.addError(errorEntry);

    // 3️⃣ Log locally for quick diagnosis
    this.logger.error(
      `${request.method} ${request.url} → ${status} | ${message}`,
      exception instanceof Error ? exception.stack : undefined,
    );

    // 4️⃣ Standardised API response
    response.status(status).json({
      statusCode: status,
      message,
      timestamp: errorEntry.timestamp,
      path: request.url,
    });
  }
}
