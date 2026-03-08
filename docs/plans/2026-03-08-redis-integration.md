# Redis Integration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add Redis for distributed rate limiting (client + upstream) and upstream response caching with per-collection TTL, enabling horizontal scaling.

**Architecture:** Single shared ioredis client injected via `createApp()`. All components fall back to in-memory behavior when Redis is unavailable. Key prefixes separate concerns (`rl:client:`, `rl:upstream:`, `cache:`).

**Tech Stack:** ioredis, rate-limit-redis, vitest, Docker Compose (redis:7-alpine)

---

### Task 1: Add Redis dependencies

**Files:**
- Modify: `packages/proxy/package.json`

**Step 1: Install packages**

Run: `cd packages/proxy && npm install ioredis rate-limit-redis && npm install -D @types/ioredis`

**Step 2: Verify installation**

Run: `cd packages/proxy && node -e "require('ioredis'); require('rate-limit-redis'); console.log('ok')"`
Expected: `ok`

**Step 3: Commit**

```bash
git add packages/proxy/package.json package-lock.json
git commit -m "feat: add ioredis and rate-limit-redis dependencies"
```

---

### Task 2: Create Redis client module

**Files:**
- Create: `packages/proxy/src/redis.ts`
- Test: `packages/proxy/src/redis.test.ts`

**Step 1: Write the failing test**

```typescript
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
```

**Step 2: Run test to verify it fails**

Run: `cd packages/proxy && npx vitest run src/redis.test.ts`
Expected: FAIL — module not found

**Step 3: Write minimal implementation**

```typescript
// packages/proxy/src/redis.ts
import Redis from 'ioredis';
import { logger } from './logger.js';

export type RedisClient = Redis | null;

export function createRedisClient(): RedisClient {
  const url = process.env.REDIS_URL;
  if (!url) {
    return null;
  }

  const log = logger.app();
  const client = new Redis(url, {
    maxRetriesPerRequest: 3,
    retryStrategy(times) {
      const delay = Math.min(times * 200, 5000);
      log.info({ attempt: times, delayMs: delay }, 'Redis reconnecting');
      return delay;
    },
    lazyConnect: true,
  });

  client.on('error', (err) => {
    log.error({ err }, 'Redis connection error');
  });

  client.on('connect', () => {
    log.info('Redis connected');
  });

  return client;
}

export function getRedisStatus(client: RedisClient): string {
  if (!client) return 'disconnected';
  return client.status;
}

export function getKeyPrefix(): string {
  return process.env.REDIS_KEY_PREFIX || 'ogc:';
}
```

**Step 4: Run test to verify it passes**

Run: `cd packages/proxy && npx vitest run src/redis.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/proxy/src/redis.ts packages/proxy/src/redis.test.ts
git commit -m "feat: add Redis client module with graceful degradation"
```

---

### Task 3: Wire Redis into app startup and shutdown

**Files:**
- Modify: `packages/proxy/src/app.ts` (lines 1-65)
- Modify: `packages/proxy/src/index.ts` (lines 1-37)

**Step 1: Update `createApp` to accept and expose Redis client**

In `packages/proxy/src/app.ts`, add Redis client creation and pass it to the app:

```typescript
// Add import at top
import { createRedisClient, type RedisClient, getRedisStatus } from './redis.js';

// In createApp(), after loadRegistry():
const redis = createRedisClient();
if (redis) {
  try {
    await redis.connect();
  } catch (err) {
    log.warning({ err }, 'Redis connection failed, falling back to in-memory');
  }
}

// Expose redis on app for use by routers
app.set('redis', redis);

// Update /ready endpoint to check Redis:
app.get('/ready', (_req, res) => {
  try {
    const reg = getRegistry();
    const hasCollections = Object.keys(reg.collections).length > 0;
    const redisStatus = getRedisStatus(redis);
    if (hasCollections) {
      return res.json({
        status: 'ready',
        collections: Object.keys(reg.collections).length,
        redis: redisStatus,
      });
    }
    return res.status(503).json({ status: 'not ready', reason: 'no collections loaded' });
  } catch (err) {
    log.error({ err }, 'readiness check failed');
    return res.status(503).json({ status: 'not ready', reason: 'registry not loaded' });
  }
});
```

**Step 2: Update `index.ts` shutdown to close Redis**

In `packages/proxy/src/index.ts`, update the shutdown function:

