import { describe, it, expect } from 'vitest';
import { fetchGeoJson } from '../../helpers.js';

/**
 * Builds items URL with CQL2 filter for a given collection.
 */
function cql2Url(collection: string, expr: string): string {
  return `/ogc/collections/${collection}/items?filter=${encodeURIComponent(expr)}&filter-lang=cql2-text&limit=100`;
}

describe('CQL2 Advanced Comparison', () => {
  it('filters with LIKE operator', async () => {
    const { body } = await fetchGeoJson(
      cql2Url('bornes-fontaines', "arrondissement LIKE 'V%'")
    );
    expect(body.features.length).toBeGreaterThan(0);
    for (const f of body.features) {
      expect(f.properties.arrondissement).toMatch(/^V/);
    }
  });

  it('filters with IN operator', async () => {
    const { body } = await fetchGeoJson(
      cql2Url('bornes-fontaines', "arrondissement IN ('Verdun','Ville-Marie')")
    );
    expect(body.features.length).toBeGreaterThan(0);
    for (const f of body.features) {
      expect(['Verdun', 'Ville-Marie']).toContain(f.properties.arrondissement);
    }
  });

  it('filters with IN operator using numeric values', async () => {
    const { body } = await fetchGeoJson(
      cql2Url('arrondissements', "population IN (89170,69229)")
    );
    expect(body.features.length).toBeGreaterThan(0);
    for (const f of body.features) {
      expect([89170, 69229]).toContain(f.properties.population);
    }
  });

  it('filters with BETWEEN operator', async () => {
    const { body } = await fetchGeoJson(
      cql2Url('arrondissements', 'population BETWEEN 70000 AND 100000')
    );
    expect(body.features.length).toBeGreaterThan(0);
    for (const f of body.features) {
      expect(f.properties.population).toBeGreaterThanOrEqual(70000);
      expect(f.properties.population).toBeLessThanOrEqual(100000);
    }
  });
});
