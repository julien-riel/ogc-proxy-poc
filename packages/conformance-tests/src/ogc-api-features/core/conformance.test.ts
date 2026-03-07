import { describe, it, expect } from 'vitest';
import { fetchJson } from '../../helpers.js';

describe('OGC API — Conformance (/ogc/conformance)', () => {
  it('supports HTTP GET at /conformance', async () => {
    const { status } = await fetchJson('/ogc/conformance');
    expect(status).toBe(200);
  });

  it('returns conformsTo as array with >0 entries', async () => {
    const { body } = await fetchJson('/ogc/conformance');
    expect(Array.isArray(body.conformsTo)).toBe(true);
    expect(body.conformsTo.length).toBeGreaterThan(0);
  });

  it('declares Core conformance class URI', async () => {
    const { body } = await fetchJson('/ogc/conformance');
    expect(body.conformsTo).toContain(
      'http://www.opengis.net/spec/ogcapi-features-1/1.0/conf/core'
    );
  });

  it('declares GeoJSON conformance class URI', async () => {
    const { body } = await fetchJson('/ogc/conformance');
    expect(body.conformsTo).toContain(
      'http://www.opengis.net/spec/ogcapi-features-1/1.0/conf/geojson'
    );
  });

  it('declares Filter conformance class URI', async () => {
    const { body } = await fetchJson('/ogc/conformance');
    const hasFilter = body.conformsTo.some(
      (uri: string) => uri.includes('filter') || uri.includes('Filter')
    );
    expect(hasFilter).toBe(true);
  });

  it('declares Features Filter conformance class URI', async () => {
    const { body } = await fetchJson('/ogc/conformance');
    const hasFeaturesFilter = body.conformsTo.some(
      (uri: string) => uri.includes('features-filter') || uri.includes('features_filter')
    );
    expect(hasFeaturesFilter).toBe(true);
  });

  it('all conformsTo entries are valid URIs', async () => {
    const { body } = await fetchJson('/ogc/conformance');
    for (const uri of body.conformsTo) {
      expect(uri).toMatch(/^https?:\/\//);
    }
  });
});