```typescript
// After const app = await createApp():
import type { RedisClient } from './redis.js';
const redis = app.get('redis') as RedisClient;

// In shutdown(), before server.close:
function shutdown(signal: string) {
  log.info(`${signal} received, starting graceful shutdown`);

  server.close(async () => {
    if (redis) {
      await redis.quit();
      log.info('Redis connection closed');
    }
    log.info('All connections drained, exiting');
    process.exit(0);
  });

  setTimeout(() => {
    log.warning('Shutdown timeout reached, forcing exit');
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS).unref();
}
```

**Step 3: Run all tests to verify no regressions**

Run: `cd packages/proxy && npx vitest run`
Expected: All existing tests PASS

**Step 4: Commit**

```bash
git add packages/proxy/src/app.ts packages/proxy/src/index.ts
git commit -m "feat: wire Redis client into app startup and graceful shutdown"
```

---

### Task 4: Client rate limiting with Redis store

**Files:**
- Modify: `packages/proxy/src/app.ts`

**Step 1: Update rate limiter to use Redis store**

In `packages/proxy/src/app.ts`, conditionally use `rate-limit-redis`:

```typescript
// Add import
import { RedisStore } from 'rate-limit-redis';

// Replace the limiter creation (after redis is created):
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000'),
  max: parseInt(process.env.RATE_LIMIT_MAX || '100'),
  standardHeaders: true,
  legacyHeaders: false,
  message: { code: 'TooManyRequests', description: 'Rate limit exceeded' },
  ...(redis ? {
    store: new RedisStore({
      sendCommand: (...args: string[]) => redis.call(...args) as any,
      prefix: `${getKeyPrefix()}rl:client:`,
    }),
  } : {}),
});
```

**Step 2: Run all tests to verify no regressions**

Run: `cd packages/proxy && npx vitest run`
Expected: All tests PASS (Redis is null in tests, so in-memory store used)

**Step 3: Commit**

```bash
git add packages/proxy/src/app.ts
git commit -m "feat: use Redis store for client rate limiting when available"
```

---

### Task 5: Distributed upstream rate limiting with Redis

**Files:**
- Modify: `packages/proxy/src/engine/upstream-rate-limit.ts`
- Test: `packages/proxy/src/engine/upstream-rate-limit.test.ts`

**Step 1: Write failing tests for the Redis token bucket**

Add tests to `packages/proxy/src/engine/upstream-rate-limit.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TokenBucket, getUpstreamBucket, RedisTokenBucket } from './upstream-rate-limit.js';

// ... existing TokenBucket tests remain unchanged ...

describe('RedisTokenBucket', () => {
  it('consumes token when Redis returns 1', async () => {
    const mockRedis = {
      eval: vi.fn().mockResolvedValue(1),
    };
    const bucket = new RedisTokenBucket(mockRedis as any, 'test-collection', 10, 5, 'ogc:');
    const result = await bucket.tryConsume();
    expect(result).toBe(true);
    expect(mockRedis.eval).toHaveBeenCalledTimes(1);
  });

  it('rejects when Redis returns 0', async () => {
    const mockRedis = {
      eval: vi.fn().mockResolvedValue(0),
    };
    const bucket = new RedisTokenBucket(mockRedis as any, 'test-collection', 10, 5, 'ogc:');
    const result = await bucket.tryConsume();
    expect(result).toBe(false);
  });

  it('falls back to in-memory bucket on Redis error', async () => {
    const mockRedis = {
      eval: vi.fn().mockRejectedValue(new Error('Redis down')),
    };
    const bucket = new RedisTokenBucket(mockRedis as any, 'test-collection', 10, 5, 'ogc:');
    // Should not throw, falls back to local bucket
    const result = await bucket.tryConsume();
    expect(result).toBe(true);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd packages/proxy && npx vitest run src/engine/upstream-rate-limit.test.ts`
Expected: FAIL — `RedisTokenBucket` not exported

**Step 3: Implement RedisTokenBucket**

Rewrite `packages/proxy/src/engine/upstream-rate-limit.ts`:

