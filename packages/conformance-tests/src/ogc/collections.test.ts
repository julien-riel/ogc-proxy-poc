import { describe, it, expect } from 'vitest';
import { fetchJson } from '../helpers.js';

describe('OGC API — Collections (/ogc/collections)', () => {
  it('returns 200', async () => {
    const { status } = await fetchJson('/ogc/collections');
    expect(status).toBe(200);
  });

  it('has links and collections arrays', async () => {
    const { body } = await fetchJson('/ogc/collections');
    expect(Array.isArray(body.links)).toBe(true);
    expect(Array.isArray(body.collections)).toBe(true);
  });

  it('has a self link with type', async () => {
    const { body } = await fetchJson('/ogc/collections');
    const selfLink = body.links.find((l: any) => l.rel === 'self');
    expect(selfLink).toBeDefined();
    expect(selfLink.type).toBeDefined();
  });

  it('contains expected collections', async () => {
    const { body } = await fetchJson('/ogc/collections');
    const ids = body.collections.map((c: any) => c.id);
    expect(ids).toContain('bornes-fontaines');
    expect(ids).toContain('pistes-cyclables');
    expect(ids).toContain('arrondissements');
    expect(ids).toContain('mrc-quebec');
  });

  it('each collection has id, title, and links', async () => {
    const { body } = await fetchJson('/ogc/collections');
    for (const col of body.collections) {
      expect(col.id).toBeDefined();
      expect(col.title).toBeDefined();
      expect(Array.isArray(col.links)).toBe(true);
    }
  });

  it('each collection has an items link', async () => {
    const { body } = await fetchJson('/ogc/collections');
    for (const col of body.collections) {
      const itemsLink = col.links.find((l: any) => l.rel === 'items');
      expect(itemsLink).toBeDefined();
      expect(itemsLink.type).toBe('application/geo+json');
    }
  });

  it('each collection declares CRS84', async () => {
    const { body } = await fetchJson('/ogc/collections');
    for (const col of body.collections) {
      expect(col.crs).toContain('http://www.opengis.net/def/crs/OGC/1.3/CRS84');
    }
  });
});

describe('OGC API — Single Collection (/ogc/collections/:id)', () => {
  it('returns 200 for existing collection', async () => {
    const { status } = await fetchJson('/ogc/collections/bornes-fontaines');
    expect(status).toBe(200);
  });

  it('returns 404 for unknown collection', async () => {
    const { status } = await fetchJson('/ogc/collections/unknown');
    expect(status).toBe(404);
  });

  it('has correct id and title', async () => {
    const { body } = await fetchJson('/ogc/collections/bornes-fontaines');
    expect(body.id).toBe('bornes-fontaines');
    expect(body.title).toBe('Bornes-fontaines');
  });
});
