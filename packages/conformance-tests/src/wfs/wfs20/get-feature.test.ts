import { describe, it, expect } from 'vitest';
import { BASE_URL } from '../../helpers.js';

const GET_FEATURE_URL = `${BASE_URL}/wfs?service=WFS&version=2.0.0&request=GetFeature&outputFormat=application/json`;

describe('WFS 2.0.0 — GetFeature', () => {
  describe('GET', () => {
    it('supports count parameter (count=3)', async () => {
      const res = await fetch(
        `${GET_FEATURE_URL}&typeNames=bornes-fontaines&count=3`
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.type).toBe('FeatureCollection');
      expect(body.features).toHaveLength(3);
    });

    it('supports typeNames parameter plural form', async () => {
      const res = await fetch(
        `${GET_FEATURE_URL}&typeNames=bornes-fontaines&count=2`
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.type).toBe('FeatureCollection');
      expect(body.features).toHaveLength(2);
    });

    it('includes numberMatched and numberReturned', async () => {
      const res = await fetch(
        `${GET_FEATURE_URL}&typeNames=bornes-fontaines&count=5`
      );
      const body = await res.json();
      expect(body.numberMatched).toBeDefined();
      expect(body.numberReturned).toBe(5);
    });

    it('supports startIndex pagination', async () => {
      const res1 = await fetch(
        `${GET_FEATURE_URL}&typeNames=bornes-fontaines&count=2&startIndex=0`
      );
      const body1 = await res1.json();

      const res2 = await fetch(
        `${GET_FEATURE_URL}&typeNames=bornes-fontaines&count=2&startIndex=2`
      );
      const body2 = await res2.json();

      expect(body1.features[0].id).not.toBe(body2.features[0].id);
    });

    it('supports resultType=hits (0 features, numberMatched > 0)', async () => {
      const res = await fetch(
        `${GET_FEATURE_URL}&typeNames=bornes-fontaines&resultType=hits`
      );
      const body = await res.json();
      expect(body.features).toHaveLength(0);
      expect(body.numberMatched).toBeGreaterThan(0);
      expect(body.numberReturned).toBe(0);
    });
  });

  describe('POST', () => {
    it('supports count in POST XML body', async () => {
      const xmlBody = `<wfs:GetFeature service="WFS" version="2.0.0" outputFormat="application/json"
        count="3" startIndex="0"
        xmlns:wfs="http://www.opengis.net/wfs/2.0">
        <wfs:Query typeNames="bornes-fontaines"/>
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
  });
});