```typescript
import type Redis from 'ioredis';
import { logger } from '../logger.js';

/**
 * In-memory token bucket rate limiter (fallback when Redis is unavailable).
 */
export class TokenBucket {
  private tokens: number;
  private lastRefill: number;

  constructor(
    private readonly capacity: number,
    private readonly refillRate: number,
  ) {
    this.tokens = capacity;
    this.lastRefill = Date.now();
  }

  tryConsume(): boolean {
    this.refill();
    if (this.tokens < 1) return false;
    this.tokens -= 1;
    return true;
  }

  private refill(): void {
    const now = Date.now();
    const elapsed = (now - this.lastRefill) / 1000;
    this.tokens = Math.min(this.capacity, this.tokens + elapsed * this.refillRate);
    this.lastRefill = now;
  }
}

/**
 * Lua script for atomic token bucket on Redis.
 *
 * Why Lua: without atomicity, concurrent instances can read the same token
 * count and both grant a token when only one remains. Redis executes Lua
 * scripts without interruption, eliminating race conditions. The script
 * performs the same refill + consume calculation as the in-memory TokenBucket.
 *
 * KEYS[1] = bucket key (e.g. "ogc:rl:upstream:bornes-fontaines")
 * ARGV[1] = capacity
 * ARGV[2] = refillRate (tokens per second)
 * ARGV[3] = now (milliseconds)
 *
 * Returns 1 if token consumed, 0 if rate limited.
 */
const TOKEN_BUCKET_LUA = `
local key = KEYS[1]
local capacity = tonumber(ARGV[1])
local refillRate = tonumber(ARGV[2])
local now = tonumber(ARGV[3])

local data = redis.call('HMGET', key, 'tokens', 'lastRefill')
local tokens = tonumber(data[1]) or capacity
local lastRefill = tonumber(data[2]) or now

local elapsed = (now - lastRefill) / 1000
tokens = math.min(capacity, tokens + elapsed * refillRate)

if tokens < 1 then
  redis.call('HMSET', key, 'tokens', tokens, 'lastRefill', now)
  return 0
end

tokens = tokens - 1
redis.call('HMSET', key, 'tokens', tokens, 'lastRefill', now)
return 1
`;

/**
 * Redis-backed token bucket with in-memory fallback.
 */
export class RedisTokenBucket {
  private readonly fallback: TokenBucket;
  private readonly key: string;

  constructor(
    private readonly redis: Redis,
    collectionId: string,
    private readonly capacity: number,
    private readonly refillRate: number,
    keyPrefix: string,
  ) {
    this.key = `${keyPrefix}rl:upstream:${collectionId}`;
    this.fallback = new TokenBucket(capacity, refillRate);
  }

  async tryConsume(): Promise<boolean> {
    try {
      const result = await this.redis.eval(
        TOKEN_BUCKET_LUA,
        1,
        this.key,
        this.capacity,
        this.refillRate,
        Date.now(),
      );
      return result === 1;
    } catch {
      const log = logger.adapter();
      log.warning({ key: this.key }, 'Redis token bucket failed, using in-memory fallback');
      return this.fallback.tryConsume();
    }
  }
}

const memoryBuckets = new Map<string, TokenBucket>();

/**
 * Get or create a token bucket for a given collection.
 * Uses Redis when available, otherwise in-memory.
 */
export function getUpstreamBucket(
  collectionId: string,
  capacity = 50,
  refillRate = 50,
  redis?: Redis | null,
  keyPrefix = 'ogc:',
): TokenBucket | RedisTokenBucket {
  if (redis) {
    return new RedisTokenBucket(redis, collectionId, capacity, refillRate, keyPrefix);
  }
  let bucket = memoryBuckets.get(collectionId);
  if (!bucket) {
    bucket = new TokenBucket(capacity, refillRate);
    memoryBuckets.set(collectionId, bucket);
  }
  return bucket;
}
```

**Step 4: Run test to verify it passes**

Run: `cd packages/proxy && npx vitest run src/engine/upstream-rate-limit.test.ts`
Expected: PASS

**Step 5: Update adapter to pass Redis client**

In `packages/proxy/src/engine/adapter.ts`, update `fetchUpstreamItems` and `fetchUpstreamItem` to accept an optional Redis parameter and pass it to `getUpstreamBucket`:

