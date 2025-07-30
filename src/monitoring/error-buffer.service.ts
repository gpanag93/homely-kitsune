import { Injectable } from '@nestjs/common';

/** Shape of a single buffered error entry. */
export interface ErrorEntry {
  timestamp: string;   // ISO string
  path: string;
  method: string;
  message: string;
  stack?: string;
}

@Injectable()
export class ErrorBufferService {
  /** In-memory store – fine for a single-instance Docker setup. */
  private readonly errors: ErrorEntry[] = [];

  /** Called by the global filter to enqueue an error. */
  addError(entry: ErrorEntry): void {
    this.errors.push(entry);
  }

  /** Returns a *copy* of all errors and empties the buffer. */
  flush(): ErrorEntry[] {
    const copy = [...this.errors];
    this.errors.length = 0;
    return copy;
  }

  /** Quick helper for background jobs. */
  hasErrors(): boolean {
    return this.errors.length > 0;
  }
}
