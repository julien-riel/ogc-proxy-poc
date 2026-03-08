import { describe, it, expect } from 'vitest';
import { fetchGeoJson } from '../../helpers.js';

describe('OGC API — filter-lang validation', () => {
  it('accepts cql2-text as filter-lang', async () => {
    const filter = encodeURIComponent("etat='actif'");
    const { status } = await fetchGeoJson(
      `/ogc/collections/bornes-fontaines/items?filter=${filter}&filter-lang=cql2-text`,
    );
    expect(status).toBe(200);
  });

  it('defaults to cql2-text when filter-lang is omitted', async () => {
    const filter = encodeURIComponent("etat='actif'");
    const { status } = await fetchGeoJson(`/ogc/collections/bornes-fontaines/items?filter=${filter}`);
    expect(status).toBe(200);
  });

  it('returns 400 for unsupported filter-lang', async () => {
    const filter = encodeURIComponent("etat='actif'");
    const { status, body } = await fetchGeoJson(
      `/ogc/collections/bornes-fontaines/items?filter=${filter}&filter-lang=cql-invalid`,
    );
    expect(status).toBe(400);
    expect(body.code).toBe('InvalidFilterLang');
  });
});