```typescript
// Add import
import type Redis from 'ioredis';

// Update fetchUpstreamItems signature:
export async function fetchUpstreamItems(
  collectionId: string,
  config: CollectionConfig,
  params: FetchParams,
  redis?: Redis | null,
  keyPrefix?: string,
): Promise<UpstreamPage> {
  const bucket = getUpstreamBucket(collectionId, config.rateLimit?.capacity, config.rateLimit?.refillRate, redis, keyPrefix);
  const allowed = bucket instanceof TokenBucket ? bucket.tryConsume() : await bucket.tryConsume();
  if (!allowed) {
    const log = logger.adapter();
    log.warning({ collectionId }, 'upstream rate limit exceeded');
    throw new UpstreamError(429);
  }
  // ... rest unchanged
}

// Same for fetchUpstreamItem:
export async function fetchUpstreamItem(
  collectionId: string,
  config: CollectionConfig,
  itemId: string,
  redis?: Redis | null,
  keyPrefix?: string,
): Promise<Record<string, unknown>> {
  const bucket = getUpstreamBucket(collectionId, config.rateLimit?.capacity, config.rateLimit?.refillRate, redis, keyPrefix);
  const allowed = bucket instanceof TokenBucket ? bucket.tryConsume() : await bucket.tryConsume();
  if (!allowed) {
    const log = logger.adapter();
    log.warning({ collectionId }, 'upstream rate limit exceeded');
    throw new UpstreamError(429);
  }
  // ... rest unchanged
}
```

**Step 6: Update callers in items.ts to pass Redis from app**

In `packages/proxy/src/ogc/items.ts`:

```typescript
// Add import
import type Redis from 'ioredis';

// In getItems(), before fetchUpstreamItems call:
const redis = req.app.get('redis') as Redis | null;
const keyPrefix = req.app.get('redisKeyPrefix') as string | undefined;

// Update fetchUpstreamItems call:
const upstream = await fetchUpstreamItems(collectionId, config, {
  offset: ogcReq.offset,
  limit: fetchLimit,
  bbox: ogcReq.bbox,
  upstreamParams,
}, redis, keyPrefix);

// In getItem(), same pattern:
const redis = req.app.get('redis') as Redis | null;
const keyPrefix = req.app.get('redisKeyPrefix') as string | undefined;
const raw = await fetchUpstreamItem(collectionId, config, featureId, redis, keyPrefix);
```

Apply same changes in `packages/proxy/src/wfs/get-feature.ts`.

**Step 7: Run all tests**

Run: `cd packages/proxy && npx vitest run`
Expected: All PASS (Redis is null in tests, in-memory path used)

**Step 8: Commit**

```bash
git add packages/proxy/src/engine/upstream-rate-limit.ts packages/proxy/src/engine/upstream-rate-limit.test.ts packages/proxy/src/engine/adapter.ts packages/proxy/src/ogc/items.ts packages/proxy/src/wfs/get-feature.ts
git commit -m "feat: distributed upstream rate limiting with Redis token bucket"
```

---

### Task 6: Upstream response cache

**Files:**
- Create: `packages/proxy/src/engine/cache.ts`
- Test: `packages/proxy/src/engine/cache.test.ts`
- Modify: `packages/proxy/src/engine/types.ts`

**Step 1: Add cache schema to types**

In `packages/proxy/src/engine/types.ts`, add after `rateLimitConfigSchema`:

```typescript
export const cacheConfigSchema = z.object({
  ttlSeconds: z.number().positive(),
});
```

In `collectionConfigSchema`, add field:

```typescript
cache: cacheConfigSchema.optional(),
```

And add at bottom:

```typescript
export type CacheConfig = z.infer<typeof cacheConfigSchema>;
```

**Step 2: Write failing tests for cache**

