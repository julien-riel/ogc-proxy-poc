import { describe, it, expect } from 'vitest';
import { fetchGeoJson } from '../../helpers.js';

describe('OGC API — Bounding box (bbox) filter', () => {
  it('filters features by bbox (fewer than unfiltered)', async () => {
    const { body: all } = await fetchGeoJson(
      '/ogc/collections/bornes-fontaines/items?limit=100'
    );
    const { body: filtered } = await fetchGeoJson(
      '/ogc/collections/bornes-fontaines/items?bbox=-73.59,45.49,-73.55,45.52&limit=100'
    );
    expect(filtered.features.length).toBeGreaterThan(0);
    expect(filtered.features.length).toBeLessThan(all.features.length);
  });

  it('returned features are within bbox', async () => {
    const { body } = await fetchGeoJson(
      '/ogc/collections/bornes-fontaines/items?bbox=-73.59,45.49,-73.55,45.52&limit=100'
    );
    for (const f of body.features) {
      const [lon, lat] = f.geometry.coordinates;
      expect(lon).toBeGreaterThanOrEqual(-73.59);
      expect(lon).toBeLessThanOrEqual(-73.55);
      expect(lat).toBeGreaterThanOrEqual(45.49);
      expect(lat).toBeLessThanOrEqual(45.52);
    }
  });

  it('returns empty when bbox has no matching features', async () => {
    const { body } = await fetchGeoJson(
      '/ogc/collections/bornes-fontaines/items?bbox=0,0,1,1&limit=100'
    );
    expect(body.features).toHaveLength(0);
  });

  it('combines bbox with CQL2 filter', async () => {
    const filter = encodeURIComponent("etat='actif'");
    const { body } = await fetchGeoJson(
      `/ogc/collections/bornes-fontaines/items?bbox=-73.59,45.49,-73.55,45.52&filter=${filter}&filter-lang=cql2-text&limit=100`
    );
    for (const f of body.features) {
      expect(f.properties.etat).toBe('actif');
      const [lon, lat] = f.geometry.coordinates;
      expect(lon).toBeGreaterThanOrEqual(-73.59);
      expect(lon).toBeLessThanOrEqual(-73.55);
      expect(lat).toBeGreaterThanOrEqual(45.49);
      expect(lat).toBeLessThanOrEqual(45.52);
    }
  });
});
