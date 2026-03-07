import { describe, it, expect } from 'vitest';
import { BASE_URL } from '../../helpers.js';

const DESCRIBE_URL = `${BASE_URL}/wfs?service=WFS&request=DescribeFeatureType&outputFormat=application/json`;

/**
 * Fetches DescribeFeatureType JSON for the given typeName.
 */
async function describeType(typeName: string) {
  const res = await fetch(`${DESCRIBE_URL}&typeName=${typeName}`);
  const body = await res.json();
  return { res, body };
}

describe('WFS 1.1.0 — DescribeFeatureType', () => {
  it('returns JSON with featureTypes', async () => {
    const { res, body } = await describeType('bornes-fontaines');
    expect(res.status).toBe(200);
    expect(body.featureTypes).toBeDefined();
    expect(body.featureTypes).toHaveLength(1);
  });

  it('includes geometry property with gml:Point type and localType Point', async () => {
    const { body } = await describeType('bornes-fontaines');
    const geomProp = body.featureTypes[0].properties.find((p: any) => p.name === 'geometry');
    expect(geomProp).toBeDefined();
    expect(geomProp.type).toBe('gml:Point');
    expect(geomProp.localType).toBe('Point');
  });

  it('includes attribute properties with xsd types (etat = xsd:string)', async () => {
    const { body } = await describeType('bornes-fontaines');
    const props = body.featureTypes[0].properties;
    const etat = props.find((p: any) => p.name === 'etat');
    expect(etat).toBeDefined();
    expect(etat.type).toBe('xsd:string');
  });

  it('describes LineString geometry for pistes-cyclables', async () => {
    const { body } = await describeType('pistes-cyclables');
    const geomProp = body.featureTypes[0].properties.find((p: any) => p.name === 'geometry');
    expect(geomProp).toBeDefined();
    expect(geomProp.type).toBe('gml:LineString');
    expect(geomProp.localType).toBe('LineString');
  });

  it('describes Polygon geometry for arrondissements', async () => {
    const { body } = await describeType('arrondissements');
    const geomProp = body.featureTypes[0].properties.find((p: any) => p.name === 'geometry');
    expect(geomProp).toBeDefined();
    expect(geomProp.type).toBe('gml:Polygon');
    expect(geomProp.localType).toBe('Polygon');
  });

  it('returns 404 for unknown type', async () => {
    const res = await fetch(`${DESCRIBE_URL}&typeName=unknown`);
    expect(res.status).toBe(404);
  });
});
