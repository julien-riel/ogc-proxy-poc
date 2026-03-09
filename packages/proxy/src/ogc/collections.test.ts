import { describe, it, expect, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

vi.mock('../engine/registry.js', () => {
  const collections: Record<string, any> = {
    'bornes-fontaines': {
      title: 'Bornes-fontaines',
      description: 'Bornes-fontaines de la ville',
      properties: [{ name: 'etat', type: 'string' }],
      geometry: { type: 'Point' },
      idField: 'id',
      extent: { spatial: [-73.98, 45.41, -73.47, 45.7] },
      upstream: {
        baseUrl: 'http://test/api',
        method: 'GET',
        pagination: { type: 'offset-limit', offsetParam: 'offset', limitParam: 'limit' },
        responseMapping: { items: 'data', total: 'total', item: '.' },
      },
    },
  };
  return {
    getRegistry: () => ({ collections, defaults: {} }),
    getCollection: (id: string) => collections[id] ?? undefined,
    getCollectionIds: () => Object.keys(collections),
    getCollectionPlugin: vi.fn().mockResolvedValue(null),
  };
});

import { listCollections, getCollectionById } from './collections.js';

describe('listCollections', () => {
  const app = express();
  app.get('/collections', listCollections);

  it('returns collection list', async () => {
    const res = await request(app).get('/collections');
    expect(res.status).toBe(200);
    expect(res.body.collections).toBeInstanceOf(Array);
    expect(res.body.collections).toHaveLength(1);
    expect(res.body.collections[0].id).toBe('bornes-fontaines');
    expect(res.body.collections[0].title).toBe('Bornes-fontaines');
  });

  it('includes proper links', async () => {
    const res = await request(app).get('/collections');
    expect(res.body.links).toBeDefined();
    const col = res.body.collections[0];
    const rels = col.links.map((l: any) => l.rel);
    expect(rels).toContain('self');
    expect(rels).toContain('items');
  });

  it('includes extent when configured', async () => {
    const res = await request(app).get('/collections');
    const col = res.body.collections[0];
    expect(col.extent).toBeDefined();
    expect(col.extent.spatial.bbox).toBeDefined();
  });

  it('includes CRS information', async () => {
    const res = await request(app).get('/collections');
    const col = res.body.collections[0];
    expect(col.crs).toContain('http://www.opengis.net/def/crs/OGC/1.3/CRS84');
  });
});

describe('getCollectionById', () => {
  const app = express();
  app.get('/collections/:collectionId', getCollectionById);

  it('returns collection by id', async () => {
    const res = await request(app).get('/collections/bornes-fontaines');
    expect(res.status).toBe(200);
    expect(res.body.id).toBe('bornes-fontaines');
    expect(res.body.title).toBe('Bornes-fontaines');
  });

  it('returns 404 for unknown collection', async () => {
    const res = await request(app).get('/collections/nonexistent');
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('NotFound');
  });

  it('includes self and items links', async () => {
    const res = await request(app).get('/collections/bornes-fontaines');
    const rels = res.body.links.map((l: any) => l.rel);
    expect(rels).toContain('self');
    expect(rels).toContain('items');
  });
});
