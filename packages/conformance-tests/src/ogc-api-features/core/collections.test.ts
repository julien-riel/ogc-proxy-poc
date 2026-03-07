import { describe, it, expect } from 'vitest';
import { fetchJson } from '../../helpers.js';

describe('OGC API — Collections (/ogc/collections)', () => {
  it('supports HTTP GET', async () => {
    const { status } = await fetchJson('/ogc/collections');
    expect(status).toBe(200);
  });

  it('returns links and collections arrays', async () => {
    const { body } = await fetchJson('/ogc/collections');
    expect(Array.isArray(body.links)).toBe(true);
    expect(Array.isArray(body.collections)).toBe(true);
  });

  it('has self link', async () => {
    const { body } = await fetchJson('/ogc/collections');
    const selfLink = body.links.find((l: any) => l.rel === 'self');
    expect(selfLink).toBeDefined();
  });

  it('contains expected collections', async () => {
    const { body } = await fetchJson('/ogc/collections');
    const ids = body.collections.map((c: any) => c.id);
    expect(ids).toContain('bornes-fontaines');
    expect(ids).toContain('pistes-cyclables');
    expect(ids).toContain('arrondissements');
  });

  it('each collection has id, title, and links', async () => {
    const { body } = await fetchJson('/ogc/collections');
    for (const col of body.collections) {
      expect(col.id).toBeDefined();
      expect(col.title).toBeDefined();
      expect(Array.isArray(col.links)).toBe(true);
    }
  });

  it('each collection has items link with type application/geo+json', async () => {
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

  it('collections with extent include spatial bbox', async () => {
    const { body } = await fetchJson('/ogc/collections');
    for (const col of body.collections) {
      if (col.extent?.spatial?.bbox) {
        const bbox = col.extent.spatial.bbox[0];
        expect(Array.isArray(bbox)).toBe(true);
        expect(bbox).toHaveLength(4);
      }
    }
  });
});

describe('OGC API — Single Collection (/ogc/collections/:id)', () => {
  it('supports HTTP GET', async () => {
    const { status } = await fetchJson('/ogc/collections/bornes-fontaines');
    expect(status).toBe(200);
  });

  it('returns correct id and title for bornes-fontaines', async () => {
    const { body } = await fetchJson('/ogc/collections/bornes-fontaines');
    expect(body.id).toBe('bornes-fontaines');
    expect(body.title).toBe('Bornes-fontaines');
  });

  it('has links array with items link', async () => {
    const { body } = await fetchJson('/ogc/collections/bornes-fontaines');
    expect(Array.isArray(body.links)).toBe(true);
    const itemsLink = body.links.find((l: any) => l.rel === 'items');
    expect(itemsLink).toBeDefined();
  });

  it('returns 404 for unknown collection', async () => {
    const { status } = await fetchJson('/ogc/collections/unknown');
    expect(status).toBe(404);
  });
});
