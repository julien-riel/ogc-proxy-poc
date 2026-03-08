import { describe, it, expect } from 'vitest';
import { fetchGeoJson } from '../../helpers.js';

/**
 * Builds items URL with CQL2 filter for a given collection.
 */
function cql2Url(collection: string, expr: string): string {
  return `/ogc/collections/${collection}/items?filter=${encodeURIComponent(expr)}&filter-lang=cql2-text&limit=100`;
}

describe('CQL2 Basic', () => {
  it('filters with = operator', async () => {
    const { body } = await fetchGeoJson(cql2Url('bornes-fontaines', "etat='actif'"));
    expect(body.features.length).toBeGreaterThan(0);
    for (const f of body.features) {
      expect(f.properties.etat).toBe('actif');
    }
  });

  it('filters with <> operator', async () => {
    const { body } = await fetchGeoJson(cql2Url('bornes-fontaines', "etat<>'actif'"));
    expect(body.features.length).toBeGreaterThan(0);
    for (const f of body.features) {
      expect(f.properties.etat).not.toBe('actif');
    }
  });

  it('filters with > operator', async () => {
    const { body } = await fetchGeoJson(cql2Url('arrondissements', 'population>100000'));
    expect(body.features.length).toBeGreaterThan(0);
    for (const f of body.features) {
      expect(f.properties.population).toBeGreaterThan(100000);
    }
  });

  it('filters with < operator', async () => {
    const { body } = await fetchGeoJson(cql2Url('arrondissements', 'population<100000'));
    expect(body.features.length).toBeGreaterThan(0);
    for (const f of body.features) {
      expect(f.properties.population).toBeLessThan(100000);
    }
  });

  it('filters with >= operator', async () => {
    const { body } = await fetchGeoJson(cql2Url('arrondissements', 'population>=100000'));
    expect(body.features.length).toBeGreaterThan(0);
    for (const f of body.features) {
      expect(f.properties.population).toBeGreaterThanOrEqual(100000);
    }
  });

  it('filters with <= operator', async () => {
    const { body } = await fetchGeoJson(cql2Url('arrondissements', 'population<=100000'));
    expect(body.features.length).toBeGreaterThan(0);
    for (const f of body.features) {
      expect(f.properties.population).toBeLessThanOrEqual(100000);
    }
  });

  it('filters with AND operator', async () => {
    const { body } = await fetchGeoJson(cql2Url('bornes-fontaines', "etat='actif' AND arrondissement='Verdun'"));
    for (const f of body.features) {
      expect(f.properties.etat).toBe('actif');
      expect(f.properties.arrondissement).toBe('Verdun');
    }
  });

  it('filters with OR operator', async () => {
    const { body } = await fetchGeoJson(
      cql2Url('bornes-fontaines', "arrondissement='Verdun' OR arrondissement='Le Plateau-Mont-Royal'"),
    );
    expect(body.features.length).toBeGreaterThan(0);
    for (const f of body.features) {
      expect(['Verdun', 'Le Plateau-Mont-Royal']).toContain(f.properties.arrondissement);
    }
  });

  it('filters with NOT operator', async () => {
    const { body } = await fetchGeoJson(cql2Url('bornes-fontaines', "NOT etat='actif'"));
    expect(body.features.length).toBeGreaterThan(0);
    for (const f of body.features) {
      expect(f.properties.etat).not.toBe('actif');
    }
  });

  it('returns 400 for invalid CQL2 syntax', async () => {
    const { status } = await fetchGeoJson(cql2Url('bornes-fontaines', 'INVALID SYNTAX !!!'));
    expect(status).toBe(400);
  });

  it('filters with IS NULL', async () => {
    const { body } = await fetchGeoJson(cql2Url('bornes-fontaines', 'description IS NULL'));
    // All bornes-fontaines have no 'description' property, so all should match
    expect(body.features.length).toBeGreaterThan(0);
  });

  it('filters with IS NOT NULL', async () => {
    const { body } = await fetchGeoJson(cql2Url('bornes-fontaines', 'etat IS NOT NULL'));
    expect(body.features.length).toBeGreaterThan(0);
    for (const f of body.features) {
      expect(f.properties.etat).toBeDefined();
    }
  });
});
