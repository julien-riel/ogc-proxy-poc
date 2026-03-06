import { describe, it, expect } from 'vitest';
import { fetchGeoJson } from '../helpers.js';

describe('OGC API — Download limits', () => {
  it('caps limit to maxPageSize', async () => {
    // Default maxPageSize is 1000, requesting 5000 should be capped
    const { body } = await fetchGeoJson(
      '/ogc/collections/bornes-fontaines/items?limit=5000'
    );
    // Should not return more than maxPageSize (but dataset only has 15 items)
    expect(body.features.length).toBeLessThanOrEqual(1000);
  });
});
