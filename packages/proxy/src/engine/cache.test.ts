import { describe, it, expect, vi } from 'vitest';
import { CacheService } from './cache.js';

vi.mock('../logger.js', () => ({
  logger: { adapter: () => ({ info: vi.fn(), warning: vi.fn() }) },
}));

describe('CacheService', () => {
  describe('with Redis', () => {
    it('returns cached value on hit', async () => {
      const mockRedis = {
        get: vi.fn().mockResolvedValue(JSON.stringify({ items: [{ id: 1 }], total: 5 })),
      };
      const cache = new CacheService(mockRedis as any, 'ogc:');
      const result = await cache.get('test-col', { offset: 0, limit: 10 });
      expect(result).toEqual({ items: [{ id: 1 }], total: 5 });
    });

    it('returns null on cache miss', async () => {
      const mockRedis = { get: vi.fn().mockResolvedValue(null) };
      const cache = new CacheService(mockRedis as any, 'ogc:');
      const result = await cache.get('test-col', { offset: 0, limit: 10 });
      expect(result).toBeNull();
    });

    it('stores value with TTL', async () => {
      const mockRedis = { setex: vi.fn().mockResolvedValue('OK') };
      const cache = new CacheService(mockRedis as any, 'ogc:');
      await cache.set('test-col', { offset: 0, limit: 10 }, { items: [{ id: 1 }] }, 300);
      expect(mockRedis.setex).toHaveBeenCalledWith(
        expect.stringContaining('ogc:cache:test-col:'),
        300,
        expect.any(String),
      );
    });

    it('generates consistent cache keys for same params', async () => {
      const mockRedis = { get: vi.fn().mockResolvedValue(null) };
      const cache = new CacheService(mockRedis as any, 'ogc:');
      await cache.get('col', { offset: 0, limit: 10 });
      await cache.get('col', { offset: 0, limit: 10 });
      expect(mockRedis.get.mock.calls[0][0]).toBe(mockRedis.get.mock.calls[1][0]);
    });

    it('generates different cache keys for different params', async () => {
      const mockRedis = { get: vi.fn().mockResolvedValue(null) };
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
      const mockRedis = { get: vi.fn().mockRejectedValue(new Error('Redis down')) };
      const cache = new CacheService(mockRedis as any, 'ogc:');
      const result = await cache.get('test-col', { offset: 0, limit: 10 });
      expect(result).toBeNull();
    });
  });

  describe('invalidateByPattern', () => {
    it('returns 0 when redis is null', async () => {
      const cache = new CacheService(null, 'test:');
      const count = await cache.invalidateByPattern('*');
      expect(count).toBe(0);
    });

    it('deletes keys matching pattern', async () => {
      const mockRedis = {
        scanStream: vi.fn().mockReturnValue({
          on: vi.fn(function (this: any, event: string, cb: any) {
            if (event === 'data') cb(['test:cache:bornes-a:k1', 'test:cache:bornes-b:k2']);
            if (event === 'end') cb();
            return this;
          }),
        }),
        del: vi.fn().mockResolvedValue(2),
      };
      const cache = new CacheService(mockRedis as any, 'test:');
      const count = await cache.invalidateByPattern('bornes-*');
      expect(mockRedis.scanStream).toHaveBeenCalledWith({ match: 'test:cache:bornes-*', count: 100 });
      expect(mockRedis.del).toHaveBeenCalledWith('test:cache:bornes-a:k1', 'test:cache:bornes-b:k2');
      expect(count).toBe(2);
    });

    it('returns 0 when no keys match pattern', async () => {
      const mockRedis = {
        scanStream: vi.fn().mockReturnValue({
          on: vi.fn(function (this: any, event: string, cb: any) {
            if (event === 'data') cb([]);
            if (event === 'end') cb();
            return this;
          }),
        }),
      };
      const cache = new CacheService(mockRedis as any, 'test:');
      const count = await cache.invalidateByPattern('nonexistent-*');
      expect(count).toBe(0);
    });
  });

  describe('without Redis', () => {
    it('get returns null', async () => {
      const cache = new CacheService(null, 'ogc:');
      expect(await cache.get('test-col', { offset: 0, limit: 10 })).toBeNull();
    });

    it('set is a no-op', async () => {
      const cache = new CacheService(null, 'ogc:');
      await cache.set('test-col', { offset: 0, limit: 10 }, { items: [] }, 300);
    });

    it('invalidate returns 0', async () => {
      const cache = new CacheService(null, 'ogc:');
      expect(await cache.invalidate('test-col')).toBe(0);
    });
  });
});