```typescript
// packages/proxy/src/engine/cache.test.ts
import { describe, it, expect, vi } from 'vitest';
import { CacheService } from './cache.js';

describe('CacheService', () => {
  describe('with Redis', () => {
    it('returns cached value on hit', async () => {
      const mockRedis = {
        get: vi.fn().mockResolvedValue(JSON.stringify({ items: [{ id: 1 }], total: 5 })),
        setex: vi.fn(),
      };
      const cache = new CacheService(mockRedis as any, 'ogc:');
      const result = await cache.get('test-col', { offset: 0, limit: 10 });
      expect(result).toEqual({ items: [{ id: 1 }], total: 5 });
    });

    it('returns null on cache miss', async () => {
      const mockRedis = {
        get: vi.fn().mockResolvedValue(null),
      };
      const cache = new CacheService(mockRedis as any, 'ogc:');
      const result = await cache.get('test-col', { offset: 0, limit: 10 });
      expect(result).toBeNull();
    });

    it('stores value with TTL', async () => {
      const mockRedis = {
        setex: vi.fn().mockResolvedValue('OK'),
      };
      const cache = new CacheService(mockRedis as any, 'ogc:');
      await cache.set('test-col', { offset: 0, limit: 10 }, { items: [{ id: 1 }] }, 300);
      expect(mockRedis.setex).toHaveBeenCalledWith(
        expect.stringContaining('ogc:cache:test-col:'),
        300,
        expect.any(String),
      );
    });

    it('generates consistent cache keys for same params', async () => {
      const mockRedis = {
        get: vi.fn().mockResolvedValue(null),
      };
      const cache = new CacheService(mockRedis as any, 'ogc:');
      await cache.get('col', { offset: 0, limit: 10 });
      await cache.get('col', { offset: 0, limit: 10 });
      expect(mockRedis.get).toHaveBeenCalledTimes(2);
      expect(mockRedis.get.mock.calls[0][0]).toBe(mockRedis.get.mock.calls[1][0]);
    });

    it('generates different cache keys for different params', async () => {
      const mockRedis = {
        get: vi.fn().mockResolvedValue(null),
      };
      const cache = new CacheService(mockRedis as any, 'ogc:');
      await cache.get('col', { offset: 0, limit: 10 });
      await cache.get('col', { offset: 10, limit: 10 });
      expect(mockRedis.get.mock.calls[0][0]).not.toBe(mockRedis.get.mock.calls[1][0]);
    });

    it('invalidates all keys for a collection', async () => {
      const mockRedis = {
        scanStream: vi.fn().mockReturnValue({
          on: vi.fn(function (this: any, event: string, cb: any) {
            if (event === 'data') cb(['ogc:cache:col:k1', 'ogc:cache:col:k2']);
            if (event === 'end') cb();
            return this;
          }),
        }),
        del: vi.fn().mockResolvedValue(2),
      };
      const cache = new CacheService(mockRedis as any, 'ogc:');
      const count = await cache.invalidate('col');
      expect(mockRedis.del).toHaveBeenCalledWith('ogc:cache:col:k1', 'ogc:cache:col:k2');
      expect(count).toBe(2);
    });

    it('returns 0 when invalidating collection with no cached keys', async () => {
      const mockRedis = {
        scanStream: vi.fn().mockReturnValue({
          on: vi.fn(function (this: any, event: string, cb: any) {
            if (event === 'data') cb([]);
            if (event === 'end') cb();
            return this;
          }),
        }),
      };
      const cache = new CacheService(mockRedis as any, 'ogc:');
      const count = await cache.invalidate('col');
      expect(count).toBe(0);
    });

    it('returns null on Redis error (graceful degradation)', async () => {
      const mockRedis = {
        get: vi.fn().mockRejectedValue(new Error('Redis down')),
      };
      const cache = new CacheService(mockRedis as any, 'ogc:');
      const result = await cache.get('test-col', { offset: 0, limit: 10 });
      expect(result).toBeNull();
    });
  });

  describe('without Redis', () => {
    it('get returns null', async () => {
      const cache = new CacheService(null, 'ogc:');
      const result = await cache.get('test-col', { offset: 0, limit: 10 });
      expect(result).toBeNull();
    });

    it('set is a no-op', async () => {
      const cache = new CacheService(null, 'ogc:');
      await cache.set('test-col', { offset: 0, limit: 10 }, { items: [] }, 300);
      // No error thrown
    });

    it('invalidate returns 0', async () => {
      const cache = new CacheService(null, 'ogc:');
      const count = await cache.invalidate('test-col');
      expect(count).toBe(0);
    });
  });
});
```

**Step 3: Run test to verify it fails**

Run: `cd packages/proxy && npx vitest run src/engine/cache.test.ts`
Expected: FAIL — module not found

**Step 4: Implement CacheService**

