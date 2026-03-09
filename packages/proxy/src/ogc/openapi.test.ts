import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../engine/registry.js', () => ({
  getRegistry: vi.fn(),
}));

import { buildOpenApiSpec } from './openapi.js';
import { getRegistry } from '../engine/registry.js';

describe('buildOpenApiSpec', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('returns valid OpenAPI 3.0 structure', () => {
    vi.mocked(getRegistry).mockReturnValue({
      collections: { 'bornes-fontaines': { title: 'Bornes' } as any },
    } as any);
    const spec = buildOpenApiSpec('http://localhost:3000');
    expect(spec.openapi).toBe('3.0.0');
    expect(spec.info).toEqual(expect.objectContaining({ title: 'OGC Proxy Municipal', version: '0.1.0' }));
    expect(spec.servers).toEqual([{ url: 'http://localhost:3000' }]);
  });

  it('generates paths for each collection', () => {
    vi.mocked(getRegistry).mockReturnValue({
      collections: {
        'bornes-fontaines': { title: 'Bornes' } as any,
        'pistes-cyclables': { title: 'Pistes' } as any,
      },
    } as any);
    const spec = buildOpenApiSpec('http://localhost:3000');
    const paths = spec.paths as Record<string, unknown>;
    expect(paths['/collections/bornes-fontaines/items']).toBeDefined();
    expect(paths['/collections/bornes-fontaines/items/{featureId}']).toBeDefined();
    expect(paths['/collections/pistes-cyclables/items']).toBeDefined();
    expect(paths['/collections/pistes-cyclables/items/{featureId}']).toBeDefined();
  });

  it('includes static endpoints', () => {
    vi.mocked(getRegistry).mockReturnValue({ collections: {} } as any);
    const spec = buildOpenApiSpec('http://localhost:3000');
    const paths = spec.paths as Record<string, unknown>;
    expect(paths['/']).toBeDefined();
    expect(paths['/conformance']).toBeDefined();
    expect(paths['/collections']).toBeDefined();
  });

  it('handles empty collections', () => {
    vi.mocked(getRegistry).mockReturnValue({ collections: {} } as any);
    const spec = buildOpenApiSpec('http://localhost:3000');
    const paths = spec.paths as Record<string, unknown>;
    expect(Object.keys(paths)).toHaveLength(3);
  });
});
