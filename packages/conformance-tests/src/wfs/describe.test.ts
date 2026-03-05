import { describe, it, expect } from 'vitest';
import { BASE_URL } from '../helpers.js';

describe('WFS — DescribeFeatureType', () => {
  it('returns JSON with featureTypes', async () => {
    const res = await fetch(
      `${BASE_URL}/wfs?service=WFS&request=DescribeFeatureType&typeName=bornes-fontaines&outputFormat=application/json`
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.featureTypes).toBeDefined();
    expect(body.featureTypes).toHaveLength(1);
  });

  it('includes geometry property with gml type', async () => {
    const res = await fetch(
      `${BASE_URL}/wfs?service=WFS&request=DescribeFeatureType&typeName=bornes-fontaines&outputFormat=application/json`
    );
    const body = await res.json();
    const geomProp = body.featureTypes[0].properties.find((p: any) => p.name === 'geometry');
    expect(geomProp).toBeDefined();
    expect(geomProp.type).toBe('gml:Point');
    expect(geomProp.localType).toBe('Point');
  });

  it('includes attribute properties with xsd types', async () => {
    const res = await fetch(
      `${BASE_URL}/wfs?service=WFS&request=DescribeFeatureType&typeName=bornes-fontaines&outputFormat=application/json`
    );
    const body = await res.json();
    const props = body.featureTypes[0].properties;
    const etat = props.find((p: any) => p.name === 'etat');
    expect(etat).toBeDefined();
    expect(etat.type).toBe('xsd:string');
  });

  it('returns 404 for unknown type', async () => {
    const res = await fetch(
      `${BASE_URL}/wfs?service=WFS&request=DescribeFeatureType&typeName=unknown&outputFormat=application/json`
    );
    expect(res.status).toBe(404);
  });
});
