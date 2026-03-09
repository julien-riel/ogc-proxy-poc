import { describe, it, expect, vi } from 'vitest';
import { buildCapabilitiesXml, buildCapabilities20Xml } from './capabilities.js';
import type { Request } from 'express';

vi.mock('../engine/registry.js', () => ({
  getRegistry: () => ({
    collections: {
      'bornes-fontaines': {
        title: 'Bornes-fontaines',
        description: 'Test',
        properties: [{ name: 'etat', type: 'string' }],
        geometry: { type: 'Point' },
        idField: 'id',
        extent: { spatial: [-73.98, 45.41, -73.47, 45.7] },
        upstream: {
          baseUrl: 'http://test',
          method: 'GET',
          pagination: { type: 'offset-limit', offsetParam: 'o', limitParam: 'l' },
          responseMapping: { items: 'data', total: 'total', item: '.' },
        },
      },
    },
  }),
}));

function mockReq(overrides: Record<string, unknown> = {}): Request {
  return {
    protocol: 'http',
    get: (h: string) => (h === 'host' ? 'localhost:3000' : undefined),
    ...overrides,
  } as unknown as Request;
}

describe('buildCapabilitiesXml (WFS 1.1)', () => {
  it('returns valid XML with WFS version 1.1.0', () => {
    const xml = buildCapabilitiesXml(mockReq());
    expect(xml).toContain('version="1.1.0"');
    expect(xml).toContain('<FeatureType>');
    expect(xml).toContain('bornes-fontaines');
  });

  it('includes service URL', () => {
    const xml = buildCapabilitiesXml(mockReq());
    expect(xml).toContain('/wfs');
  });

  it('includes filter capabilities', () => {
    const xml = buildCapabilitiesXml(mockReq());
    expect(xml).toContain('Filter_Capabilities');
    expect(xml).toContain('BBOX');
  });
});

describe('buildCapabilities20Xml (WFS 2.0)', () => {
  it('returns valid XML with WFS version 2.0.0', () => {
    const xml = buildCapabilities20Xml(mockReq());
    expect(xml).toContain('version="2.0.0"');
    expect(xml).toContain('<FeatureType>');
    expect(xml).toContain('bornes-fontaines');
  });

  it('uses DefaultCRS tag', () => {
    const xml = buildCapabilities20Xml(mockReq());
    expect(xml).toContain('<DefaultCRS>');
  });
});
