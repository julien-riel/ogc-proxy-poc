import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ogcFetch } from './ogc-fetch.js';
import type { RequestLogEntry } from '../types/ogc.js';

describe('ogcFetch', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('fetches JSON and returns the parsed body', async () => {
    const mockData = { title: 'Test Server', links: [] };
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockData),
      }),
    );

    const result = await ogcFetch('https://example.com/');
    expect(result).toEqual(mockData);
  });

  it('calls onRequest with log entry including duration', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ data: true }),
      }),
    );

    const onRequest = vi.fn();
    await ogcFetch('https://example.com/test', { onRequest });

    expect(onRequest).toHaveBeenCalledOnce();
    const entry: RequestLogEntry = onRequest.mock.calls[0][0];
    expect(entry.url).toBe('https://example.com/test');
    expect(entry.method).toBe('GET');
    expect(entry.status).toBe(200);
    expect(entry.duration).toBeGreaterThanOrEqual(0);
    expect(entry.responseBody).toEqual({ data: true });
    expect(entry.id).toBeDefined();
  });

  it('throws with a clear message on non-OK response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        json: () => Promise.resolve({}),
      }),
    );

    await expect(ogcFetch('https://example.com/missing')).rejects.toThrow('HTTP 404');
  });

  it('throws with a clear message on network error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));

    await expect(ogcFetch('https://example.com/down')).rejects.toThrow('Failed to fetch');
  });

  it('logs failed requests too', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        json: () => Promise.resolve({ error: 'boom' }),
      }),
    );

    const onRequest = vi.fn();
    await ogcFetch('https://example.com/error', { onRequest }).catch(() => {});

    expect(onRequest).toHaveBeenCalledOnce();
    expect(onRequest.mock.calls[0][0].status).toBe(500);
  });
});
