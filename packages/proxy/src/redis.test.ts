// packages/proxy/src/redis.test.ts
import { describe, it, expect, vi, afterEach } from 'vitest';
import { createRedisClient, getRedisStatus } from './redis.js';

describe('createRedisClient', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns null when REDIS_URL is not set', () => {
    vi.stubEnv('REDIS_URL', '');
    const client = createRedisClient();
    expect(client).toBeNull();
  });

  it('returns null when REDIS_URL is undefined', () => {
    delete process.env.REDIS_URL;
    const client = createRedisClient();
    expect(client).toBeNull();
  });
});

describe('getRedisStatus', () => {
  it('returns disconnected when client is null', () => {
    expect(getRedisStatus(null)).toBe('disconnected');
  });
});
