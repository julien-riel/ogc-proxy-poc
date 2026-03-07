import { describe, it, expect } from 'vitest';
import { BASE_URL } from '../../helpers.js';

const CAPS_URL = `${BASE_URL}/wfs?service=WFS&version=2.0.0&request=GetCapabilities`;

/**
 * Fetches and returns the WFS 2.0.0 GetCapabilities XML as text.
 */
async function fetchCapabilities() {
  const res = await fetch(CAPS_URL);
  const xml = await res.text();
  return { res, xml };
}

describe('WFS 2.0.0 — GetCapabilities', () => {
  it('returns capabilities with version 2.0.0 when requested', async () => {
    const { res, xml } = await fetchCapabilities();
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('application/xml');
    expect(xml).toContain('version="2.0.0"');
  });

  it('uses WFS 2.0 namespace (http://www.opengis.net/wfs/2.0)', async () => {
    const { xml } = await fetchCapabilities();
    expect(xml).toContain('xmlns:wfs="http://www.opengis.net/wfs/2.0"');
  });

  it('lists all feature types (bornes-fontaines, pistes-cyclables, arrondissements)', async () => {
    const { xml } = await fetchCapabilities();
    expect(xml).toContain('<Name>bornes-fontaines</Name>');
    expect(xml).toContain('<Name>pistes-cyclables</Name>');
    expect(xml).toContain('<Name>arrondissements</Name>');
  });

  it('includes OperationsMetadata with GetCapabilities and GetFeature', async () => {
    const { xml } = await fetchCapabilities();
    expect(xml).toContain('ows:OperationsMetadata');
    expect(xml).toContain('name="GetCapabilities"');
    expect(xml).toContain('name="GetFeature"');
  });

  it('has ServiceTypeVersion 2.0.0', async () => {
    const { xml } = await fetchCapabilities();
    expect(xml).toContain('<ows:ServiceTypeVersion>2.0.0</ows:ServiceTypeVersion>');
  });

  it('uses DefaultCRS instead of DefaultSRS', async () => {
    const { xml } = await fetchCapabilities();
    expect(xml).toContain('DefaultCRS');
    expect(xml).not.toContain('DefaultSRS');
  });
});
