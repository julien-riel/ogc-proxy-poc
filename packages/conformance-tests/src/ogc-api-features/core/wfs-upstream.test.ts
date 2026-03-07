import { describe, it, expect } from 'vitest';
import { fetchGeoJson, fetchJson } from '../../helpers.js';

describe('OGC API — WFS Upstream (mrc-quebec via PAVICS)', () => {
  it('appears in collections list', async () => {
    const { body } = await fetchJson('/ogc/collections');
    const ids = body.collections.map((c: any) => c.id);
    expect(ids).toContain('mrc-quebec');
  });

  it('returns collection metadata', async () => {
    const { status, body } = await fetchJson('/ogc/collections/mrc-quebec');
    expect(status).toBe(200);
    expect(body.title).toBe('MRC du Quebec');
  });

  it('returns features from PAVICS', async () => {
    const { status, body } = await fetchGeoJson('/ogc/collections/mrc-quebec/items?limit=5');
    expect(status).toBe(200);
    expect(body.type).toBe('FeatureCollection');
    expect(body.features.length).toBeGreaterThan(0);
    expect(body.features.length).toBeLessThanOrEqual(5);
  });

  it('features have Polygon geometry', async () => {
    const { body } = await fetchGeoJson('/ogc/collections/mrc-quebec/items?limit=1');
    const feature = body.features[0];
    expect(feature.type).toBe('Feature');
    expect(feature.geometry).toBeDefined();
    // PAVICS may return Polygon or MultiPolygon
    expect(['Polygon', 'MultiPolygon']).toContain(feature.geometry.type);
  });

  it('has queryables endpoint', async () => {
    const { status, body } = await fetchJson('/ogc/collections/mrc-quebec/queryables');
    expect(status).toBe(200);
    expect(body.properties).toBeDefined();
  });
});
