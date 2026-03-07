import { describe, it, expect } from 'vitest';
import { fetchGeoJson, fetchJson } from '../../helpers.js';

describe('OGC API — Items (/ogc/collections/:id/items)', () => {
  it('supports HTTP GET with FeatureCollection', async () => {
    const { status, body } = await fetchGeoJson('/ogc/collections/bornes-fontaines/items');
    expect(status).toBe(200);
    expect(body.type).toBe('FeatureCollection');
  });

  it('returns application/geo+json content type', async () => {
    const { contentType } = await fetchGeoJson('/ogc/collections/bornes-fontaines/items');
    expect(contentType).toContain('application/geo+json');
  });

  it('has features array with valid GeoJSON structure', async () => {
    const { body } = await fetchGeoJson('/ogc/collections/bornes-fontaines/items');
    expect(Array.isArray(body.features)).toBe(true);
    expect(body.features.length).toBeGreaterThan(0);
    for (const feature of body.features) {
      expect(feature.type).toBe('Feature');
      expect(feature.geometry).toBeDefined();
      expect(feature.geometry.type).toBeDefined();
      expect(feature.geometry.coordinates).toBeDefined();
      expect(feature.properties).toBeDefined();
      expect(feature.id).toBeDefined();
    }
  });

  it('has self link with type application/geo+json', async () => {
    const { body } = await fetchGeoJson('/ogc/collections/bornes-fontaines/items');
    const selfLink = body.links.find((l: any) => l.rel === 'self');
    expect(selfLink).toBeDefined();
    expect(selfLink.type).toBe('application/geo+json');
  });

  it('numberReturned matches features count', async () => {
    const { body } = await fetchGeoJson('/ogc/collections/bornes-fontaines/items');
    expect(body.numberReturned).toBe(body.features.length);
  });

  it('timeStamp is in ISO 8601 format', async () => {
    const { body } = await fetchGeoJson('/ogc/collections/bornes-fontaines/items');
    expect(body.timeStamp).toBeDefined();
    const ts = body.timeStamp;
    expect(new Date(ts).toISOString()).toBe(ts);
  });

  it('numberMatched is 15 for bornes-fontaines', async () => {
    const { body } = await fetchGeoJson('/ogc/collections/bornes-fontaines/items');
    expect(body.numberMatched).toBe(15);
  });

  it('numberMatched is undefined for arrondissements', async () => {
    const { body } = await fetchGeoJson('/ogc/collections/arrondissements/items');
    expect(body.numberMatched).toBeUndefined();
  });

  describe('Geometry types', () => {
    it('Point for bornes-fontaines with coordinates length 2', async () => {
      const { body } = await fetchGeoJson('/ogc/collections/bornes-fontaines/items?limit=1');
      const geom = body.features[0].geometry;
      expect(geom.type).toBe('Point');
      expect(geom.coordinates).toHaveLength(2);
    });

    it('LineString for pistes-cyclables with coordinates length > 1', async () => {
      const { body } = await fetchGeoJson('/ogc/collections/pistes-cyclables/items?limit=1');
      const geom = body.features[0].geometry;
      expect(geom.type).toBe('LineString');
      expect(geom.coordinates.length).toBeGreaterThan(1);
    });

    it('Polygon for arrondissements', async () => {
      const { body } = await fetchGeoJson('/ogc/collections/arrondissements/items?limit=1');
      expect(body.features[0].geometry.type).toBe('Polygon');
    });
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

    it('includes prev link when offset > 0', async () => {
      const { body } = await fetchGeoJson('/ogc/collections/bornes-fontaines/items?limit=2&offset=4');
      const prevLink = body.links.find((l: any) => l.rel === 'prev');
      expect(prevLink).toBeDefined();
    });

    it('does not include prev link on first page', async () => {
      const { body } = await fetchGeoJson('/ogc/collections/bornes-fontaines/items?limit=2');
      const prevLink = body.links.find((l: any) => l.rel === 'prev');
      expect(prevLink).toBeUndefined();
    });

    it('no next link on last page', async () => {
      const { body } = await fetchGeoJson('/ogc/collections/bornes-fontaines/items?limit=100');
      const nextLink = body.links.find((l: any) => l.rel === 'next');
      expect(nextLink).toBeUndefined();
    });

    it('pages contain different features', async () => {
      const { body: page1 } = await fetchGeoJson('/ogc/collections/bornes-fontaines/items?limit=3&offset=0');
      const { body: page2 } = await fetchGeoJson('/ogc/collections/bornes-fontaines/items?limit=3&offset=3');
      const ids1 = page1.features.map((f: any) => f.id);
      const ids2 = page2.features.map((f: any) => f.id);
      for (const id of ids1) {
        expect(ids2).not.toContain(id);
      }
    });

    it('caps limit to maxPageSize', async () => {
      const { body } = await fetchGeoJson('/ogc/collections/bornes-fontaines/items?limit=5000');
      expect(body.features.length).toBeLessThanOrEqual(1000);
    });
  });
});

describe('OGC API — Single Feature (/ogc/collections/:id/items/:fid)', () => {
  it('supports HTTP GET with Feature type', async () => {
    const { status, body } = await fetchGeoJson('/ogc/collections/bornes-fontaines/items/1');
    expect(status).toBe(200);
    expect(body.type).toBe('Feature');
  });

  it('has geometry and properties', async () => {
    const { body } = await fetchGeoJson('/ogc/collections/bornes-fontaines/items/1');
    expect(body.geometry).toBeDefined();
    expect(body.properties).toBeDefined();
  });

  it('has self link with type application/geo+json', async () => {
    const { body } = await fetchGeoJson('/ogc/collections/bornes-fontaines/items/1');
    const selfLink = body.links.find((l: any) => l.rel === 'self');
    expect(selfLink).toBeDefined();
    expect(selfLink.type).toBe('application/geo+json');
  });

  it('has collection link with type application/json', async () => {
    const { body } = await fetchGeoJson('/ogc/collections/bornes-fontaines/items/1');
    const colLink = body.links.find((l: any) => l.rel === 'collection');
    expect(colLink).toBeDefined();
    expect(colLink.type).toBe('application/json');
  });

  it('returns 404 for unknown feature', async () => {
    const { status } = await fetchJson('/ogc/collections/bornes-fontaines/items/99999');
    expect(status).toBe(404);
  });

  it('returns 404 for unknown collection', async () => {
    const { status } = await fetchJson('/ogc/collections/unknown/items/1');
    expect(status).toBe(404);
  });
});
