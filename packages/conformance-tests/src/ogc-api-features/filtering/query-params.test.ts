import { describe, it, expect } from 'vitest';
import { fetchGeoJson } from '../../helpers.js';

describe('OGC API — Query parameter filters', () => {
  it('filters by single property (etat=actif)', async () => {
    const { body } = await fetchGeoJson(
      '/ogc/collections/bornes-fontaines/items?etat=actif&limit=100'
    );
    expect(body.features.length).toBeGreaterThan(0);
    for (const f of body.features) {
      expect(f.properties.etat).toBe('actif');
    }
  });

  it('filters by different property (arrondissement=Verdun)', async () => {
    const { body } = await fetchGeoJson(
      '/ogc/collections/bornes-fontaines/items?arrondissement=Verdun&limit=100'
    );
    expect(body.features.length).toBeGreaterThan(0);
    for (const f of body.features) {
      expect(f.properties.arrondissement).toBe('Verdun');
    }
  });

  it('combines two property filters with AND semantics', async () => {
    const { body } = await fetchGeoJson(
      '/ogc/collections/bornes-fontaines/items?etat=actif&arrondissement=Verdun&limit=100'
    );
    for (const f of body.features) {
      expect(f.properties.etat).toBe('actif');
      expect(f.properties.arrondissement).toBe('Verdun');
    }
  });

  it('returns fewer results when filter is applied', async () => {
    const { body: all } = await fetchGeoJson(
      '/ogc/collections/bornes-fontaines/items?limit=100'
    );
    const { body: filtered } = await fetchGeoJson(
      '/ogc/collections/bornes-fontaines/items?etat=actif&limit=100'
    );
    expect(filtered.features.length).toBeLessThan(all.features.length);
  });

  it('returns empty features for non-matching filter', async () => {
    const { body } = await fetchGeoJson(
      '/ogc/collections/bornes-fontaines/items?etat=nonexistent&limit=100'
    );
    expect(body.features).toHaveLength(0);
  });
});
