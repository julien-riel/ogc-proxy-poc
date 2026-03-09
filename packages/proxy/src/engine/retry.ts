import { UpstreamError, UpstreamTimeoutError } from './adapter.js';
import { logger } from '../logger.js';

export interface RetryOptions {
  maxAttempts: number;
  backoffMs: number;
  backoffMultiplier: number;
}

function isRetryable(err: unknown): boolean {
  if (err instanceof UpstreamError) {
    // Don't retry client errors (4xx) or rate limits (429)
    return err.statusCode >= 500;
  }
  if (err instanceof UpstreamTimeoutError) return true;
  // Network errors (ECONNRESET, etc.)
  if (err instanceof Error) return true;
  return false;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function withRetry<T>(fn: () => Promise<T>, options: RetryOptions): Promise<T> {
  const log = logger.adapter();

  for (let attempt = 1; attempt <= options.maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt >= options.maxAttempts || !isRetryable(err)) {
        throw err;
      }
      const delay = options.backoffMs * Math.pow(options.backoffMultiplier, attempt - 1);
      log.warning({ attempt, maxAttempts: options.maxAttempts, delayMs: delay }, 'retrying upstream request');
      await sleep(delay);
    }
  }

  // Should never reach here but TypeScript needs it
  throw new Error('Retry exhausted');
}
