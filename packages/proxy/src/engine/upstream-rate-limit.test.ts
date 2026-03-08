import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@villedemontreal/logger', () => ({
  createLogger: vi.fn(() => ({
    warning: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
  })),
}));

import { TokenBucket, getUpstreamBucket, RedisTokenBucket } from './upstream-rate-limit.js';

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

describe('RedisTokenBucket', () => {
  it('consumes token when Redis returns 1', async () => {
    const mockRedis = { eval: vi.fn().mockResolvedValue(1) };
    const bucket = new RedisTokenBucket(mockRedis as any, 'test-col', 10, 5, 'ogc:');
    expect(await bucket.tryConsume()).toBe(true);
    expect(mockRedis.eval).toHaveBeenCalledTimes(1);
  });

  it('rejects when Redis returns 0', async () => {
    const mockRedis = { eval: vi.fn().mockResolvedValue(0) };
    const bucket = new RedisTokenBucket(mockRedis as any, 'test-col', 10, 5, 'ogc:');
    expect(await bucket.tryConsume()).toBe(false);
  });

  it('falls back to in-memory on Redis error', async () => {
    const mockRedis = { eval: vi.fn().mockRejectedValue(new Error('Redis down')) };
    const bucket = new RedisTokenBucket(mockRedis as any, 'test-col', 10, 5, 'ogc:');
    expect(await bucket.tryConsume()).toBe(true); // fallback allows
  });
});

describe('getUpstreamBucket with Redis', () => {
  it('returns RedisTokenBucket when redis is provided', () => {
    const mockRedis = {} as any;
    const bucket = getUpstreamBucket('col', 10, 5, mockRedis, 'ogc:');
    expect(bucket).toBeInstanceOf(RedisTokenBucket);
  });

  it('returns TokenBucket when redis is null', () => {
    const bucket = getUpstreamBucket('col-mem', 10, 5, null);
    expect(bucket).toBeInstanceOf(TokenBucket);
  });
});
