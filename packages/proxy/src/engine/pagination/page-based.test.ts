import { describe, it, expect, vi } from 'vitest';

vi.mock('../../logger.js', () => ({
  logger: {
    adapter: () => ({ info: vi.fn(), warning: vi.fn(), error: vi.fn() }),
  },
  initLogging: vi.fn(),
}));

import { pageBasedStrategy } from './page-based.js';
import type { CollectionConfig } from '../types.js';
import type { FetchParams, Fetcher } from './types.js';

const makeConfig = (): CollectionConfig => ({
  title: 'Test',
  upstream: {
    baseUrl: 'http://upstream.example.com/api/data',
    method: 'GET',
    pagination: { type: 'page-pageSize', pageParam: 'page', pageSizeParam: 'pageSize' },
    responseMapping: { items: 'results', total: 'count', item: 'results' },
  },
  geometry: { type: 'Point', xField: 'x', yField: 'y' },
  idField: 'id',
  properties: [{ name: 'name', type: 'string' }],
});

describe('pageBasedStrategy', () => {
  it('converts offset/limit to page/pageSize (offset=6, limit=3 -> page=3)', async () => {
    const config = makeConfig();
    const pagination = config.upstream.pagination as {
      type: 'page-pageSize';
      pageParam: string;
      pageSizeParam: string;
    };
    const fetcher: Fetcher = vi.fn().mockResolvedValue({ results: [{ id: 7 }, { id: 8 }, { id: 9 }], count: 30 });
    const params: FetchParams = { offset: 6, limit: 3 };

    const result = await pageBasedStrategy.fetch(config, pagination, params, fetcher);

    const calledUrl = new URL((fetcher as ReturnType<typeof vi.fn>).mock.calls[0][0]);
    expect(calledUrl.searchParams.get('page')).toBe('3');
    expect(calledUrl.searchParams.get('pageSize')).toBe('3');
    expect(result.items).toEqual([{ id: 7 }, { id: 8 }, { id: 9 }]);
    expect(result.total).toBe(30);
  });

  it('uses page 1 when offset is 0', async () => {
    const config = makeConfig();
    const pagination = config.upstream.pagination as {
      type: 'page-pageSize';
      pageParam: string;
      pageSizeParam: string;
    };
    const fetcher: Fetcher = vi.fn().mockResolvedValue({ results: [{ id: 1 }], count: 1 });
    const params: FetchParams = { offset: 0, limit: 10 };

    await pageBasedStrategy.fetch(config, pagination, params, fetcher);

    const calledUrl = new URL((fetcher as ReturnType<typeof vi.fn>).mock.calls[0][0]);
    expect(calledUrl.searchParams.get('page')).toBe('1');
  });
});
