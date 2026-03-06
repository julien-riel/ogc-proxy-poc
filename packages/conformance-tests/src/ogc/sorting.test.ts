import { describe, it, expect } from 'vitest';
import { fetchGeoJson } from '../helpers.js';

describe('OGC API — Sorting (sortby)', () => {
  it('returns 400 for non-sortable field', async () => {
    const { status } = await fetchGeoJson(
      '/ogc/collections/bornes-fontaines/items?sortby=etat'
    );
    expect(status).toBe(400);
  });
});
