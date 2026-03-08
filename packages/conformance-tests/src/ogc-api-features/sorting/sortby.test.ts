import { describe, it, expect } from 'vitest';
import { fetchGeoJson, fetchJson } from '../../helpers.js';

describe('OGC API — Sorting (sortby)', () => {
  it('returns 400 when upstream does not support sorting on a sortable field', async () => {
    const { status, body } = await fetchGeoJson('/ogc/collections/arrondissements/items?sortby=population&limit=100');
    expect(status).toBe(400);
    expect(body.code).toBe('InvalidSortby');
  });

  it('returns 400 for descending sort on unsupported upstream field', async () => {
    const { status, body } = await fetchGeoJson('/ogc/collections/arrondissements/items?sortby=-population&limit=100');
    expect(status).toBe(400);
    expect(body.code).toBe('InvalidSortby');
  });

  it('returns 400 for non-sortable field', async () => {
    const { status, body } = await fetchGeoJson('/ogc/collections/bornes-fontaines/items?sortby=etat');
    expect(status).toBe(400);
    expect(body.code).toBe('InvalidSortby');
  });

  it('returns 400 for unknown field', async () => {
    const { status, body } = await fetchGeoJson('/ogc/collections/arrondissements/items?sortby=nonexistent');
    expect(status).toBe(400);
    expect(body.code).toBe('InvalidSortby');
  });

  it('queryables annotates population as sortable', async () => {
    const { body } = await fetchJson('/ogc/collections/arrondissements/queryables');
    expect(body.properties.population['x-ogc-sortable']).toBe(true);
  });
});
