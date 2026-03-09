import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../logger.js', () => ({
  logger: {
    adapter: () => ({ info: vi.fn(), warning: vi.fn(), error: vi.fn() }),
  },
  initLogging: vi.fn(),
}));

import {
  UpstreamError,
  UpstreamTimeoutError,
  redactUrl,
  fetchJson,
  extractItems,
  extractTotal,
  DEFAULT_TIMEOUT_MS,
} from './fetch-service.js';
import type { CollectionConfig } from './types.js';

const makeConfig = (overrides?: Partial<CollectionConfig['upstream']['responseMapping']>): CollectionConfig => ({
  title: 'Test',
  upstream: {
    baseUrl: 'http://mock:3001/api/test',
    method: 'GET',
    pagination: { type: 'offset-limit', offsetParam: 'offset', limitParam: 'limit' },
    responseMapping: { items: 'data', total: 'total', item: 'data', ...overrides },
  },
  geometry: { type: 'Point', xField: 'x', yField: 'y' },
  idField: 'id',
  properties: [{ name: 'name', type: 'string' }],
});

describe('fetch-service', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('DEFAULT_TIMEOUT_MS', () => {
    it('should be 15000', () => {
      expect(DEFAULT_TIMEOUT_MS).toBe(15_000);
    });
  });

  describe('redactUrl', () => {
    it('strips query params from a valid URL', () => {
      expect(redactUrl('http://example.com/path?secret=123&key=abc')).toBe('http://example.com/path');
    });

    it('returns the original string for an invalid URL', () => {
      expect(redactUrl('not-a-url')).toBe('not-a-url');
    });
  });

  describe('fetchJson', () => {
    it('returns parsed JSON on success', async () => {
      const mockResponse = { ok: true, status: 200, json: () => Promise.resolve({ result: 42 }) };
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse));

      const body = await fetchJson('http://example.com/api');
      expect(body).toEqual({ result: 42 });
      expect(fetch).toHaveBeenCalledOnce();
    });

    it('throws UpstreamError on non-ok response', async () => {
      const mockResponse = { ok: false, status: 502, json: () => Promise.resolve({}) };
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse));

      await expect(fetchJson('http://example.com/api')).rejects.toThrow(UpstreamError);
      await expect(fetchJson('http://example.com/api')).rejects.toMatchObject({ statusCode: 502 });
    });

    it('throws UpstreamTimeoutError on abort', async () => {
      const abortError = new DOMException('The operation was aborted', 'AbortError');
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(abortError));

      await expect(fetchJson('http://example.com/api', 5000)).rejects.toThrow(UpstreamTimeoutError);
      await expect(fetchJson('http://example.com/api', 5000)).rejects.toMatchObject({ timeoutMs: 5000 });
    });

    it('re-throws unknown errors', async () => {
      const networkErr = new Error('ECONNREFUSED');
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(networkErr));

      await expect(fetchJson('http://example.com/api')).rejects.toThrow('ECONNREFUSED');
    });
  });

  describe('extractItems', () => {
    it('extracts items array from body using config path', () => {
      const config = makeConfig();
      const body = { data: [{ id: 1 }, { id: 2 }] };
      expect(extractItems(body, config)).toEqual([{ id: 1 }, { id: 2 }]);
    });

    it('returns empty array when field is not an array', () => {
      const config = makeConfig();
      const body = { data: 'not-an-array' };
      expect(extractItems(body, config)).toEqual([]);
    });

    it('returns empty array when field is missing', () => {
      const config = makeConfig();
      const body = { other: 123 };
      expect(extractItems(body, config)).toEqual([]);
    });
  });

  describe('extractTotal', () => {
    it('extracts total number from body using config path', () => {
      const config = makeConfig();
      const body = { total: 100 };
      expect(extractTotal(body, config)).toBe(100);
    });

    it('returns undefined when value is NaN', () => {
      const config = makeConfig();
      const body = { total: NaN };
      expect(extractTotal(body, config)).toBeUndefined();
    });

    it('returns undefined when value is a string', () => {
      const config = makeConfig();
      const body = { total: 'not-a-number' };
      expect(extractTotal(body, config)).toBeUndefined();
    });

    it('returns undefined when config total path is null/undefined', () => {
      const config = makeConfig({ total: undefined });
      const body = { total: 100 };
      expect(extractTotal(body, config)).toBeUndefined();
    });
  });
});
