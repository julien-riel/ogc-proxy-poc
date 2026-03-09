// packages/proxy/src/redis.test.ts
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';

const mockOn = vi.fn();
const mockRedisInstance = { on: mockOn, status: 'ready' };

vi.mock('ioredis', () => {
  const RedisMock = vi.fn(function () {
    return mockRedisInstance;
  });
  return { Redis: RedisMock };
});

vi.mock('./logger.js', () => ({
  logger: {
    app: () => ({ info: vi.fn(), error: vi.fn(), warning: vi.fn() }),
  },
}));

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

describe('createRedisClient with REDIS_URL', () => {
  beforeEach(() => {
    mockOn.mockClear();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('creates Redis client when REDIS_URL is set', () => {
    vi.stubEnv('REDIS_URL', 'redis://localhost:6379');
    const client = createRedisClient();
    expect(client).not.toBeNull();
  });

  it('registers error and connect event handlers', () => {
    vi.stubEnv('REDIS_URL', 'redis://localhost:6379');
    createRedisClient();
    expect(mockOn).toHaveBeenCalledWith('error', expect.any(Function));
    expect(mockOn).toHaveBeenCalledWith('connect', expect.any(Function));
  });
});

describe('getRedisStatus', () => {
  it('returns disconnected when client is null', () => {
    expect(getRedisStatus(null)).toBe('disconnected');
  });
});

describe('getRedisStatus with connected client', () => {
  it('returns client status string', () => {
    const status = getRedisStatus({ status: 'ready' } as any);
    expect(status).toBe('ready');
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
