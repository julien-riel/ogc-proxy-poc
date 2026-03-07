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

  it('filters with OR as alternative to IN operator', async () => {
    const { body } = await fetchGeoJson(
      cql2Url('bornes-fontaines', "arrondissement='Verdun' OR arrondissement='Ville-Marie'")
    );
    expect(body.features.length).toBeGreaterThan(0);
    for (const f of body.features) {
      expect(['Verdun', 'Ville-Marie']).toContain(f.properties.arrondissement);
    }
  });
});