```typescript
// packages/proxy/src/engine/cache.ts
import { createHash } from 'crypto';
import type Redis from 'ioredis';
import { logger } from '../logger.js';

export interface CacheParams {
  offset?: number;
  limit?: number;
  bbox?: [number, number, number, number];
  upstreamParams?: Record<string, string>;
  itemId?: string;
}

export class CacheService {
  constructor(
    private readonly redis: Redis | null,
    private readonly keyPrefix: string,
  ) {}

  private buildKey(collectionId: string, params: CacheParams): string {
    const hash = createHash('md5').update(JSON.stringify(params)).digest('hex');
    return `${this.keyPrefix}cache:${collectionId}:${hash}`;
  }

  async get(collectionId: string, params: CacheParams): Promise<unknown | null> {
    if (!this.redis) return null;
    try {
      const key = this.buildKey(collectionId, params);
      const cached = await this.redis.get(key);
      if (cached) {
        const log = logger.adapter();
        log.info({ collectionId, key }, 'cache hit');
        return JSON.parse(cached);
      }
      return null;
    } catch {
      const log = logger.adapter();
      log.warning({ collectionId }, 'cache get failed, skipping cache');
      return null;
    }
  }

  async set(collectionId: string, params: CacheParams, data: unknown, ttlSeconds: number): Promise<void> {
    if (!this.redis) return;
    try {
      const key = this.buildKey(collectionId, params);
      await this.redis.setex(key, ttlSeconds, JSON.stringify(data));
    } catch {
      const log = logger.adapter();
      log.warning({ collectionId }, 'cache set failed');
    }
  }

  async invalidate(collectionId: string): Promise<number> {
    if (!this.redis) return 0;
    const pattern = `${this.keyPrefix}cache:${collectionId}:*`;
    const keys: string[] = [];

    return new Promise((resolve, reject) => {
      const stream = this.redis!.scanStream({ match: pattern, count: 100 });
      stream.on('data', (batch: string[]) => {
        keys.push(...batch);
      });
      stream.on('end', async () => {
        if (keys.length === 0) {
          resolve(0);
          return;
        }
        try {
          const count = await this.redis!.del(...keys);
          const log = logger.adapter();
          log.info({ collectionId, keysDeleted: count }, 'cache invalidated');
          resolve(count);
        } catch (err) {
          reject(err);
        }
      });
      stream.on('error', reject);
    });
  }
}
```

**Step 5: Run test to verify it passes**

Run: `cd packages/proxy && npx vitest run src/engine/cache.test.ts`
Expected: PASS

**Step 6: Commit**

```bash
git add packages/proxy/src/engine/types.ts packages/proxy/src/engine/cache.ts packages/proxy/src/engine/cache.test.ts
git commit -m "feat: add CacheService with per-collection TTL and invalidation"
```

---

### Task 7: Integrate cache into adapter

**Files:**
- Modify: `packages/proxy/src/engine/adapter.ts`
- Modify: `packages/proxy/src/app.ts`
- Modify: `packages/proxy/src/ogc/items.ts`
- Modify: `packages/proxy/src/wfs/get-feature.ts`

**Step 1: Update adapter to accept CacheService**

In `packages/proxy/src/engine/adapter.ts`, update both fetch functions:

```typescript
import type { CacheService } from './cache.js';

// Update fetchUpstreamItems signature to add cache:
export async function fetchUpstreamItems(
  collectionId: string,
  config: CollectionConfig,
  params: FetchParams,
  redis?: Redis | null,
  keyPrefix?: string,
  cache?: CacheService | null,
): Promise<UpstreamPage> {
  // Check cache first
  if (cache && config.cache?.ttlSeconds) {
    const cacheParams = { offset: params.offset, limit: params.limit, bbox: params.bbox, upstreamParams: params.upstreamParams };
    const cached = await cache.get(collectionId, cacheParams);
    if (cached) return cached as UpstreamPage;
  }

  // ... existing rate limit check + fetch logic ...
  // (keep all existing code for bucket check and pagination fetch)

  // After getting result, store in cache
  // Add before the return statement in each pagination function call:
  const result = /* existing fetch result */;

  if (cache && config.cache?.ttlSeconds) {
    const cacheParams = { offset: params.offset, limit: params.limit, bbox: params.bbox, upstreamParams: params.upstreamParams };
    await cache.set(collectionId, cacheParams, result, config.cache.ttlSeconds);
  }

  return result;
}

// Update fetchUpstreamItem similarly:
export async function fetchUpstreamItem(
  collectionId: string,
  config: CollectionConfig,
  itemId: string,
  redis?: Redis | null,
  keyPrefix?: string,
  cache?: CacheService | null,
): Promise<Record<string, unknown>> {
  // Check cache first
  if (cache && config.cache?.ttlSeconds) {
    const cached = await cache.get(collectionId, { itemId });
    if (cached) return cached as Record<string, unknown>;
  }

  // ... existing rate limit + fetch logic ...

  const result = /* existing fetch result */;

  if (cache && config.cache?.ttlSeconds) {
    await cache.set(collectionId, { itemId }, result, config.cache.ttlSeconds);
  }

  return result;
}
```

