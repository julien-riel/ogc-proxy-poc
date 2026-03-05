import { describe, it, expect } from 'vitest';
import { BASE_URL } from '../helpers.js';

describe('WFS — GetCapabilities', () => {
  it('returns XML with 200', async () => {
    const res = await fetch(`${BASE_URL}/wfs?service=WFS&version=1.1.0&request=GetCapabilities`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('application/xml');
  });

  it('contains WFS_Capabilities root element', async () => {
    const res = await fetch(`${BASE_URL}/wfs?service=WFS&version=1.1.0&request=GetCapabilities`);
    const xml = await res.text();
    expect(xml).toContain('wfs:WFS_Capabilities');
    expect(xml).toContain('version="1.1.0"');
  });

  it('lists all feature types', async () => {
    const res = await fetch(`${BASE_URL}/wfs?service=WFS&version=1.1.0&request=GetCapabilities`);
    const xml = await res.text();
    expect(xml).toContain('<Name>bornes-fontaines</Name>');
    expect(xml).toContain('<Name>pistes-cyclables</Name>');
    expect(xml).toContain('<Name>arrondissements</Name>');
  });

  it('declares application/json output format', async () => {
    const res = await fetch(`${BASE_URL}/wfs?service=WFS&version=1.1.0&request=GetCapabilities`);
    const xml = await res.text();
    expect(xml).toContain('application/json');
  });

  it('includes OperationsMetadata', async () => {
    const res = await fetch(`${BASE_URL}/wfs?service=WFS&version=1.1.0&request=GetCapabilities`);
    const xml = await res.text();
    expect(xml).toContain('ows:OperationsMetadata');
    expect(xml).toContain('GetCapabilities');
    expect(xml).toContain('DescribeFeatureType');
    expect(xml).toContain('GetFeature');
  });
});
