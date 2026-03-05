import { describe, it, expect } from 'vitest';
import { fetchJson } from '../helpers.js';

describe('OGC API — Conformance (/ogc/conformance)', () => {
  it('returns 200', async () => {
    const { status } = await fetchJson('/ogc/conformance');
    expect(status).toBe(200);
  });

  it('has conformsTo array', async () => {
    const { body } = await fetchJson('/ogc/conformance');
    expect(Array.isArray(body.conformsTo)).toBe(true);
  });

  it('declares Core conformance class', async () => {
    const { body } = await fetchJson('/ogc/conformance');
    expect(body.conformsTo).toContain(
      'http://www.opengis.net/spec/ogcapi-features-1/1.0/conf/core'
    );
  });

  it('declares GeoJSON conformance class', async () => {
    const { body } = await fetchJson('/ogc/conformance');
    expect(body.conformsTo).toContain(
      'http://www.opengis.net/spec/ogcapi-features-1/1.0/conf/geojson'
    );
  });
});