**Step 2: Wire CacheService into app.ts**

In `packages/proxy/src/app.ts`, after Redis setup:

```typescript
import { CacheService } from './engine/cache.js';
import { getKeyPrefix } from './redis.js';

// In createApp(), after redis connection:
const cache = new CacheService(redis, getKeyPrefix());
app.set('cache', cache);
app.set('redisKeyPrefix', getKeyPrefix());
```

**Step 3: Update items.ts to pass cache**

In `packages/proxy/src/ogc/items.ts`:

```typescript
import type { CacheService } from '../engine/cache.js';

// In getItems():
const cache = req.app.get('cache') as CacheService | null;
// Pass to fetchUpstreamItems as last arg

// In getItem():
const cache = req.app.get('cache') as CacheService | null;
// Pass to fetchUpstreamItem as last arg
```

Apply same changes in `packages/proxy/src/wfs/get-feature.ts`.

**Step 4: Run all tests**

Run: `cd packages/proxy && npx vitest run`
Expected: All PASS

**Step 5: Commit**

```bash
git add packages/proxy/src/engine/adapter.ts packages/proxy/src/app.ts packages/proxy/src/ogc/items.ts packages/proxy/src/wfs/get-feature.ts
git commit -m "feat: integrate response cache into upstream fetch pipeline"
```

---

### Task 8: Admin cache invalidation endpoint

**Files:**
- Create: `packages/proxy/src/admin/router.ts`
- Test: `packages/proxy/src/admin/router.test.ts`
- Modify: `packages/proxy/src/app.ts`
- Modify: `packages/proxy/package.json` (devDeps: supertest)

**Step 1: Install supertest**

Run: `cd packages/proxy && npm install -D supertest @types/supertest`

**Step 2: Write failing test**

```typescript
// packages/proxy/src/admin/router.test.ts
import { describe, it, expect, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createAdminRouter } from './router.js';
import type { CacheService } from '../engine/cache.js';

describe('Admin Router', () => {
  it('DELETE /cache/:collectionId invalidates cache', async () => {
    const mockCache = { invalidate: vi.fn().mockResolvedValue(5) } as unknown as CacheService;
    const noopAuth: express.RequestHandler = (_req, _res, next) => next();

    const app = express();
    app.use('/admin', createAdminRouter(noopAuth, mockCache));

    const res = await request(app).delete('/admin/cache/bornes-fontaines');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ collection: 'bornes-fontaines', keysDeleted: 5 });
    expect(mockCache.invalidate).toHaveBeenCalledWith('bornes-fontaines');
  });

  it('returns 200 with 0 keys when collection has no cache', async () => {
    const mockCache = { invalidate: vi.fn().mockResolvedValue(0) } as unknown as CacheService;
    const noopAuth: express.RequestHandler = (_req, _res, next) => next();

    const app = express();
    app.use('/admin', createAdminRouter(noopAuth, mockCache));

    const res = await request(app).delete('/admin/cache/unknown');
    expect(res.status).toBe(200);
    expect(res.body.keysDeleted).toBe(0);
  });

  it('returns 500 on cache error', async () => {
    const mockCache = { invalidate: vi.fn().mockRejectedValue(new Error('fail')) } as unknown as CacheService;
    const noopAuth: express.RequestHandler = (_req, _res, next) => next();

    const app = express();
    app.use('/admin', createAdminRouter(noopAuth, mockCache));

    const res = await request(app).delete('/admin/cache/col');
    expect(res.status).toBe(500);
  });
});
```

**Step 3: Run test to verify it fails**

Run: `cd packages/proxy && npx vitest run src/admin/router.test.ts`
Expected: FAIL — module not found

**Step 4: Implement admin router**

```typescript
// packages/proxy/src/admin/router.ts
import { Router, type RequestHandler } from 'express';
import type { CacheService } from '../engine/cache.js';

export function createAdminRouter(jwtMiddleware: RequestHandler, cache: CacheService): Router {
  const router = Router();

  router.delete('/cache/:collectionId', jwtMiddleware, async (req, res) => {
    const { collectionId } = req.params;
    try {
      const keysDeleted = await cache.invalidate(collectionId);
      res.json({ collection: collectionId, keysDeleted });
    } catch {
      res.status(500).json({ code: 'CacheError', description: 'Failed to invalidate cache' });
    }
  });

  return router;
}
```

