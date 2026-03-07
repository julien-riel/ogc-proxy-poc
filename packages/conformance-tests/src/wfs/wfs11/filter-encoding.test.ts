import { describe, it, expect } from 'vitest';
import { BASE_URL } from '../../helpers.js';

/**
 * Sends a WFS 1.1.0 GetFeature POST with a Filter XML body.
 */
async function postWfsFilter(typeName: string, filterXml: string, maxFeatures = 100) {
  const xmlBody = `<wfs:GetFeature service="WFS" version="1.1.0" outputFormat="application/json"
    maxFeatures="${maxFeatures}"
    xmlns:wfs="http://www.opengis.net/wfs"
    xmlns:ogc="http://www.opengis.net/ogc"
    xmlns:gml="http://www.opengis.net/gml">
    <wfs:Query typeName="${typeName}">
      <ogc:Filter>
        ${filterXml}
      </ogc:Filter>
    </wfs:Query>
  </wfs:GetFeature>`;

  const res = await fetch(`${BASE_URL}/wfs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/xml' },
    body: xmlBody,
  });
  return { status: res.status, body: await res.json() };
}

describe('WFS 1.1.0 — Filter Encoding', () => {
  describe('Comparison filters', () => {
    it('PropertyIsEqualTo filters by exact value', async () => {
      const { body } = await postWfsFilter('bornes-fontaines', `
        <ogc:PropertyIsEqualTo>
          <ogc:PropertyName>etat</ogc:PropertyName>
          <ogc:Literal>actif</ogc:Literal>
        </ogc:PropertyIsEqualTo>
      `);
      expect(body.features.length).toBeGreaterThan(0);
      for (const f of body.features) {
        expect(f.properties.etat).toBe('actif');
      }
    });

    it('PropertyIsNotEqualTo excludes matching values', async () => {
      const { body } = await postWfsFilter('bornes-fontaines', `
        <ogc:PropertyIsNotEqualTo>
          <ogc:PropertyName>etat</ogc:PropertyName>
          <ogc:Literal>actif</ogc:Literal>
        </ogc:PropertyIsNotEqualTo>
      `);
      expect(body.features.length).toBeGreaterThan(0);
      for (const f of body.features) {
        expect(f.properties.etat).not.toBe('actif');
      }
    });

    it('PropertyIsGreaterThan filters numeric values', async () => {
      const { body } = await postWfsFilter('arrondissements', `
        <ogc:PropertyIsGreaterThan>
          <ogc:PropertyName>population</ogc:PropertyName>
          <ogc:Literal>100000</ogc:Literal>
        </ogc:PropertyIsGreaterThan>
      `);
      expect(body.features.length).toBeGreaterThan(0);
      for (const f of body.features) {
        expect(f.properties.population).toBeGreaterThan(100000);
      }
    });

    it('PropertyIsLike filters with wildcards', async () => {
      const { body } = await postWfsFilter('bornes-fontaines', `
        <ogc:PropertyIsLike wildCard="*" singleChar="?" escapeChar="\\">
          <ogc:PropertyName>arrondissement</ogc:PropertyName>
          <ogc:Literal>V*</ogc:Literal>
        </ogc:PropertyIsLike>
      `);
      expect(body.features.length).toBeGreaterThan(0);
      for (const f of body.features) {
        expect(f.properties.arrondissement).toMatch(/^V/);
      }
    });

    it('PropertyIsBetween filters numeric range', async () => {
      const { body } = await postWfsFilter('arrondissements', `
        <ogc:PropertyIsBetween>
          <ogc:PropertyName>population</ogc:PropertyName>
          <ogc:LowerBoundary><ogc:Literal>70000</ogc:Literal></ogc:LowerBoundary>
          <ogc:UpperBoundary><ogc:Literal>100000</ogc:Literal></ogc:UpperBoundary>
        </ogc:PropertyIsBetween>
      `);
      expect(body.features.length).toBeGreaterThan(0);
      for (const f of body.features) {
        expect(f.properties.population).toBeGreaterThanOrEqual(70000);
        expect(f.properties.population).toBeLessThanOrEqual(100000);
      }
    });
  });

  describe('Logical filters', () => {
    it('And combines two conditions', async () => {
      const { body } = await postWfsFilter('bornes-fontaines', `
        <ogc:And>
          <ogc:PropertyIsEqualTo>
            <ogc:PropertyName>etat</ogc:PropertyName>
            <ogc:Literal>actif</ogc:Literal>
          </ogc:PropertyIsEqualTo>
          <ogc:PropertyIsEqualTo>
            <ogc:PropertyName>arrondissement</ogc:PropertyName>
            <ogc:Literal>Verdun</ogc:Literal>
          </ogc:PropertyIsEqualTo>
        </ogc:And>
      `);
      expect(body.features.length).toBeGreaterThan(0);
      for (const f of body.features) {
        expect(f.properties.etat).toBe('actif');
        expect(f.properties.arrondissement).toBe('Verdun');
      }
    });

    it('Or matches either condition', async () => {
      const { body } = await postWfsFilter('bornes-fontaines', `
        <ogc:Or>
          <ogc:PropertyIsEqualTo>
            <ogc:PropertyName>arrondissement</ogc:PropertyName>
            <ogc:Literal>Verdun</ogc:Literal>
          </ogc:PropertyIsEqualTo>
          <ogc:PropertyIsEqualTo>
            <ogc:PropertyName>arrondissement</ogc:PropertyName>
            <ogc:Literal>Ville-Marie</ogc:Literal>
          </ogc:PropertyIsEqualTo>
        </ogc:Or>
      `);
      expect(body.features.length).toBeGreaterThan(0);
      for (const f of body.features) {
        expect(['Verdun', 'Ville-Marie']).toContain(f.properties.arrondissement);
      }
    });

    it('Not negates a condition', async () => {
      const { body } = await postWfsFilter('bornes-fontaines', `
        <ogc:Not>
          <ogc:PropertyIsEqualTo>
            <ogc:PropertyName>etat</ogc:PropertyName>
            <ogc:Literal>actif</ogc:Literal>
          </ogc:PropertyIsEqualTo>
        </ogc:Not>
      `);
      expect(body.features.length).toBeGreaterThan(0);
      for (const f of body.features) {
        expect(f.properties.etat).not.toBe('actif');
      }
    });
  });

  describe('Spatial filters', () => {
    it('BBOX filters features within envelope', async () => {
      const { body } = await postWfsFilter('bornes-fontaines', `
        <ogc:BBOX>
          <ogc:PropertyName>geometry</ogc:PropertyName>
          <gml:Envelope srsName="CRS:84">
            <gml:lowerCorner>-73.59 45.49</gml:lowerCorner>
            <gml:upperCorner>-73.55 45.52</gml:upperCorner>
          </gml:Envelope>
        </ogc:BBOX>
      `);
      expect(body.features.length).toBeGreaterThan(0);
      for (const f of body.features) {
        const [lon, lat] = f.geometry.coordinates;
        expect(lon).toBeGreaterThanOrEqual(-73.59);
        expect(lon).toBeLessThanOrEqual(-73.55);
        expect(lat).toBeGreaterThanOrEqual(45.49);
        expect(lat).toBeLessThanOrEqual(45.52);
      }
    });

    it('Intersects filters with polygon', async () => {
      const { body } = await postWfsFilter('bornes-fontaines', `
        <ogc:Intersects>
          <ogc:PropertyName>geometry</ogc:PropertyName>
          <gml:Polygon>
            <gml:exterior>
              <gml:LinearRing>
                <gml:posList>-73.59 45.49 -73.55 45.49 -73.55 45.52 -73.59 45.52 -73.59 45.49</gml:posList>
              </gml:LinearRing>
            </gml:exterior>
          </gml:Polygon>
        </ogc:Intersects>
      `);
      expect(body.features.length).toBeGreaterThan(0);
      for (const f of body.features) {
        const [lon, lat] = f.geometry.coordinates;
        expect(lon).toBeGreaterThanOrEqual(-73.59);
        expect(lon).toBeLessThanOrEqual(-73.55);
        expect(lat).toBeGreaterThanOrEqual(45.49);
        expect(lat).toBeLessThanOrEqual(45.52);
      }
    });

    it('Within filters points within polygon', async () => {
      const { body } = await postWfsFilter('bornes-fontaines', `
        <ogc:Within>
          <ogc:PropertyName>geometry</ogc:PropertyName>
          <gml:Polygon>
            <gml:exterior>
              <gml:LinearRing>
                <gml:posList>-73.59 45.49 -73.55 45.49 -73.55 45.52 -73.59 45.52 -73.59 45.49</gml:posList>
              </gml:LinearRing>
            </gml:exterior>
          </gml:Polygon>
        </ogc:Within>
      `);
      expect(body.features.length).toBeGreaterThan(0);
    });

    it('Contains filters polygons containing a point', async () => {
      const { body } = await postWfsFilter('arrondissements', `
        <ogc:Contains>
          <ogc:PropertyName>geometry</ogc:PropertyName>
          <gml:Point>
            <gml:pos>-73.5673 45.5017</gml:pos>
          </gml:Point>
        </ogc:Contains>
      `);
      expect(body.features.length).toBeGreaterThan(0);
      for (const f of body.features) {
        expect(f.properties.nom).toBe('Ville-Marie');
      }
    });
  });
});
