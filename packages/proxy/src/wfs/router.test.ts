import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createWfsRouter } from './router.js';

vi.mock('../engine/registry.js', () => {
  const config = {
    title: 'Test',
    properties: [{ name: 'etat', type: 'string' }],
    geometry: { type: 'Point' },
    idField: 'id',
    upstream: {
      type: 'rest',
      baseUrl: 'http://test/api',
      method: 'GET',
      pagination: { type: 'offset-limit', offsetParam: 'offset', limitParam: 'limit' },
      responseMapping: { items: 'data', total: 'total', item: '.' },
    },
  };
  return {
    getRegistry: () => ({ collections: { test: config } }),
    getCollection: (id: string) => (id === 'test' ? config : undefined),
    getCollectionIds: () => ['test'],
    getCollectionPlugin: vi.fn().mockResolvedValue(null),
  };
});

const mockFetchUpstreamItems = vi.fn();

vi.mock('../engine/adapter.js', () => ({
  fetchUpstreamItems: (...args: unknown[]) => mockFetchUpstreamItems(...args),
  UpstreamError: class UpstreamError extends Error {
    constructor(public readonly statusCode: number) {
      super(`Upstream error: ${statusCode}`);
    }
  },
  UpstreamTimeoutError: class UpstreamTimeoutError extends Error {
    public readonly timeoutMs: number;
    constructor(url: string, timeoutMs: number) {
      super(`timeout`);
      this.timeoutMs = timeoutMs;
    }
  },
}));

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
    wfs: () => ({ info: vi.fn(), warning: vi.fn(), error: vi.fn() }),
    adapter: () => ({ info: vi.fn(), warning: vi.fn(), error: vi.fn() }),
  },
}));

import { UpstreamError, UpstreamTimeoutError } from '../engine/adapter.js';

describe('WFS Router', () => {
  let app: express.Express;
  const noopAuth: express.RequestHandler = (_req, _res, next) => next();

  beforeEach(() => {
    app = express();
    app.use('/wfs', createWfsRouter(noopAuth));
    mockFetchUpstreamItems.mockReset();
  });

  describe('GetCapabilities', () => {
    it('returns XML for WFS 1.1 by default', async () => {
      const res = await request(app).get('/wfs?request=GetCapabilities');
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('application/xml');
      expect(res.text).toContain('version="1.1.0"');
    });

    it('returns WFS 2.0 when version=2.0.0', async () => {
      const res = await request(app).get('/wfs?request=GetCapabilities&version=2.0.0');
      expect(res.status).toBe(200);
      expect(res.text).toContain('version="2.0.0"');
    });

    it('is case-insensitive on request parameter', async () => {
      const res = await request(app).get('/wfs?REQUEST=GetCapabilities');
      expect(res.status).toBe(200);
    });
  });

  describe('DescribeFeatureType', () => {
    it('returns schema for valid type', async () => {
      const res = await request(app).get('/wfs?request=DescribeFeatureType&typeName=test');
      expect(res.status).toBe(200);
      expect(res.body.featureTypes).toBeDefined();
    });

    it('returns 404 for unknown type', async () => {
      const res = await request(app).get('/wfs?request=DescribeFeatureType&typeName=unknown');
      expect(res.status).toBe(404);
    });
  });

  describe('GetFeature', () => {
    it('returns GeoJSON features', async () => {
      mockFetchUpstreamItems.mockResolvedValue({
        items: [{ id: '1', etat: 'actif', x: -73.5, y: 45.5 }],
        total: 1,
      });
      const res = await request(app).get('/wfs?request=GetFeature&typeName=test');
      expect(res.status).toBe(200);
      expect(res.body.type).toBe('FeatureCollection');
    });

    it('returns 404 for unknown type', async () => {
      const res = await request(app).get('/wfs?request=GetFeature&typeName=unknown');
      expect(res.status).toBe(404);
    });

    it('returns 502 on upstream error', async () => {
      mockFetchUpstreamItems.mockRejectedValue(new UpstreamError(500));
      const res = await request(app).get('/wfs?request=GetFeature&typeName=test');
      expect(res.status).toBe(502);
    });

    it('returns 504 on timeout', async () => {
      mockFetchUpstreamItems.mockRejectedValue(new UpstreamTimeoutError('http://test', 5000));
      const res = await request(app).get('/wfs?request=GetFeature&typeName=test');
      expect(res.status).toBe(504);
    });

    it('returns 429 on rate limit', async () => {
      mockFetchUpstreamItems.mockRejectedValue(new UpstreamError(429));
      const res = await request(app).get('/wfs?request=GetFeature&typeName=test');
      expect(res.status).toBe(429);
    });
  });

  describe('Unknown request', () => {
    it('returns 400 for unknown request type', async () => {
      const res = await request(app).get('/wfs?request=Unknown');
      expect(res.status).toBe(400);
    });

    it('returns 400 for missing request parameter', async () => {
      const res = await request(app).get('/wfs');
      expect(res.status).toBe(400);
    });
  });

  describe('POST', () => {
    it('returns 400 for empty body', async () => {
      const res = await request(app).post('/wfs').set('Content-Type', 'application/xml').send('');
      expect(res.status).toBe(400);
    });
  });
});
