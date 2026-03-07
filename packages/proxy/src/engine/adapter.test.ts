import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchUpstreamItems, fetchUpstreamItem } from './adapter.js';
import type { CollectionConfig } from './types.js';
import { initLogging } from '../logger.js';

const offsetLimitConfig: CollectionConfig = {
  title: 'Test Offset/Limit',
  upstream: {
    baseUrl: 'http://mock:3001/api/test',
    method: 'GET',
    pagination: { type: 'offset-limit', offsetParam: 'offset', limitParam: 'limit' },
    responseMapping: { items: 'data', total: 'total', item: 'data' },
  },
  geometry: { type: 'Point', xField: 'x', yField: 'y' },
  idField: 'id',
  properties: [{ name: 'name', type: 'string' }],
};

const pageConfig: CollectionConfig = {
  title: 'Test Page/PageSize',
  upstream: {
    baseUrl: 'http://mock:3001/api/pistes',
    method: 'GET',
    pagination: { type: 'page-pageSize', pageParam: 'page', pageSizeParam: 'pageSize' },
    responseMapping: { items: 'results', total: 'count', item: 'result' },
  },
  geometry: { type: 'LineString', coordsField: 'geometry.coords' },
  idField: 'id',
  properties: [{ name: 'nom', type: 'string' }],
};

const cursorConfig: CollectionConfig = {
  title: 'Test Cursor',
  upstream: {
    baseUrl: 'http://mock:3001/api/arr',
    method: 'GET',
    pagination: { type: 'cursor', cursorParam: 'cursor', limitParam: 'limit', nextCursorField: 'nextCursor' },
    responseMapping: { items: 'items', total: null, item: 'item' },
  },
  geometry: { type: 'Polygon', wktField: 'wkt' },
  idField: 'code',
  properties: [{ name: 'nom', type: 'string' }],
};

initLogging();

describe('Adapter', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('offset/limit pagination', () => {
    it('passes offset and limit to upstream', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ data: [{ id: 1 }], total: 10 }),
      }));

      const result = await fetchUpstreamItems(offsetLimitConfig, { offset: 5, limit: 3 });

      expect(fetch).toHaveBeenCalledWith(expect.stringContaining('offset=5'));
      expect(fetch).toHaveBeenCalledWith(expect.stringContaining('limit=3'));
      expect(result.items).toEqual([{ id: 1 }]);
      expect(result.total).toBe(10);
    });
  });

  describe('page/pageSize pagination', () => {
    it('converts offset/limit to page/pageSize', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ results: [{ id: 1 }], count: 8 }),
      }));

      // offset=6, limit=3 → page=3, pageSize=3
      const result = await fetchUpstreamItems(pageConfig, { offset: 6, limit: 3 });

      expect(fetch).toHaveBeenCalledWith(expect.stringContaining('page=3'));
      expect(fetch).toHaveBeenCalledWith(expect.stringContaining('pageSize=3'));
      expect(result.items).toEqual([{ id: 1 }]);
      expect(result.total).toBe(8);
    });

    it('page 1 when offset is 0', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ results: [{ id: 1 }], count: 8 }),
      }));

      await fetchUpstreamItems(pageConfig, { offset: 0, limit: 5 });
      expect(fetch).toHaveBeenCalledWith(expect.stringContaining('page=1'));
    });
  });

  describe('cursor pagination', () => {
    it('fetches first page when offset is 0', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ items: [{ code: 'A' }, { code: 'B' }], nextCursor: 'B' }),
      }));

      const result = await fetchUpstreamItems(cursorConfig, { offset: 0, limit: 2 });

      // No cursor param on first request
      const calledUrl = (fetch as any).mock.calls[0][0] as string;
      expect(calledUrl).not.toContain('cursor=');
      expect(result.items).toEqual([{ code: 'A' }, { code: 'B' }]);
      expect(result.total).toBeUndefined();
    });

    it('iterates pages to reach offset', async () => {
      const fetchMock = vi.fn()
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ items: [{ code: 'A' }, { code: 'B' }], nextCursor: 'B' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ items: [{ code: 'C' }, { code: 'D' }], nextCursor: 'D' }),
        });
      vi.stubGlobal('fetch', fetchMock);

      // offset=2, limit=2 → skip first 2 items, return next 2
      const result = await fetchUpstreamItems(cursorConfig, { offset: 2, limit: 2 });

      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(result.items).toEqual([{ code: 'C' }, { code: 'D' }]);
    });
  });

  describe('single item', () => {
    it('fetches a single item by id', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ data: { id: 1, name: 'A' } }),
      }));

      const result = await fetchUpstreamItem(offsetLimitConfig, '1');
      expect(fetch).toHaveBeenCalledWith('http://mock:3001/api/test/1');
      expect(result).toEqual({ id: 1, name: 'A' });
    });
  });

  describe('error handling', () => {
    it('throws on upstream error', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: false, status: 500, statusText: 'Internal Server Error',
      }));

      await expect(fetchUpstreamItems(offsetLimitConfig, { offset: 0, limit: 10 }))
        .rejects.toThrow('Upstream error: 500');
    });
  });
});
