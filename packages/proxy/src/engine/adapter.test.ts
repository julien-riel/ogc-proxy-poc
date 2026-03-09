import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./upstream-rate-limit.js', () => ({
  getUpstreamBucket: vi.fn().mockReturnValue({
    tryConsume: () => true,
  }),
  TokenBucket: class TokenBucket {
    tryConsume() {
      return true;
    }
  },
}));

vi.mock('./circuit-breaker.js', () => ({
  getCircuitBreaker: vi.fn().mockReturnValue(null),
  CircuitState: { Closed: 0, Open: 1, HalfOpen: 2 },
}));

vi.mock('./retry.js', () => ({
  withRetry: vi.fn(async (fn: () => Promise<any>) => fn()),
}));

vi.mock('../metrics.js', () => ({
  upstreamRequestDuration: { observe: vi.fn() },
  upstreamErrorsTotal: { inc: vi.fn() },
  rateLimitRejectionsTotal: { inc: vi.fn() },
  circuitBreakerState: { set: vi.fn() },
  retryAttemptsTotal: { inc: vi.fn() },
  safeMetric: (fn: () => void) => {
    try {
      fn();
    } catch {
      /* ignore */
    }
  },
}));

vi.mock('../logger.js', () => ({
  logger: {
    adapter: () => ({ info: vi.fn(), warning: vi.fn(), error: vi.fn() }),
  },
  initLogging: vi.fn(),
}));

import { fetchUpstreamItems, fetchUpstreamItem } from './adapter.js';
import type { CollectionConfig } from './types.js';

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

