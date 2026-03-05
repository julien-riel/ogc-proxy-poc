import { describe, it, expect } from 'vitest';
import { BASE_URL } from '../helpers.js';

describe('WFS — GetFeature', () => {
  describe('GET', () => {
    it('returns GeoJSON FeatureCollection', async () => {
      const res = await fetch(
        `${BASE_URL}/wfs?service=WFS&request=GetFeature&typeName=bornes-fontaines&maxFeatures=5&outputFormat=application/json`
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.type).toBe('FeatureCollection');
      expect(body.features).toHaveLength(5);
    });

    it('includes totalFeatures and numberReturned', async () => {
      const res = await fetch(
        `${BASE_URL}/wfs?service=WFS&request=GetFeature&typeName=bornes-fontaines&maxFeatures=5&outputFormat=application/json`
      );
      const body = await res.json();
      expect(body.totalFeatures).toBeDefined();
      expect(body.numberReturned).toBe(5);
    });

    it('includes CRS info', async () => {
      const res = await fetch(
        `${BASE_URL}/wfs?service=WFS&request=GetFeature&typeName=bornes-fontaines&maxFeatures=1&outputFormat=application/json`
      );
      const body = await res.json();
      expect(body.crs).toBeDefined();
      expect(body.crs.properties.name).toContain('EPSG');
    });

    it('supports startIndex for pagination', async () => {
      const res1 = await fetch(
        `${BASE_URL}/wfs?service=WFS&request=GetFeature&typeName=bornes-fontaines&maxFeatures=2&startIndex=0&outputFormat=application/json`
      );
      const body1 = await res1.json();

      const res2 = await fetch(
        `${BASE_URL}/wfs?service=WFS&request=GetFeature&typeName=bornes-fontaines&maxFeatures=2&startIndex=2&outputFormat=application/json`
      );
      const body2 = await res2.json();

      expect(body1.features[0].id).not.toBe(body2.features[0].id);
    });
  });

  describe('POST (MapStore compatibility)', () => {
    it('accepts XML body and returns GeoJSON', async () => {
      const xmlBody = `<wfs:GetFeature service="WFS" version="1.1.0" outputFormat="application/json"
        maxFeatures="3" startIndex="0"
        xmlns:wfs="http://www.opengis.net/wfs">
        <wfs:Query typeName="bornes-fontaines"/>
      </wfs:GetFeature>`;

      const res = await fetch(`${BASE_URL}/wfs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/xml' },
        body: xmlBody,
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.type).toBe('FeatureCollection');
      expect(body.features).toHaveLength(3);
    });

    it('works with all geometry types via POST', async () => {
      for (const typeName of ['bornes-fontaines', 'pistes-cyclables', 'arrondissements']) {
        const xmlBody = `<wfs:GetFeature service="WFS" version="1.1.0" outputFormat="application/json"
          maxFeatures="1" xmlns:wfs="http://www.opengis.net/wfs">
          <wfs:Query typeName="${typeName}"/>
        </wfs:GetFeature>`;

        const res = await fetch(`${BASE_URL}/wfs`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/xml' },
          body: xmlBody,
        });
        const body = await res.json();
        expect(body.type).toBe('FeatureCollection');
        expect(body.features.length).toBeGreaterThan(0);
      }
    });
  });
});
