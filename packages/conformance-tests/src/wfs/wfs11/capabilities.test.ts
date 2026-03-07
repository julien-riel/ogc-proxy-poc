import { describe, it, expect } from 'vitest';
import { BASE_URL } from '../../helpers.js';

const CAPS_URL = `${BASE_URL}/wfs?service=WFS&version=1.1.0&request=GetCapabilities`;

/**
 * Fetches and returns the WFS 1.1.0 GetCapabilities XML as text.
 */
async function fetchCapabilities() {
  const res = await fetch(CAPS_URL);
  const xml = await res.text();
  return { res, xml };
}

describe('WFS 1.1.0 — GetCapabilities', () => {
  it('returns XML with 200', async () => {
    const res = await fetch(CAPS_URL);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('application/xml');
  });

  it('contains WFS_Capabilities root element with version="1.1.0"', async () => {
    const { xml } = await fetchCapabilities();
    expect(xml).toContain('wfs:WFS_Capabilities');
    expect(xml).toContain('version="1.1.0"');
  });

  it('declares required XML namespaces (wfs, ows, ogc)', async () => {
    const { xml } = await fetchCapabilities();
    expect(xml).toContain('xmlns:wfs=');
    expect(xml).toContain('xmlns:ows=');
    expect(xml).toContain('xmlns:ogc=');
  });

  it('has ServiceIdentification with WFS type and version 1.1.0', async () => {
    const { xml } = await fetchCapabilities();
    expect(xml).toContain('ows:ServiceIdentification');
    expect(xml).toContain('<ows:ServiceType>WFS</ows:ServiceType>');
    expect(xml).toContain('<ows:ServiceTypeVersion>1.1.0</ows:ServiceTypeVersion>');
  });

  it('lists all feature types in FeatureTypeList', async () => {
    const { xml } = await fetchCapabilities();
    expect(xml).toContain('FeatureTypeList');
    expect(xml).toContain('<Name>bornes-fontaines</Name>');
    expect(xml).toContain('<Name>pistes-cyclables</Name>');
    expect(xml).toContain('<Name>arrondissements</Name>');
  });

  it('each feature type has WGS84BoundingBox with LowerCorner/UpperCorner', async () => {
    const { xml } = await fetchCapabilities();
    const featureTypeBlocks = xml.split('<FeatureType>').slice(1);
    expect(featureTypeBlocks.length).toBeGreaterThanOrEqual(3);
    for (const block of featureTypeBlocks) {
      expect(block).toContain('ows:WGS84BoundingBox');
      expect(block).toContain('ows:LowerCorner');
      expect(block).toContain('ows:UpperCorner');
    }
  });

  it('declares application/json output format', async () => {
    const { xml } = await fetchCapabilities();
    expect(xml).toContain('application/json');
  });

  it('includes OperationsMetadata with GetCapabilities, DescribeFeatureType, GetFeature', async () => {
    const { xml } = await fetchCapabilities();
    expect(xml).toContain('ows:OperationsMetadata');
    expect(xml).toContain('GetCapabilities');
    expect(xml).toContain('DescribeFeatureType');
    expect(xml).toContain('GetFeature');
  });

  it('declares DefaultSRS (CRS84) and OtherSRS (EPSG:3857)', async () => {
    const { xml } = await fetchCapabilities();
    expect(xml).toMatch(/DefaultSRS.*CRS84|DefaultSRS.*4326/s);
    expect(xml).toContain('EPSG::3857');
  });

  it('has Filter_Capabilities with Spatial_Capabilities and Scalar_Capabilities', async () => {
    const { xml } = await fetchCapabilities();
    expect(xml).toContain('Filter_Capabilities');
    expect(xml).toContain('Spatial_Capabilities');
    expect(xml).toContain('Scalar_Capabilities');
  });
});
