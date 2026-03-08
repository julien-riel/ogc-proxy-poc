// packages/proxy/src/redis.test.ts
import { describe, it, expect, vi, afterEach } from 'vitest';
import { createRedisClient, getRedisStatus, getKeyPrefix } from './redis.js';

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

describe('getKeyPrefix', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns ogc: by default', () => {
    delete process.env.REDIS_KEY_PREFIX;
    expect(getKeyPrefix()).toBe('ogc:');
  });

  it('returns custom prefix from env', () => {
    vi.stubEnv('REDIS_KEY_PREFIX', 'myapp:');
    expect(getKeyPrefix()).toBe('myapp:');
  });
});
