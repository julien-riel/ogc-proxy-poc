import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TokenBucket, getUpstreamBucket } from './upstream-rate-limit.js';

describe('TokenBucket', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('allows requests within rate', () => {
    const bucket = new TokenBucket(10, 10);
    expect(bucket.tryConsume()).toBe(true);
  });

  it('rejects requests when empty', () => {
    const bucket = new TokenBucket(2, 1);
    expect(bucket.tryConsume()).toBe(true);
    expect(bucket.tryConsume()).toBe(true);
    expect(bucket.tryConsume()).toBe(false);
  });

  it('refills tokens over time', () => {
    const bucket = new TokenBucket(2, 2);
    bucket.tryConsume();
    bucket.tryConsume();
    expect(bucket.tryConsume()).toBe(false);
    vi.advanceTimersByTime(1000);
    expect(bucket.tryConsume()).toBe(true);
  });

  it('uses custom capacity when provided', () => {
    const bucket = getUpstreamBucket('custom-test', 2, 0);
    expect(bucket.tryConsume()).toBe(true);
    expect(bucket.tryConsume()).toBe(true);
    expect(bucket.tryConsume()).toBe(false);
  });
});
