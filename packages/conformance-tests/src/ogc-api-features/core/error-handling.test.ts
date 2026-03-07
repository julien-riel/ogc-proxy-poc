import { describe, it, expect } from 'vitest';
import { fetchJson, fetchGeoJson } from '../../helpers.js';

describe('OGC API — Error Handling', () => {
  it('returns 404 for non-existent collection', async () => {
    const { status } = await fetchJson('/ogc/collections/unknown');
    expect(status).toBe(404);
  });

  it('returns 404 for non-existent feature', async () => {
    const { status } = await fetchJson('/ogc/collections/bornes-fontaines/items/99999');
    expect(status).toBe(404);
  });

  it('returns 404 for items of non-existent collection', async () => {
    const { status } = await fetchGeoJson('/ogc/collections/unknown/items');
    expect(status).toBe(404);
  });

  it('returns 404 for queryables of non-existent collection', async () => {
    const { status } = await fetchJson('/ogc/collections/unknown/queryables');
    expect(status).toBe(404);
  });

  it('returns 400 for invalid CQL2 filter', async () => {
    const filter = encodeURIComponent('INVALID SYNTAX !!!');
    const { status } = await fetchGeoJson(
      `/ogc/collections/bornes-fontaines/items?filter=${filter}&filter-lang=cql2-text`
    );
    expect(status).toBe(400);
  });

  it('returns 400 for unsupported filter-lang', async () => {
    const filter = encodeURIComponent("etat='actif'");
    const { status, body } = await fetchGeoJson(
      `/ogc/collections/bornes-fontaines/items?filter=${filter}&filter-lang=cql-invalid`
    );
    expect(status).toBe(400);
    expect(body.code).toBe('InvalidFilterLang');
  });

  it('returns 400 for non-sortable field', async () => {
    const { status } = await fetchGeoJson(
      '/ogc/collections/bornes-fontaines/items?sortby=etat'
    );
    expect(status).toBe(400);
  });
});
