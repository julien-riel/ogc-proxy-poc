import type { Redis } from 'ioredis';
import { logger } from '../logger.js';

/**
 * Simple token bucket rate limiter for upstream requests.
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
 * Why Lua: without atomicity, concurrent instances can read the same token
 * count and both grant a token when only one remains. Redis executes Lua
 * scripts without interruption, eliminating race conditions.
 *
 * KEYS[1] = bucket key
 * ARGV[1] = capacity, ARGV[2] = refillRate, ARGV[3] = now (ms)
 * Returns 1 if consumed, 0 if rate limited.
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
  redis.call('EXPIRE', key, math.ceil(capacity / refillRate) * 2 + 60)
  return 0
end

tokens = tokens - 1
redis.call('HMSET', key, 'tokens', tokens, 'lastRefill', now)
redis.call('EXPIRE', key, math.ceil(capacity / refillRate) * 2 + 60)
return 1
`;

/**
 * Redis-backed token bucket for distributed upstream rate limiting.
 * Falls back to in-memory TokenBucket when Redis is unavailable.
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

  /**
   * Try to consume a token from the Redis-backed bucket.
   * Uses redis.eval() to run the Lua script atomically on the Redis server
   * (this is ioredis's method for server-side Lua execution, not JS eval).
   */
  async tryConsume(): Promise<boolean> {
    try {
      const result = await this.redis.eval(
        TOKEN_BUCKET_LUA,
        1,
        this.key,
        String(this.capacity),
        String(this.refillRate),
        String(Date.now()),
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
const redisBuckets = new Map<string, RedisTokenBucket>();

/**
 * Get or create a token bucket for a given collection.
 * Instances are cached so that the in-memory fallback inside
 * RedisTokenBucket survives across requests during Redis outages.
 */
export function getUpstreamBucket(
  collectionId: string,
  capacity = 50,
  refillRate = 50,
  redis?: Redis | null,
  keyPrefix = 'ogc:',
): TokenBucket | RedisTokenBucket {
  if (redis) {
    let bucket = redisBuckets.get(collectionId);
    if (!bucket) {
      bucket = new RedisTokenBucket(redis, collectionId, capacity, refillRate, keyPrefix);
      redisBuckets.set(collectionId, bucket);
    }
    return bucket;
  }
  let bucket = memoryBuckets.get(collectionId);
  if (!bucket) {
    bucket = new TokenBucket(capacity, refillRate);
    memoryBuckets.set(collectionId, bucket);
  }
  return bucket;
}
