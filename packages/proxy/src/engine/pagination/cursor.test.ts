import { describe, it, expect, vi } from 'vitest';

vi.mock('../../logger.js', () => ({
  logger: {
    adapter: () => ({ info: vi.fn(), warning: vi.fn(), error: vi.fn() }),
  },
  initLogging: vi.fn(),
}));

import { cursorStrategy } from './cursor.js';
import type { CollectionConfig, CursorPagination } from '../types.js';
import type { FetchParams, Fetcher } from './types.js';

const makeConfig = (): CollectionConfig => ({
  title: 'Test',
  upstream: {
    baseUrl: 'http://upstream.example.com/api/data',
    method: 'GET',
    pagination: { type: 'cursor', cursorParam: 'cursor', limitParam: 'limit', nextCursorField: 'meta.next' },
    responseMapping: { items: 'data', total: null, item: 'data' },
  },
  geometry: { type: 'Point', xField: 'x', yField: 'y' },
  idField: 'id',
  properties: [{ name: 'name', type: 'string' }],
});

const getPagination = (config: CollectionConfig): CursorPagination => config.upstream.pagination as CursorPagination;

describe('cursorStrategy', () => {
  it('fetches first page when offset is 0 (no cursor param in URL)', async () => {
    const config = makeConfig();
    const fetcher: Fetcher = vi.fn().mockResolvedValue({
      data: [{ id: 1 }, { id: 2 }],
      meta: { next: null },
    });
    const params: FetchParams = { offset: 0, limit: 2 };

    const result = await cursorStrategy.fetch(config, getPagination(config), params, fetcher);

    expect(fetcher).toHaveBeenCalledOnce();
    const calledUrl = new URL((fetcher as ReturnType<typeof vi.fn>).mock.calls[0][0]);
    expect(calledUrl.searchParams.has('cursor')).toBe(false);
    expect(calledUrl.searchParams.get('limit')).toBe('2');
    expect(result.items).toEqual([{ id: 1 }, { id: 2 }]);
    expect(result.total).toBeUndefined();
  });

  it('iterates pages to reach offset (2 fetches)', async () => {
    const config = makeConfig();
    const fetcher: Fetcher = vi
      .fn()
      .mockResolvedValueOnce({ data: [{ id: 1 }, { id: 2 }], meta: { next: 'abc123' } })
      .mockResolvedValueOnce({ data: [{ id: 3 }, { id: 4 }], meta: { next: null } });
    const params: FetchParams = { offset: 2, limit: 2 };

    const result = await cursorStrategy.fetch(config, getPagination(config), params, fetcher);

    expect(fetcher).toHaveBeenCalledTimes(2);
    const secondUrl = new URL((fetcher as ReturnType<typeof vi.fn>).mock.calls[1][0]);
    expect(secondUrl.searchParams.get('cursor')).toBe('abc123');
    expect(result.items).toEqual([{ id: 3 }, { id: 4 }]);
  });

  it('stops when no nextCursor returned', async () => {
    const config = makeConfig();
    const fetcher: Fetcher = vi.fn().mockResolvedValue({
      data: [{ id: 1 }],
      meta: { next: null },
    });
    const params: FetchParams = { offset: 0, limit: 10 };

    const result = await cursorStrategy.fetch(config, getPagination(config), params, fetcher);

    expect(fetcher).toHaveBeenCalledOnce();
    expect(result.items).toEqual([{ id: 1 }]);
  });

  it('stops when empty items returned', async () => {
    const config = makeConfig();
    const fetcher: Fetcher = vi
      .fn()
      .mockResolvedValueOnce({ data: [{ id: 1 }], meta: { next: 'abc' } })
      .mockResolvedValueOnce({ data: [], meta: { next: 'def' } });
    const params: FetchParams = { offset: 0, limit: 10 };

    const result = await cursorStrategy.fetch(config, getPagination(config), params, fetcher);

    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(result.items).toEqual([{ id: 1 }]);
  });
});
