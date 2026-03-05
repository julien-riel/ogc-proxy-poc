import { describe, it, expect } from 'vitest';
import { fetchGeoJson, fetchJson } from '../helpers.js';

describe('OGC API — Items (/ogc/collections/:id/items)', () => {
  it('returns 200 with FeatureCollection', async () => {
    const { status, body } = await fetchGeoJson('/ogc/collections/bornes-fontaines/items');
    expect(status).toBe(200);
    expect(body.type).toBe('FeatureCollection');
  });

  it('returns application/geo+json content type', async () => {
    const { contentType } = await fetchGeoJson('/ogc/collections/bornes-fontaines/items');
    expect(contentType).toContain('application/geo+json');
  });

  it('has features array', async () => {
    const { body } = await fetchGeoJson('/ogc/collections/bornes-fontaines/items');
    expect(Array.isArray(body.features)).toBe(true);
    expect(body.features.length).toBeGreaterThan(0);
  });

  it('each feature has valid GeoJSON structure', async () => {
    const { body } = await fetchGeoJson('/ogc/collections/bornes-fontaines/items');
    for (const feature of body.features) {
      expect(feature.type).toBe('Feature');
      expect(feature.geometry).toBeDefined();
      expect(feature.geometry.type).toBeDefined();
      expect(feature.geometry.coordinates).toBeDefined();
      expect(feature.properties).toBeDefined();
      expect(feature.id).toBeDefined();
    }
  });

  it('has self link with type', async () => {
    const { body } = await fetchGeoJson('/ogc/collections/bornes-fontaines/items');
    const selfLink = body.links.find((l: any) => l.rel === 'self');
    expect(selfLink).toBeDefined();
    expect(selfLink.type).toBe('application/geo+json');
  });

  it('has numberReturned matching features count', async () => {
    const { body } = await fetchGeoJson('/ogc/collections/bornes-fontaines/items');
    expect(body.numberReturned).toBe(body.features.length);
  });

  it('has timeStamp', async () => {
    const { body } = await fetchGeoJson('/ogc/collections/bornes-fontaines/items');
    expect(body.timeStamp).toBeDefined();
  });

  describe('Pagination', () => {
    it('respects limit parameter', async () => {
      const { body } = await fetchGeoJson('/ogc/collections/bornes-fontaines/items?limit=3');
      expect(body.features).toHaveLength(3);
      expect(body.numberReturned).toBe(3);
    });

    it('includes next link when more items exist', async () => {
      const { body } = await fetchGeoJson('/ogc/collections/bornes-fontaines/items?limit=2');
      const nextLink = body.links.find((l: any) => l.rel === 'next');
      expect(nextLink).toBeDefined();
      expect(nextLink.type).toBe('application/geo+json');
    });

    it('next link returns valid FeatureCollection', async () => {
      const { body: page1 } = await fetchGeoJson('/ogc/collections/bornes-fontaines/items?limit=2');
      const nextLink = page1.links.find((l: any) => l.rel === 'next');
      expect(nextLink).toBeDefined();

      const nextUrl = new URL(nextLink.href);
      const res = await fetch(nextUrl.toString());
      const page2 = await res.json();
      expect(page2.type).toBe('FeatureCollection');
      expect(page2.features.length).toBeGreaterThan(0);
    });

    it('has numberMatched when upstream provides total', async () => {
      const { body } = await fetchGeoJson('/ogc/collections/bornes-fontaines/items');
      expect(body.numberMatched).toBeDefined();
      expect(body.numberMatched).toBe(15);
    });

    it('omits numberMatched when upstream has no total', async () => {
      const { body } = await fetchGeoJson('/ogc/collections/arrondissements/items');
      expect(body.numberMatched).toBeUndefined();
    });
  });

  describe('bbox filter', () => {
    it('filters features by bbox', async () => {
      const { body: all } = await fetchGeoJson('/ogc/collections/bornes-fontaines/items?limit=100');
      const { body: filtered } = await fetchGeoJson(
        '/ogc/collections/bornes-fontaines/items?limit=100&bbox=-73.59,45.49,-73.55,45.52'
      );
      expect(filtered.features.length).toBeLessThan(all.features.length);
      expect(filtered.features.length).toBeGreaterThan(0);
    });
  });

  describe('Geometry types', () => {
    it('returns Point geometry for bornes-fontaines', async () => {
      const { body } = await fetchGeoJson('/ogc/collections/bornes-fontaines/items?limit=1');
      expect(body.features[0].geometry.type).toBe('Point');
    });

    it('returns LineString geometry for pistes-cyclables', async () => {
      const { body } = await fetchGeoJson('/ogc/collections/pistes-cyclables/items?limit=1');
      expect(body.features[0].geometry.type).toBe('LineString');
    });

    it('returns Polygon geometry for arrondissements', async () => {
      const { body } = await fetchGeoJson('/ogc/collections/arrondissements/items?limit=1');
      expect(body.features[0].geometry.type).toBe('Polygon');
    });
  });
});

describe('OGC API — Single Feature (/ogc/collections/:id/items/:fid)', () => {
  it('returns 200 with Feature', async () => {
    const { status, body } = await fetchGeoJson('/ogc/collections/bornes-fontaines/items/1');
    expect(status).toBe(200);
    expect(body.type).toBe('Feature');
  });

  it('has self link', async () => {
    const { body } = await fetchGeoJson('/ogc/collections/bornes-fontaines/items/1');
    const selfLink = body.links.find((l: any) => l.rel === 'self');
    expect(selfLink).toBeDefined();
    expect(selfLink.type).toBe('application/geo+json');
  });

  it('has collection link', async () => {
    const { body } = await fetchGeoJson('/ogc/collections/bornes-fontaines/items/1');
    const colLink = body.links.find((l: any) => l.rel === 'collection');
    expect(colLink).toBeDefined();
    expect(colLink.type).toBe('application/json');
  });

  it('returns 404 for unknown feature', async () => {
    const { status } = await fetchJson('/ogc/collections/bornes-fontaines/items/99999');
    expect(status).toBe(404);
  });
});
