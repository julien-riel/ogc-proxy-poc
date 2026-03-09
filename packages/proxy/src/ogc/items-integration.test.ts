import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

// Mock all dependencies before importing the module under test

vi.mock('../engine/registry.js', () => {
  const config = {
    title: 'Test',
    description: 'Test collection',
    properties: [{ name: 'etat', type: 'string', filterable: true }],
    geometry: { type: 'Point' },
    idField: 'id',
    maxPageSize: 100,
    upstream: {
      type: 'rest',
      baseUrl: 'http://test/api',
      method: 'GET',
      pagination: { type: 'offset-limit', offsetParam: 'offset', limitParam: 'limit' },
      responseMapping: { items: 'data', total: 'total', item: '.' },
    },
    cache: { ttlSeconds: 60 },
  };
  return {
    getRegistry: () => ({ collections: { test: config }, defaults: {} }),
    getCollection: (id: string) => (id === 'test' ? config : undefined),
    getCollectionIds: () => ['test'],
    getCollectionPlugin: vi.fn().mockResolvedValue(null),
  };
});

const mockFetchItems = vi.fn();
const mockFetchItem = vi.fn();

vi.mock('../engine/adapter.js', () => {
  class UpstreamError extends Error {
    constructor(public readonly statusCode: number) {
      super(`Upstream error: ${statusCode}`);
    }
  }
  class UpstreamTimeoutError extends Error {
    public readonly timeoutMs: number;
    constructor(url: string, timeoutMs: number) {
      super(`Upstream timeout after ${timeoutMs}ms`);
      this.timeoutMs = timeoutMs;
    }
  }
  return {
    fetchUpstreamItems: (...args: any[]) => mockFetchItems(...args),
    fetchUpstreamItem: (...args: any[]) => mockFetchItem(...args),
    UpstreamError,
    UpstreamTimeoutError,
  };
});

vi.mock('../metrics.js', () => ({
  collectionRequestsTotal: { inc: vi.fn() },
  featuresReturned: { observe: vi.fn() },
  safeMetric: (fn: () => void) => {
    try {
      fn();
    } catch {
      /* noop */
    }
  },
}));

vi.mock('../logger.js', () => ({
  logger: {
    items: () => ({ info: vi.fn(), warning: vi.fn(), error: vi.fn() }),
    adapter: () => ({ info: vi.fn(), warning: vi.fn(), error: vi.fn() }),
  },
}));

import { getItems, getItem } from './items.js';
import { UpstreamError, UpstreamTimeoutError } from '../engine/adapter.js';

describe('getItems integration', () => {
  let app: express.Express;

  beforeEach(() => {
    app = express();
    app.get('/collections/:collectionId/items', getItems);
    mockFetchItems.mockReset();
    mockFetchItem.mockReset();
  });

  it('returns 404 for unknown collection', async () => {
    const res = await request(app).get('/collections/unknown/items');
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('NotFound');
  });

  it('returns GeoJSON FeatureCollection', async () => {
    mockFetchItems.mockResolvedValue({
      items: [{ id: '1', etat: 'actif', x: -73.5, y: 45.5 }],
      total: 1,
    });
    const res = await request(app).get('/collections/test/items');
    expect(res.status).toBe(200);
    expect(res.body.type).toBe('FeatureCollection');
  });

  it('returns 400 for invalid filter-lang', async () => {
    const res = await request(app).get('/collections/test/items?filter=x%3D1&filter-lang=invalid');
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('InvalidFilterLang');
  });

  it('returns 400 for oversized filter', async () => {
    const longFilter = 'a'.repeat(5000);
    const res = await request(app).get(`/collections/test/items?filter=${longFilter}`);
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('InvalidFilter');
  });

  it('returns 502 on upstream error', async () => {
    mockFetchItems.mockRejectedValue(new UpstreamError(500));
    const res = await request(app).get('/collections/test/items');
    expect(res.status).toBe(502);
    expect(res.body.code).toBe('UpstreamError');
  });

  it('returns 504 on upstream timeout', async () => {
    mockFetchItems.mockRejectedValue(new UpstreamTimeoutError('http://test', 5000));
    const res = await request(app).get('/collections/test/items');
    expect(res.status).toBe(504);
    expect(res.body.code).toBe('GatewayTimeout');
  });

  it('returns 429 on rate limit', async () => {
    mockFetchItems.mockRejectedValue(new UpstreamError(429));
    const res = await request(app).get('/collections/test/items');
    expect(res.status).toBe(429);
    expect(res.body.code).toBe('TooManyRequests');
  });

  it('sets Cache-Control header when cache is configured', async () => {
    mockFetchItems.mockResolvedValue({ items: [], total: 0 });
    const res = await request(app).get('/collections/test/items');
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBeDefined();
  });

  it('sets ETag header', async () => {
    mockFetchItems.mockResolvedValue({ items: [], total: 0 });
    const res = await request(app).get('/collections/test/items');
    expect(res.status).toBe(200);
    expect(res.headers['etag']).toBeDefined();
  });
});

describe('getItem integration', () => {
  let app: express.Express;

  beforeEach(() => {
    app = express();
    app.get('/collections/:collectionId/items/:featureId', getItem);
    mockFetchItem.mockReset();
  });

  it('returns 404 for unknown collection', async () => {
    const res = await request(app).get('/collections/unknown/items/1');
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('NotFound');
  });

  it('returns 404 for unknown feature (upstream 404)', async () => {
    mockFetchItem.mockRejectedValue(new UpstreamError(404));
    const res = await request(app).get('/collections/test/items/nonexistent');
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('NotFound');
  });

  it('returns 404 when upstream returns null', async () => {
    mockFetchItem.mockResolvedValue(null);
    const res = await request(app).get('/collections/test/items/nonexistent');
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('NotFound');
  });

  it('returns 502 on upstream error', async () => {
    mockFetchItem.mockRejectedValue(new UpstreamError(500));
    const res = await request(app).get('/collections/test/items/1');
    expect(res.status).toBe(502);
    expect(res.body.code).toBe('UpstreamError');
  });

  it('returns 504 on timeout', async () => {
    mockFetchItem.mockRejectedValue(new UpstreamTimeoutError('http://test', 5000));
    const res = await request(app).get('/collections/test/items/1');
    expect(res.status).toBe(504);
    expect(res.body.code).toBe('GatewayTimeout');
  });

  it('returns 429 on rate limit', async () => {
    mockFetchItem.mockRejectedValue(new UpstreamError(429));
    const res = await request(app).get('/collections/test/items/1');
    expect(res.status).toBe(429);
    expect(res.body.code).toBe('TooManyRequests');
  });

  it('returns a Feature with links on success', async () => {
    mockFetchItem.mockResolvedValue({ id: '42', etat: 'actif' });
    const res = await request(app).get('/collections/test/items/42');
    expect(res.status).toBe(200);
    expect(res.body.type).toBe('Feature');
    expect(res.body.links).toBeInstanceOf(Array);
    const rels = res.body.links.map((l: any) => l.rel);
    expect(rels).toContain('self');
    expect(rels).toContain('collection');
  });
});