**Step 5: Run test to verify it passes**

Run: `cd packages/proxy && npx vitest run src/admin/router.test.ts`
Expected: PASS

**Step 6: Mount admin router in app.ts**

In `packages/proxy/src/app.ts`:

```typescript
import { createAdminRouter } from './admin/router.js';

// In createApp(), after cache creation, before return:
app.use('/admin', createAdminRouter(jwtMiddleware, cache));
```

**Step 7: Run all tests**

Run: `cd packages/proxy && npx vitest run`
Expected: All PASS

**Step 8: Commit**

```bash
git add packages/proxy/src/admin/router.ts packages/proxy/src/admin/router.test.ts packages/proxy/src/app.ts packages/proxy/package.json package-lock.json
git commit -m "feat: add admin endpoint for cache invalidation"
```

---

### Task 9: Docker Compose and collections.yaml updates

**Files:**
- Modify: `docker-compose.yml`
- Modify: `packages/proxy/src/config/collections.yaml`

**Step 1: Add Redis service to docker-compose.yml**

Update `docker-compose.yml` to:

```yaml
services:
  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"

  mock-api:
    build:
      context: ./packages/mock-api
    ports:
      - "3001:3001"
    environment:
      PORT: "3001"

  proxy:
    build:
      context: ./packages/proxy
    ports:
      - "3000:3000"
    depends_on:
      - mock-api
      - redis
    environment:
      PORT: "3000"
      UPSTREAM_HOST: "http://mock-api:3001"
      REDIS_URL: "redis://redis:6379"

  mapstore:
    image: geosolutionsit/mapstore2
    ports:
      - "8080:8080"
    depends_on:
      - proxy
```

**Step 2: Add cache config to bornes-fontaines in collections.yaml**

Add `cache` block after `rateLimit` (or after `description`) in `bornes-fontaines`:

```yaml
  bornes-fontaines:
    title: "Bornes-fontaines"
    # ... existing fields ...
    cache:
      ttlSeconds: 300
```

**Step 3: Run all tests**

Run: `cd packages/proxy && npx vitest run`
Expected: All PASS

**Step 4: Commit**

```bash
git add docker-compose.yml packages/proxy/src/config/collections.yaml
git commit -m "feat: add Redis to Docker Compose and enable caching on bornes-fontaines"
```

---

### Task 10: Update README with Redis documentation

**Files:**
- Modify: `README.md`

**Step 1: Add Redis section**

Add a section documenting:
- **Environment variables**: `REDIS_URL`, `REDIS_KEY_PREFIX`
- **Graceful degradation**: everything works without Redis (in-memory fallback)
- **Client rate limiting**: shared counters via `rate-limit-redis`
- **Upstream rate limiting**: distributed token bucket via atomic Lua script on Redis. Explain why Lua is needed (concurrent instances reading same token count = race condition; Redis executes Lua atomically).
- **Response caching**: per-collection TTL in `collections.yaml` (`cache.ttlSeconds`)
- **Cache invalidation**: `DELETE /admin/cache/:collectionId` (JWT-protected)
- **Docker Compose**: `redis:7-alpine` service added

**Step 2: Commit**

```bash
git add README.md
git commit -m "docs: add Redis integration documentation"
```

---

### Task 11: Manual integration test

**Step 1: Start services**

Run: `docker compose up --build`

**Step 2: Verify Redis is connected**

Run: `curl http://localhost:3000/ready`
Expected: `{"status":"ready","collections":4,"redis":"ready"}`

**Step 3: Verify caching**

```bash
# Cache miss (slower)
time curl http://localhost:3000/ogc/collections/bornes-fontaines/items?limit=5

# Cache hit (faster)
time curl http://localhost:3000/ogc/collections/bornes-fontaines/items?limit=5

# Invalidate
curl -X DELETE http://localhost:3000/admin/cache/bornes-fontaines

# Cache miss again
time curl http://localhost:3000/ogc/collections/bornes-fontaines/items?limit=5
```

**Step 4: Verify rate limiting is shared**

Start two proxy instances pointing to same Redis, verify shared counters.
