import { createHash } from 'crypto';
import type { Redis } from 'ioredis';
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
