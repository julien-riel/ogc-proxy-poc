import { describe, it, expect } from 'vitest';
import { BASE_URL } from '../../helpers.js';

/**
 * Sends a WFS 2.0.0 GetFeature POST with a FES 2.0 Filter XML body.
 */
async function postWfs20Filter(typeName: string, filterXml: string, count = 100) {
  const xmlBody = `<wfs:GetFeature service="WFS" version="2.0.0" outputFormat="application/json"
    count="${count}"
    xmlns:wfs="http://www.opengis.net/wfs/2.0"
    xmlns:fes="http://www.opengis.net/fes/2.0"
    xmlns:gml="http://www.opengis.net/gml/3.2">
    <wfs:Query typeNames="${typeName}">
      <fes:Filter>
        ${filterXml}
      </fes:Filter>
    </wfs:Query>
  </wfs:GetFeature>`;

  const res = await fetch(`${BASE_URL}/wfs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/xml' },
    body: xmlBody,
  });
  return { status: res.status, body: await res.json() };
}

describe('WFS 2.0.0 — Filter Encoding (FES 2.0)', () => {
  it('PropertyIsEqualTo with ValueReference', async () => {
    const { body } = await postWfs20Filter(
      'bornes-fontaines',
      `
      <fes:PropertyIsEqualTo>
        <fes:ValueReference>etat</fes:ValueReference>
        <fes:Literal>actif</fes:Literal>
      </fes:PropertyIsEqualTo>
    `,
    );
    expect(body.features.length).toBeGreaterThan(0);
    for (const f of body.features) {
      expect(f.properties.etat).toBe('actif');
    }
  });

  it('And combines two FES conditions', async () => {
    const { body } = await postWfs20Filter(
      'bornes-fontaines',
      `
      <fes:And>
        <fes:PropertyIsEqualTo>
          <fes:ValueReference>etat</fes:ValueReference>
          <fes:Literal>actif</fes:Literal>
        </fes:PropertyIsEqualTo>
        <fes:PropertyIsEqualTo>
          <fes:ValueReference>arrondissement</fes:ValueReference>
          <fes:Literal>Verdun</fes:Literal>
        </fes:PropertyIsEqualTo>
      </fes:And>
    `,
    );
    expect(body.features.length).toBeGreaterThan(0);
    for (const f of body.features) {
      expect(f.properties.etat).toBe('actif');
      expect(f.properties.arrondissement).toBe('Verdun');
    }
  });

  it('BBOX filter with GML 3.2 Envelope', async () => {
    const { body } = await postWfs20Filter(
      'bornes-fontaines',
      `
      <fes:BBOX>
        <fes:ValueReference>geometry</fes:ValueReference>
        <gml:Envelope srsName="urn:ogc:def:crs:OGC:1.3:CRS84">
          <gml:lowerCorner>-73.59 45.49</gml:lowerCorner>
          <gml:upperCorner>-73.55 45.52</gml:upperCorner>
        </gml:Envelope>
      </fes:BBOX>
    `,
    );
    expect(body.features.length).toBeGreaterThan(0);
    for (const f of body.features) {
      const [lon, lat] = f.geometry.coordinates;
      expect(lon).toBeGreaterThanOrEqual(-73.59);
      expect(lon).toBeLessThanOrEqual(-73.55);
      expect(lat).toBeGreaterThanOrEqual(45.49);
      expect(lat).toBeLessThanOrEqual(45.52);
    }
  });

  it('PropertyIsGreaterThan with numeric literal', async () => {
    const { body } = await postWfs20Filter(
      'arrondissements',
      `
      <fes:PropertyIsGreaterThan>
        <fes:ValueReference>population</fes:ValueReference>
        <fes:Literal>100000</fes:Literal>
      </fes:PropertyIsGreaterThan>
    `,
    );
    expect(body.features.length).toBeGreaterThan(0);
    for (const f of body.features) {
      expect(f.properties.population).toBeGreaterThan(100000);
    }
  });

  it('Intersects with GML Polygon', async () => {
    const { body } = await postWfs20Filter(
      'bornes-fontaines',
      `
      <fes:Intersects>
        <fes:ValueReference>geometry</fes:ValueReference>
        <gml:Polygon>
          <gml:exterior>
            <gml:LinearRing>
              <gml:posList>-73.59 45.49 -73.55 45.49 -73.55 45.52 -73.59 45.52 -73.59 45.49</gml:posList>
            </gml:LinearRing>
          </gml:exterior>
        </gml:Polygon>
      </fes:Intersects>
    `,
    );
    expect(body.features.length).toBeGreaterThan(0);
  });
});
