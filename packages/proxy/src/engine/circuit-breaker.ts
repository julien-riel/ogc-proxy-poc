import { logger } from '../logger.js';

export enum CircuitState {
  Closed = 'closed',
  Open = 'open',
  HalfOpen = 'half-open',
}

export interface CircuitBreakerOptions {
  failureThreshold: number;
  resetTimeoutMs: number;
  halfOpenRequests: number;
}

export class CircuitBreaker {
  private _state = CircuitState.Closed;
  private failureCount = 0;
  private lastFailureTime = 0;
  private halfOpenAttempts = 0;
  private readonly options: CircuitBreakerOptions;

  constructor(options: CircuitBreakerOptions) {
    this.options = options;
  }

  get state(): CircuitState {
    if (this._state === CircuitState.Open && this.shouldAttemptReset()) {
      return CircuitState.HalfOpen;
    }
    return this._state;
  }

  canExecute(): boolean {
    const currentState = this.state;
    if (currentState === CircuitState.Closed) return true;
    if (currentState === CircuitState.HalfOpen) {
      if (this.halfOpenAttempts < this.options.halfOpenRequests) {
        this._state = CircuitState.HalfOpen;
        this.halfOpenAttempts++;
        return true;
      }
      return false;
    }
    return false;
  }

  recordSuccess(): void {
    this.failureCount = 0;
    this.halfOpenAttempts = 0;
    this._state = CircuitState.Closed;
  }

  recordFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();
    if (this._state === CircuitState.HalfOpen) {
      this._state = CircuitState.Open;
      this.halfOpenAttempts = 0;
      return;
    }
    if (this.failureCount >= this.options.failureThreshold) {
      this._state = CircuitState.Open;
      const log = logger.adapter();
      log.warning({ failureCount: this.failureCount }, 'circuit breaker opened');
    }
  }

  private shouldAttemptReset(): boolean {
    return Date.now() - this.lastFailureTime > this.options.resetTimeoutMs;
  }
}

const breakers = new Map<string, CircuitBreaker>();

export function getCircuitBreaker(collectionId: string, config?: CircuitBreakerOptions): CircuitBreaker | null {
  if (!config) return null;
  if (!breakers.has(collectionId)) {
    breakers.set(collectionId, new CircuitBreaker(config));
  }
  return breakers.get(collectionId)!;
}

/** Reset all breakers — for testing only. */
export function resetAllBreakers(): void {
  breakers.clear();
}
