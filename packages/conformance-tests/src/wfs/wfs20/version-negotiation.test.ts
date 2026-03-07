import { describe, it, expect } from 'vitest';
import { BASE_URL } from '../../helpers.js';

const CAPS_BASE = `${BASE_URL}/wfs?service=WFS&request=GetCapabilities`;

describe('WFS — Version Negotiation', () => {
  it('defaults to 1.1.0 when no version specified', async () => {
    const res = await fetch(CAPS_BASE);
    const xml = await res.text();
    expect(xml).toContain('version="1.1.0"');
  });

  it('returns 1.1.0 when version=1.1.0', async () => {
    const res = await fetch(`${CAPS_BASE}&version=1.1.0`);
    const xml = await res.text();
    expect(xml).toContain('version="1.1.0"');
  });

  it('returns 2.0.0 when version=2.0.0', async () => {
    const res = await fetch(`${CAPS_BASE}&version=2.0.0`);
    const xml = await res.text();
    expect(xml).toContain('version="2.0.0"');
  });

  it('GetFeature works regardless of version parameter', async () => {
    for (const version of ['1.1.0', '2.0.0']) {
      const res = await fetch(
        `${BASE_URL}/wfs?service=WFS&version=${version}&request=GetFeature&outputFormat=application/json&typeName=bornes-fontaines&maxFeatures=1`
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.type).toBe('FeatureCollection');
      expect(body.features.length).toBeGreaterThan(0);
    }
  });
});
