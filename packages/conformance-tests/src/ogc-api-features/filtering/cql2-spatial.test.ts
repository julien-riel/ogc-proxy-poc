import { describe, it, expect } from 'vitest';
import { fetchGeoJson } from '../../helpers.js';

/**
 * Builds items URL with CQL2 filter for a given collection.
 */
function cql2Url(collection: string, expr: string): string {
  return `/ogc/collections/${collection}/items?filter=${encodeURIComponent(expr)}&filter-lang=cql2-text&limit=100`;
}

describe('CQL2 Spatial filters', () => {
  it('S_INTERSECTS filters points within polygon', async () => {
    const { body } = await fetchGeoJson(
      cql2Url(
        'bornes-fontaines',
        'S_INTERSECTS(geometry,POLYGON((-73.59 45.49,-73.55 45.49,-73.55 45.52,-73.59 45.52,-73.59 45.49)))'
      )
    );
    expect(body.features.length).toBeGreaterThan(0);
    for (const f of body.features) {
      const [lon, lat] = f.geometry.coordinates;
      expect(lon).toBeGreaterThanOrEqual(-73.59);
      expect(lon).toBeLessThanOrEqual(-73.55);
      expect(lat).toBeGreaterThanOrEqual(45.49);
      expect(lat).toBeLessThanOrEqual(45.52);
    }
  });

  it('S_INTERSECTS works with a different polygon', async () => {
    const { body } = await fetchGeoJson(
      cql2Url(
        'bornes-fontaines',
        'S_INTERSECTS(geometry,POLYGON((-73.60 45.45,-73.55 45.45,-73.55 45.48,-73.60 45.48,-73.60 45.45)))'
      )
    );
    expect(body.features.length).toBeGreaterThan(0);
    for (const f of body.features) {
      const [lon, lat] = f.geometry.coordinates;
      expect(lon).toBeGreaterThanOrEqual(-73.60);
      expect(lon).toBeLessThanOrEqual(-73.55);
      expect(lat).toBeGreaterThanOrEqual(45.45);
      expect(lat).toBeLessThanOrEqual(45.48);
    }
  });

  it('S_DWITHIN filters points within distance', async () => {
    const { body } = await fetchGeoJson(
      cql2Url(
        'bornes-fontaines',
        'S_DWITHIN(geometry,POINT(-73.5673 45.5017),500,meters)'
      )
    );
    expect(body.features.length).toBeGreaterThan(0);
  });

  it('S_WITHIN filters points within polygon', async () => {
    const { body } = await fetchGeoJson(
      cql2Url(
        'bornes-fontaines',
        'S_WITHIN(geometry,POLYGON((-73.59 45.49,-73.55 45.49,-73.55 45.52,-73.59 45.52,-73.59 45.49)))'
      )
    );
    expect(body.features.length).toBeGreaterThan(0);
    for (const f of body.features) {
      const [lon, lat] = f.geometry.coordinates;
      expect(lon).toBeGreaterThanOrEqual(-73.59);
      expect(lon).toBeLessThanOrEqual(-73.55);
      expect(lat).toBeGreaterThanOrEqual(45.49);
      expect(lat).toBeLessThanOrEqual(45.52);
    }
  });

  it('combines spatial filter with attribute filter via AND', async () => {
    const { body } = await fetchGeoJson(
      cql2Url(
        'bornes-fontaines',
        "S_INTERSECTS(geometry,POLYGON((-73.59 45.49,-73.55 45.49,-73.55 45.52,-73.59 45.52,-73.59 45.49))) AND etat='actif'"
      )
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
