import { describe, it, expect } from 'vitest';
import { BASE_URL } from '../../helpers.js';

const GET_FEATURE_URL = `${BASE_URL}/wfs?service=WFS&request=GetFeature&outputFormat=application/json`;

describe('WFS 1.1.0 — GetFeature', () => {
  describe('GET', () => {
    it('returns GeoJSON FeatureCollection', async () => {
      const res = await fetch(`${GET_FEATURE_URL}&typeName=bornes-fontaines&maxFeatures=5`);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.type).toBe('FeatureCollection');
      expect(body.features).toHaveLength(5);
    });

    it('includes totalFeatures and numberReturned', async () => {
      const res = await fetch(`${GET_FEATURE_URL}&typeName=bornes-fontaines&maxFeatures=5`);
      const body = await res.json();
      expect(body.totalFeatures).toBeDefined();
      expect(body.numberReturned).toBe(5);
    });

    it('includes CRS info (crs.properties.name matches CRS84)', async () => {
      const res = await fetch(`${GET_FEATURE_URL}&typeName=bornes-fontaines&maxFeatures=1`);
      const body = await res.json();
      expect(body.crs).toBeDefined();
      expect(body.crs.properties.name).toMatch(/CRS84/);
    });

    it('supports startIndex for pagination', async () => {
      const res1 = await fetch(`${GET_FEATURE_URL}&typeName=bornes-fontaines&maxFeatures=2&startIndex=0`);
      const body1 = await res1.json();

      const res2 = await fetch(`${GET_FEATURE_URL}&typeName=bornes-fontaines&maxFeatures=2&startIndex=2`);
      const body2 = await res2.json();

      expect(body1.features[0].id).not.toBe(body2.features[0].id);
    });

    it('supports resultType=hits', async () => {
      const res = await fetch(`${GET_FEATURE_URL}&typeName=bornes-fontaines&resultType=hits`);
      const body = await res.json();
      expect(body.features).toHaveLength(0);
      expect(body.numberMatched).toBeGreaterThan(0);
      expect(body.numberReturned).toBe(0);
    });

    it('reprojects to EPSG:3857 when srsName=EPSG:3857', async () => {
      const resCrs84 = await fetch(`${GET_FEATURE_URL}&typeName=bornes-fontaines&maxFeatures=1`);
      const bodyCrs84 = await resCrs84.json();

      const res3857 = await fetch(`${GET_FEATURE_URL}&typeName=bornes-fontaines&maxFeatures=1&srsName=EPSG:3857`);
      const body3857 = await res3857.json();

      const lonCrs84 = bodyCrs84.features[0].geometry.coordinates[0];
      const x3857 = body3857.features[0].geometry.coordinates[0];

      // EPSG:3857 x values are in meters, much larger than longitude degrees
      expect(Math.abs(x3857)).toBeGreaterThan(Math.abs(lonCrs84));
    });

    it('returns features for all geometry types', async () => {
      for (const typeName of ['bornes-fontaines', 'pistes-cyclables', 'arrondissements']) {
        const res = await fetch(`${GET_FEATURE_URL}&typeName=${typeName}&maxFeatures=1`);
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.type).toBe('FeatureCollection');
        expect(body.features.length).toBeGreaterThan(0);
      }
    });

    it('returns 404 for unknown typeName', async () => {
      const res = await fetch(`${GET_FEATURE_URL}&typeName=unknown&maxFeatures=1`);
      expect(res.status).toBe(404);
    });
  });

  describe('POST', () => {
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

    it('supports resultType=hits via POST', async () => {
      const xmlBody = `<wfs:GetFeature service="WFS" version="1.1.0" outputFormat="application/json"
        resultType="hits"
        xmlns:wfs="http://www.opengis.net/wfs">
        <wfs:Query typeName="bornes-fontaines"/>
      </wfs:GetFeature>`;

      const res = await fetch(`${BASE_URL}/wfs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/xml' },
        body: xmlBody,
      });
      const body = await res.json();
      expect(body.features).toHaveLength(0);
      expect(body.numberMatched).toBeGreaterThan(0);
      expect(body.numberReturned).toBe(0);
    });
  });
});
