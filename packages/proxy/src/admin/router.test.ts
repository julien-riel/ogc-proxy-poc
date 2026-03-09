import { describe, it, expect, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createAdminRouter } from './router.js';
import type { CacheService } from '../engine/cache.js';

vi.mock('../engine/registry.js', () => ({
  getRegistry: () => ({
    collections: {
      'test-collection': {
        title: 'Test Collection',
        circuitBreaker: { failureThreshold: 5, resetTimeoutMs: 30000, halfOpenRequests: 1 },
      },
    },
  }),
}));

vi.mock('../engine/circuit-breaker.js', () => ({
  getCircuitBreaker: () => ({ state: 'closed' }),
}));

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

  it('DELETE /cache with pattern invalidates matching keys', async () => {
    const mockCache = {
      invalidate: vi.fn(),
      invalidateByPattern: vi.fn().mockResolvedValue(3),
    } as unknown as CacheService;
    const noopAuth: express.RequestHandler = (_req, _res, next) => next();

    const app = express();
    app.use('/admin', createAdminRouter(noopAuth, mockCache));

    const res = await request(app).delete('/admin/cache?pattern=bornes-*');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ pattern: 'bornes-*', keysDeleted: 3 });
    expect(mockCache.invalidateByPattern).toHaveBeenCalledWith('bornes-*');
  });

  it('DELETE /cache without pattern returns 400', async () => {
    const mockCache = { invalidate: vi.fn(), invalidateByPattern: vi.fn() } as unknown as CacheService;
    const noopAuth: express.RequestHandler = (_req, _res, next) => next();

    const app = express();
    app.use('/admin', createAdminRouter(noopAuth, mockCache));

    const res = await request(app).delete('/admin/cache');
    expect(res.status).toBe(400);
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

  it('GET /status returns collection health status', async () => {
    const mockCache = { invalidate: vi.fn(), invalidateByPattern: vi.fn() } as unknown as CacheService;
    const noopAuth: express.RequestHandler = (_req, _res, next) => next();

    const app = express();
    app.set('healthChecker', { getStatus: () => 'healthy', getAllStatuses: () => ({}) });
    app.use('/admin', createAdminRouter(noopAuth, mockCache));

    const res = await request(app).get('/admin/status');
    expect(res.status).toBe(200);
    expect(res.body.status).toBeDefined();
    expect(res.body.collections).toBeDefined();
    expect(res.body.timestamp).toBeDefined();
    expect(res.body.collections[0].id).toBe('test-collection');
    expect(res.body.collections[0].upstream).toBe('healthy');
    expect(res.body.collections[0].circuitBreaker).toBe('closed');
  });

  it('GET /dashboard returns HTML', async () => {
    const mockCache = { invalidate: vi.fn(), invalidateByPattern: vi.fn() } as unknown as CacheService;
    const noopAuth: express.RequestHandler = (_req, _res, next) => next();

    const app = express();
    app.use('/admin', createAdminRouter(noopAuth, mockCache));

    const res = await request(app).get('/admin/dashboard');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/html');
    expect(res.text).toContain('OGC Proxy Dashboard');
  });
});
