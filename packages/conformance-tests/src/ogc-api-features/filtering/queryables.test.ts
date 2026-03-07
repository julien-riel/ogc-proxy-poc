import { describe, it, expect } from 'vitest';
import { fetchJson } from '../../helpers.js';

describe('OGC API — Queryables (/ogc/collections/:id/queryables)', () => {
  it('supports HTTP GET at queryables path', async () => {
    const { status } = await fetchJson('/ogc/collections/bornes-fontaines/queryables');
    expect(status).toBe(200);
  });

  it('returns JSON Schema with $schema property containing "json-schema.org"', async () => {
    const { body } = await fetchJson('/ogc/collections/bornes-fontaines/queryables');
    expect(body.$schema).toContain('json-schema.org');
  });

  it('has type: "object"', async () => {
    const { body } = await fetchJson('/ogc/collections/bornes-fontaines/queryables');
    expect(body.type).toBe('object');
  });

  it('lists filterable properties (etat, arrondissement for bornes-fontaines)', async () => {
    const { body } = await fetchJson('/ogc/collections/bornes-fontaines/queryables');
    expect(body.properties.etat).toBeDefined();
    expect(body.properties.arrondissement).toBeDefined();
  });

  it('includes geometry for spatial queries', async () => {
    const { body } = await fetchJson('/ogc/collections/bornes-fontaines/queryables');
    expect(body.properties.geometry).toBeDefined();
  });

  it('annotates sortable properties (population has x-ogc-sortable: true for arrondissements)', async () => {
    const { body } = await fetchJson('/ogc/collections/arrondissements/queryables');
    expect(body.properties.population['x-ogc-sortable']).toBe(true);
  });

  it('returns different queryables per collection (bornes vs pistes have different property keys)', async () => {
    const { body: bornes } = await fetchJson('/ogc/collections/bornes-fontaines/queryables');
    const { body: pistes } = await fetchJson('/ogc/collections/pistes-cyclables/queryables');
    const bornesKeys = Object.keys(bornes.properties).sort();
    const pistesKeys = Object.keys(pistes.properties).sort();
    expect(bornesKeys).not.toEqual(pistesKeys);
  });

  it('returns 404 for unknown collection', async () => {
    const { status } = await fetchJson('/ogc/collections/unknown/queryables');
    expect(status).toBe(404);
  });
});
