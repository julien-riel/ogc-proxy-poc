import { describe, it, expect, vi } from 'vitest';

vi.mock('../../logger.js', () => ({
  logger: {
    adapter: () => ({ info: vi.fn(), warning: vi.fn(), error: vi.fn() }),
  },
  initLogging: vi.fn(),
}));

import { fetchWithStrategy } from './index.js';
import type { CollectionConfig } from '../types.js';
import type { FetchParams, Fetcher } from './types.js';

const baseConfig = {
  title: 'Test',
  geometry: { type: 'Point' as const, xField: 'x', yField: 'y' },
  idField: 'id',
  properties: [{ name: 'name', type: 'string' }],
};

describe('fetchWithStrategy', () => {
  it('dispatches to offset-limit strategy', async () => {
    const config: CollectionConfig = {
      ...baseConfig,
      upstream: {
        baseUrl: 'http://example.com/api',
        method: 'GET',
        pagination: { type: 'offset-limit', offsetParam: 'offset', limitParam: 'limit' },
        responseMapping: { items: 'data', total: 'total', item: 'data' },
      },
    };
    const fetcher: Fetcher = vi.fn().mockResolvedValue({ data: [{ id: 1 }], total: 50 });
    const params: FetchParams = { offset: 0, limit: 10 };

    const result = await fetchWithStrategy(config, params, fetcher);

    const calledUrl = new URL((fetcher as ReturnType<typeof vi.fn>).mock.calls[0][0]);
    expect(calledUrl.searchParams.get('offset')).toBe('0');
    expect(calledUrl.searchParams.get('limit')).toBe('10');
    expect(result.items).toEqual([{ id: 1 }]);
    expect(result.total).toBe(50);
  });

  it('dispatches to page-based strategy', async () => {
    const config: CollectionConfig = {
      ...baseConfig,
      upstream: {
        baseUrl: 'http://example.com/api',
        method: 'GET',
        pagination: { type: 'page-pageSize', pageParam: 'page', pageSizeParam: 'size' },
        responseMapping: { items: 'results', total: 'count', item: 'results' },
      },
    };
    const fetcher: Fetcher = vi.fn().mockResolvedValue({ results: [{ id: 1 }], count: 20 });
    const params: FetchParams = { offset: 0, limit: 5 };

    const result = await fetchWithStrategy(config, params, fetcher);

    const calledUrl = new URL((fetcher as ReturnType<typeof vi.fn>).mock.calls[0][0]);
    expect(calledUrl.searchParams.get('page')).toBe('1');
    expect(calledUrl.searchParams.get('size')).toBe('5');
    expect(result.items).toEqual([{ id: 1 }]);
    expect(result.total).toBe(20);
  });

  it('dispatches to WFS strategy', async () => {
    const config: CollectionConfig = {
      ...baseConfig,
      upstream: {
        type: 'wfs',
        baseUrl: 'http://wfs.example.com/geoserver/wfs',
        method: 'GET',
        pagination: { type: 'offset-limit', offsetParam: 'startIndex', limitParam: 'maxFeatures' },
        responseMapping: { items: 'features', total: 'totalFeatures', item: 'features' },
        typeName: 'ns:layer',
        version: '2.0.0',
      },
    };
    const fetcher: Fetcher = vi.fn().mockResolvedValue({
      features: [{ id: 1 }],
      totalFeatures: 100,
    });
    const params: FetchParams = { offset: 0, limit: 10 };

    const result = await fetchWithStrategy(config, params, fetcher);

    const calledUrl = new URL((fetcher as ReturnType<typeof vi.fn>).mock.calls[0][0]);
    expect(calledUrl.searchParams.get('service')).toBe('WFS');
    expect(calledUrl.searchParams.get('request')).toBe('GetFeature');
    expect(calledUrl.searchParams.get('typeName')).toBe('ns:layer');
    expect(calledUrl.searchParams.get('version')).toBe('2.0.0');
    expect(result.items).toEqual([{ id: 1 }]);
    expect(result.total).toBe(100);
  });
});
