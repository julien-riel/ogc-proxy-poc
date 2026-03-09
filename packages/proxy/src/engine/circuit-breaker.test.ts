import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../logger.js', () => ({
  logger: { adapter: () => ({ info: vi.fn(), warning: vi.fn() }) },
}));

import { CircuitBreaker, CircuitState } from './circuit-breaker.js';

describe('CircuitBreaker', () => {
  let cb: CircuitBreaker;

  beforeEach(() => {
    cb = new CircuitBreaker({ failureThreshold: 3, resetTimeoutMs: 1000, halfOpenRequests: 1 });
  });

  it('starts in closed state', () => {
    expect(cb.state).toBe(CircuitState.Closed);
  });

  it('stays closed under threshold', () => {
    cb.recordFailure();
    cb.recordFailure();
    expect(cb.state).toBe(CircuitState.Closed);
    expect(cb.canExecute()).toBe(true);
  });

  it('opens after reaching failure threshold', () => {
    for (let i = 0; i < 3; i++) cb.recordFailure();
    expect(cb.state).toBe(CircuitState.Open);
    expect(cb.canExecute()).toBe(false);
  });

  it('resets failure count on success', () => {
    cb.recordFailure();
    cb.recordFailure();
    cb.recordSuccess();
    expect(cb.state).toBe(CircuitState.Closed);
    cb.recordFailure();
    expect(cb.state).toBe(CircuitState.Closed);
  });

  it('transitions to half-open after reset timeout', () => {
    vi.useFakeTimers();
    for (let i = 0; i < 3; i++) cb.recordFailure();
    expect(cb.canExecute()).toBe(false);
    vi.advanceTimersByTime(1001);
    expect(cb.canExecute()).toBe(true);
    expect(cb.state).toBe(CircuitState.HalfOpen);
    vi.useRealTimers();
  });

  it('closes on success in half-open', () => {
    vi.useFakeTimers();
    for (let i = 0; i < 3; i++) cb.recordFailure();
    vi.advanceTimersByTime(1001);
    cb.canExecute(); // triggers half-open
    cb.recordSuccess();
    expect(cb.state).toBe(CircuitState.Closed);
    vi.useRealTimers();
  });

  it('re-opens on failure in half-open', () => {
    vi.useFakeTimers();
    for (let i = 0; i < 3; i++) cb.recordFailure();
    vi.advanceTimersByTime(1001);
    cb.canExecute(); // triggers half-open
    cb.recordFailure();
    expect(cb.state).toBe(CircuitState.Open);
    vi.useRealTimers();
  });

  it('limits concurrent requests in half-open', () => {
    vi.useFakeTimers();
    for (let i = 0; i < 3; i++) cb.recordFailure();
    vi.advanceTimersByTime(1001);
    expect(cb.canExecute()).toBe(true); // first half-open request
    expect(cb.canExecute()).toBe(false); // beyond halfOpenRequests limit
    vi.useRealTimers();
  });
});
