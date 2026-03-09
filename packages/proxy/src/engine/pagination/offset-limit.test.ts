import { describe, it, expect, vi } from 'vitest';

vi.mock('../../logger.js', () => ({
  logger: {
    adapter: () => ({ info: vi.fn(), warning: vi.fn(), error: vi.fn() }),
  },
  initLogging: vi.fn(),
}));

import { offsetLimitStrategy } from './offset-limit.js';
import type { CollectionConfig } from '../types.js';
import type { FetchParams, Fetcher } from './types.js';

const makeConfig = (): CollectionConfig => ({
  title: 'Test',
  upstream: {
    baseUrl: 'http://upstream.example.com/api/data',
    method: 'GET',
    pagination: { type: 'offset-limit', offsetParam: 'skip', limitParam: 'take' },
    responseMapping: { items: 'results', total: 'count', item: 'results' },
  },
  geometry: { type: 'Point', xField: 'x', yField: 'y' },
  idField: 'id',
  properties: [{ name: 'name', type: 'string' }],
});

describe('offsetLimitStrategy', () => {
  it('passes offset and limit to upstream URL', async () => {
    const config = makeConfig();
    const pagination = config.upstream.pagination as { type: 'offset-limit'; offsetParam: string; limitParam: string };
    const fetcher: Fetcher = vi.fn().mockResolvedValue({ results: [{ id: 1 }], count: 10 });
    const params: FetchParams = { offset: 5, limit: 3 };

    const result = await offsetLimitStrategy.fetch(config, pagination, params, fetcher);

    expect(fetcher).toHaveBeenCalledOnce();
    const calledUrl = new URL((fetcher as ReturnType<typeof vi.fn>).mock.calls[0][0]);
    expect(calledUrl.searchParams.get('skip')).toBe('5');
    expect(calledUrl.searchParams.get('take')).toBe('3');
    expect(result.items).toEqual([{ id: 1 }]);
    expect(result.total).toBe(10);
  });

  it('applies bbox and upstream params', async () => {
    const config = makeConfig();
    const pagination = config.upstream.pagination as { type: 'offset-limit'; offsetParam: string; limitParam: string };
    const fetcher: Fetcher = vi.fn().mockResolvedValue({ results: [], count: 0 });
    const params: FetchParams = {
      offset: 0,
      limit: 10,
      bbox: [-73, 45, -72, 46],
      upstreamParams: { format: 'json', lang: 'fr' },
    };

    await offsetLimitStrategy.fetch(config, pagination, params, fetcher);

    const calledUrl = new URL((fetcher as ReturnType<typeof vi.fn>).mock.calls[0][0]);
    expect(calledUrl.searchParams.get('bbox')).toBe('-73,45,-72,46');
    expect(calledUrl.searchParams.get('format')).toBe('json');
    expect(calledUrl.searchParams.get('lang')).toBe('fr');
  });
});
