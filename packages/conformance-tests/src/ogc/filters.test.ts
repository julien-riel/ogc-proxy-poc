import { describe, it, expect } from 'vitest';
import { fetchGeoJson } from '../helpers.js';

describe('OGC API — Simple query string filters', () => {
  it('filters bornes-fontaines by etat', async () => {
    const { body } = await fetchGeoJson(
      '/ogc/collections/bornes-fontaines/items?etat=actif&limit=100'
    );
    expect(body.features.length).toBeGreaterThan(0);
    for (const f of body.features) {
      expect(f.properties.etat).toBe('actif');
    }
  });

  it('filters bornes-fontaines by arrondissement', async () => {
    const { body } = await fetchGeoJson(
      '/ogc/collections/bornes-fontaines/items?arrondissement=Verdun&limit=100'
    );
    expect(body.features.length).toBeGreaterThan(0);
    for (const f of body.features) {
      expect(f.properties.arrondissement).toBe('Verdun');
    }
  });

  it('combines two filters with AND semantics', async () => {
    const { body } = await fetchGeoJson(
      '/ogc/collections/bornes-fontaines/items?etat=actif&arrondissement=Verdun&limit=100'
    );
    for (const f of body.features) {
      expect(f.properties.etat).toBe('actif');
      expect(f.properties.arrondissement).toBe('Verdun');
    }
  });
});

describe('OGC API — CQL2 filters', () => {
  it('filters with CQL2 equality', async () => {
    const filter = encodeURIComponent("etat='actif'");
    const { body } = await fetchGeoJson(
      `/ogc/collections/bornes-fontaines/items?filter=${filter}&filter-lang=cql2-text&limit=100`
    );
    expect(body.features.length).toBeGreaterThan(0);
    for (const f of body.features) {
      expect(f.properties.etat).toBe('actif');
    }
  });

  it('filters with CQL2 numeric comparison', async () => {
    const filter = encodeURIComponent('population>100000');
    const { body } = await fetchGeoJson(
      `/ogc/collections/arrondissements/items?filter=${filter}&filter-lang=cql2-text&limit=100`
    );
    expect(body.features.length).toBeGreaterThan(0);
    for (const f of body.features) {
      expect(f.properties.population).toBeGreaterThan(100000);
    }
  });

  it('returns 400 for invalid CQL2', async () => {
    const filter = encodeURIComponent('INVALID SYNTAX !!!');
    const { status } = await fetchGeoJson(
      `/ogc/collections/bornes-fontaines/items?filter=${filter}&filter-lang=cql2-text`
    );
    expect(status).toBe(400);
  });
});

describe('OGC API — Spatial filters (CQL2)', () => {
  it('S_INTERSECTS filters points within polygon', async () => {
    const filter = encodeURIComponent(
      'S_INTERSECTS(geometry,POLYGON((-73.59 45.49,-73.55 45.49,-73.55 45.52,-73.59 45.52,-73.59 45.49)))'
    );
    const { body } = await fetchGeoJson(
      `/ogc/collections/bornes-fontaines/items?filter=${filter}&filter-lang=cql2-text&limit=100`
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

  it('S_DWITHIN filters points within distance', async () => {
    const filter = encodeURIComponent(
      'S_DWITHIN(geometry,POINT(-73.5673 45.5017),500,meters)'
    );
    const { body } = await fetchGeoJson(
      `/ogc/collections/bornes-fontaines/items?filter=${filter}&filter-lang=cql2-text&limit=100`
    );
    expect(body.features.length).toBeGreaterThan(0);
  });
});