describe('Adapter', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('offset/limit pagination', () => {
    it('passes offset and limit to upstream', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          json: () => Promise.resolve({ data: [{ id: 1 }], total: 10 }),
        }),
      );

      const result = await fetchUpstreamItems('test-offset', offsetLimitConfig, { offset: 5, limit: 3 });

      expect(fetch).toHaveBeenCalledWith(expect.stringContaining('offset=5'), expect.any(Object));
      expect(fetch).toHaveBeenCalledWith(expect.stringContaining('limit=3'), expect.any(Object));
      expect(result.items).toEqual([{ id: 1 }]);
      expect(result.total).toBe(10);
    });
  });

  describe('page/pageSize pagination', () => {
    it('converts offset/limit to page/pageSize', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          json: () => Promise.resolve({ results: [{ id: 1 }], count: 8 }),
        }),
      );

      // offset=6, limit=3 → page=3, pageSize=3
      const result = await fetchUpstreamItems('test-page', pageConfig, { offset: 6, limit: 3 });

      expect(fetch).toHaveBeenCalledWith(expect.stringContaining('page=3'), expect.any(Object));
      expect(fetch).toHaveBeenCalledWith(expect.stringContaining('pageSize=3'), expect.any(Object));
      expect(result.items).toEqual([{ id: 1 }]);
      expect(result.total).toBe(8);
    });

    it('page 1 when offset is 0', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          json: () => Promise.resolve({ results: [{ id: 1 }], count: 8 }),
        }),
      );

      await fetchUpstreamItems('test-page', pageConfig, { offset: 0, limit: 5 });
      expect(fetch).toHaveBeenCalledWith(expect.stringContaining('page=1'), expect.any(Object));
    });
  });

  describe('cursor pagination', () => {
    it('fetches first page when offset is 0', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          json: () => Promise.resolve({ items: [{ code: 'A' }, { code: 'B' }], nextCursor: 'B' }),
        }),
      );

      const result = await fetchUpstreamItems('test-cursor', cursorConfig, { offset: 0, limit: 2 });

      // No cursor param on first request
      const calledUrl = (fetch as any).mock.calls[0][0] as string;
      expect(calledUrl).not.toContain('cursor=');
      expect(result.items).toEqual([{ code: 'A' }, { code: 'B' }]);
      expect(result.total).toBeUndefined();
    });

    it('iterates pages to reach offset', async () => {
      const fetchMock = vi
        .fn()
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
      const result = await fetchUpstreamItems('test-cursor', cursorConfig, { offset: 2, limit: 2 });

      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(result.items).toEqual([{ code: 'C' }, { code: 'D' }]);
    });
  });

  describe('single item', () => {
    it('fetches a single item by id', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          json: () => Promise.resolve({ data: { id: 1, name: 'A' } }),
        }),
      );

      const result = await fetchUpstreamItem('test-offset', offsetLimitConfig, '1');
      expect(fetch).toHaveBeenCalledWith('http://mock:3001/api/test/1', expect.any(Object));
      expect(result).toEqual({ id: 1, name: 'A' });
    });
  });

  describe('error handling', () => {
    it('throws on upstream error', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: false,
          status: 500,
          statusText: 'Internal Server Error',
        }),
      );

      await expect(fetchUpstreamItems('test-offset', offsetLimitConfig, { offset: 0, limit: 10 })).rejects.toThrow(
        'Upstream error: 500',
      );
    });
  });

  describe('upstream validation', () => {
    it('returns empty array when items field is not an array', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ data: 'not-an-array', total: 5 }) })),
      );
      const result = await fetchUpstreamItems('test-offset', offsetLimitConfig, { offset: 0, limit: 10 });
      expect(result.items).toEqual([]);
    });

    it('returns undefined total when total is NaN', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ data: [], total: 'bad' }) })),
      );
      const result = await fetchUpstreamItems('test-offset', offsetLimitConfig, { offset: 0, limit: 10 });
      expect(result.total).toBeUndefined();
    });
  });

  describe('timeout', () => {
    it('throws UpstreamTimeoutError on timeout', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn((_url: string, init?: RequestInit) => {
          return new Promise((_resolve, reject) => {
            const onAbort = () => reject(new DOMException('The operation was aborted', 'AbortError'));
            if (init?.signal?.aborted) {
              onAbort();
            } else {
              init?.signal?.addEventListener('abort', onAbort);
            }
          });
        }),
      );
      const configWithTimeout = { ...offsetLimitConfig, timeout: 50 };
      await expect(fetchUpstreamItems('test-offset', configWithTimeout, { offset: 0, limit: 10 })).rejects.toThrow(
        'Upstream timeout',
      );
    });
  });

  describe('cache integration', () => {
    it('returns cached result when available', async () => {
      const cachedData = { items: [{ id: 'cached' }], total: 1 };
      const mockCache = { get: vi.fn().mockResolvedValue(cachedData), set: vi.fn() };
      const configWithCache = { ...offsetLimitConfig, cache: { ttlSeconds: 300 } };
      vi.stubGlobal('fetch', vi.fn());
      const result = await fetchUpstreamItems(
        'test-cache',
        configWithCache,
        { offset: 0, limit: 10 },
        { cache: mockCache as any },
      );
      expect(result).toEqual(cachedData);
      expect(fetch).not.toHaveBeenCalled();
    });

    it('stores result in cache after fetch', async () => {
      const mockCache = { get: vi.fn().mockResolvedValue(null), set: vi.fn() };
      const configWithCache = { ...offsetLimitConfig, cache: { ttlSeconds: 300 } };
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          json: () => Promise.resolve({ data: [{ id: 1 }], total: 1 }),
        }),
      );
      await fetchUpstreamItems('test-cache', configWithCache, { offset: 0, limit: 10 }, { cache: mockCache as any });
      expect(mockCache.set).toHaveBeenCalledWith(
        'test-cache',
        expect.objectContaining({ offset: 0, limit: 10 }),
        expect.objectContaining({ items: [{ id: 1 }] }),
        300,
      );
    });
  });

  describe('rate limiting', () => {
    it('throws 429 when rate limit exceeded', async () => {
      const { getUpstreamBucket } = await import('./upstream-rate-limit.js');
      vi.mocked(getUpstreamBucket).mockReturnValue({ tryConsume: () => false } as any);
      const configWithRate = { ...offsetLimitConfig, rateLimit: { capacity: 10, refillRate: 1 } };
      await expect(fetchUpstreamItems('test-rate', configWithRate, { offset: 0, limit: 10 })).rejects.toThrow(
        'Upstream error: 429',
      );
      vi.mocked(getUpstreamBucket).mockReturnValue({ tryConsume: () => true } as any);
    });
  });

  describe('circuit breaker', () => {
    it('throws 503 when circuit breaker is open', async () => {
      const { getCircuitBreaker } = await import('./circuit-breaker.js');
      vi.mocked(getCircuitBreaker).mockReturnValue({
        canExecute: () => false,
        state: 1,
        recordFailure: vi.fn(),
        recordSuccess: vi.fn(),
      } as any);
      const configWithBreaker = {
        ...offsetLimitConfig,
        circuitBreaker: { failureThreshold: 3, resetTimeoutMs: 5000, halfOpenRequests: 1 },
      };
      await expect(fetchUpstreamItems('test-cb', configWithBreaker, { offset: 0, limit: 10 })).rejects.toThrow(
        'Upstream error: 503',
      );
      vi.mocked(getCircuitBreaker).mockReturnValue(null);
    });
  });

  describe('bbox and extra params', () => {
    it('passes bbox to upstream URL', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          json: () => Promise.resolve({ data: [], total: 0 }),
        }),
      );
      await fetchUpstreamItems('test-bbox', offsetLimitConfig, {
        offset: 0,
        limit: 10,
        bbox: [-74, 45, -73, 46],
      });
      expect(fetch).toHaveBeenCalledWith(expect.stringContaining('bbox='), expect.any(Object));
    });

    it('passes upstream params to URL', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          json: () => Promise.resolve({ data: [], total: 0 }),
        }),
      );
      await fetchUpstreamItems('test-params', offsetLimitConfig, {
        offset: 0,
        limit: 10,
        upstreamParams: { status: 'active' },
      });
      expect(fetch).toHaveBeenCalledWith(expect.stringContaining('status=active'), expect.any(Object));
    });
  });
});
