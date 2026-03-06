import { describe, it, expect } from 'vitest';
import { fetchJson } from '../helpers.js';

describe('OGC API — Queryables (/ogc/collections/:id/queryables)', () => {
  it('returns 200 with JSON Schema', async () => {
    const { status, body } = await fetchJson('/ogc/collections/bornes-fontaines/queryables');
    expect(status).toBe(200);
    expect(body.$schema).toContain('json-schema.org');
    expect(body.type).toBe('object');
  });

  it('includes only filterable properties', async () => {
    const { body } = await fetchJson('/ogc/collections/bornes-fontaines/queryables');
    expect(body.properties.etat).toBeDefined();
    expect(body.properties.arrondissement).toBeDefined();
  });

  it('includes geometry for spatial queries', async () => {
    const { body } = await fetchJson('/ogc/collections/bornes-fontaines/queryables');
    expect(body.properties.geometry).toBeDefined();
  });

  it('includes sortable annotation', async () => {
    const { body } = await fetchJson('/ogc/collections/arrondissements/queryables');
    expect(body.properties.population['x-ogc-sortable']).toBe(true);
  });

  it('returns 404 for unknown collection', async () => {
    const { status } = await fetchJson('/ogc/collections/unknown/queryables');
    expect(status).toBe(404);
  });
});
