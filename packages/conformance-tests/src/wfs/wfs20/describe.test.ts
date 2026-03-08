import { describe, it, expect } from 'vitest';
import { fetchJson } from '../../helpers.js';

describe('WFS 2.0.0 — DescribeFeatureType', () => {
  it('returns JSON schema for bornes-fontaines', async () => {
    const { status, body } = await fetchJson(
      '/wfs?service=WFS&version=2.0.0&request=DescribeFeatureType&typeNames=bornes-fontaines',
    );
    expect(status).toBe(200);
    expect(body.featureTypes).toBeDefined();
    expect(body.featureTypes[0].typeName).toBe('bornes-fontaines');
  });

  it('includes geometry property with gml type', async () => {
    const { body } = await fetchJson(
      '/wfs?service=WFS&version=2.0.0&request=DescribeFeatureType&typeNames=bornes-fontaines',
    );
    const geomProp = body.featureTypes[0].properties.find((p: { name: string }) => p.name === 'geometry');
    expect(geomProp).toBeDefined();
    expect(geomProp.type).toBe('gml:Point');
    expect(geomProp.localType).toBe('Point');
  });

  it('works with typeNames (plural) parameter', async () => {
    const { status, body } = await fetchJson(
      '/wfs?service=WFS&version=2.0.0&request=DescribeFeatureType&typeNames=pistes-cyclables',
    );
    expect(status).toBe(200);
    const geomProp = body.featureTypes[0].properties.find((p: { name: string }) => p.name === 'geometry');
    expect(geomProp.type).toBe('gml:LineString');
  });

  it('returns all geometry types correctly', async () => {
    const expected: Record<string, string> = {
      'bornes-fontaines': 'gml:Point',
      'pistes-cyclables': 'gml:LineString',
      arrondissements: 'gml:Polygon',
    };
    for (const [typeName, gmlType] of Object.entries(expected)) {
      const { body } = await fetchJson(
        `/wfs?service=WFS&version=2.0.0&request=DescribeFeatureType&typeNames=${typeName}`,
      );
      const geomProp = body.featureTypes[0].properties.find((p: { name: string }) => p.name === 'geometry');
      expect(geomProp.type).toBe(gmlType);
    }
  });

  it('returns 404 for unknown type name', async () => {
    const { status } = await fetchJson('/wfs?service=WFS&version=2.0.0&request=DescribeFeatureType&typeNames=unknown');
    expect(status).toBe(404);
  });
});
