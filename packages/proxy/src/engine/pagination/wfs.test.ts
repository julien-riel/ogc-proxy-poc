import { describe, it, expect, vi } from 'vitest';

import { wfsStrategy } from './wfs.js';
import type { CollectionConfig } from '../types.js';
import type { FetchParams, Fetcher } from './types.js';
import type { WfsPaginationParams } from './wfs.js';

const makeConfig = (): CollectionConfig => ({
  title: 'WFS Test',
  upstream: {
    type: 'wfs',
    baseUrl: 'http://wfs.example.com/geoserver/wfs',
    method: 'GET',
    pagination: { type: 'offset-limit', offsetParam: 'startIndex', limitParam: 'maxFeatures' },
    responseMapping: { items: 'features', total: 'totalFeatures', item: 'features' },
    typeName: 'layer:buildings',
    version: '1.1.0',
  },
  geometry: { type: 'Polygon', wktField: 'geom' },
  idField: 'id',
  properties: [{ name: 'name', type: 'string' }],
});

const makePagination = (): WfsPaginationParams => ({
  typeName: 'layer:buildings',
  version: '1.1.0',
});

describe('wfsStrategy', () => {
  it('builds WFS GetFeature URL with correct params', async () => {
    const config = makeConfig();
    const fetcher: Fetcher = vi.fn().mockResolvedValue({
      features: [{ id: 1, properties: { name: 'A' } }],
      totalFeatures: 42,
    });
    const params: FetchParams = { offset: 10, limit: 5 };

    const result = await wfsStrategy.fetch(config, makePagination(), params, fetcher);

    expect(fetcher).toHaveBeenCalledOnce();
    const calledUrl = new URL((fetcher as ReturnType<typeof vi.fn>).mock.calls[0][0]);
    expect(calledUrl.searchParams.get('service')).toBe('WFS');
    expect(calledUrl.searchParams.get('request')).toBe('GetFeature');
    expect(calledUrl.searchParams.get('typeName')).toBe('layer:buildings');
    expect(calledUrl.searchParams.get('startIndex')).toBe('10');
    expect(calledUrl.searchParams.get('maxFeatures')).toBe('5');
    expect(result.items).toEqual([{ id: 1, properties: { name: 'A' } }]);
    expect(result.total).toBe(42);
  });

  it('passes bbox to WFS URL', async () => {
    const config = makeConfig();
    const fetcher: Fetcher = vi.fn().mockResolvedValue({ features: [], totalFeatures: 0 });
    const params: FetchParams = { offset: 0, limit: 10, bbox: [-73, 45, -72, 46] };

    await wfsStrategy.fetch(config, makePagination(), params, fetcher);

    const calledUrl = new URL((fetcher as ReturnType<typeof vi.fn>).mock.calls[0][0]);
    expect(calledUrl.searchParams.get('BBOX')).toBe('-73,45,-72,46');
  });

  it('parses features and totalFeatures from response', async () => {
    const config = makeConfig();
    const fetcher: Fetcher = vi.fn().mockResolvedValue({
      features: [{ id: 1 }, { id: 2 }, { id: 3 }],
      totalFeatures: 100,
    });
    const params: FetchParams = { offset: 0, limit: 3 };

    const result = await wfsStrategy.fetch(config, makePagination(), params, fetcher);

    expect(result.items).toHaveLength(3);
    expect(result.total).toBe(100);
  });
});
