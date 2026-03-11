import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useOGCClient } from './useOGCClient.js';

vi.mock('./ogc-fetch.js', () => ({
  ogcFetch: vi.fn(),
}));

import { ogcFetch } from './ogc-fetch.js';
const mockOgcFetch = vi.mocked(ogcFetch);

const LANDING = { title: 'Test', links: [{ href: '/conformance', rel: 'conformance' }] };
const CONFORMANCE = { conformsTo: ['http://www.opengis.net/spec/ogcapi-features-1/1.0/conf/core'] };
const COLLECTIONS = {
  collections: [
    { id: 'buildings', title: 'Buildings', links: [] },
    { id: 'roads', title: 'Roads', links: [] },
  ],
  links: [],
};

describe('useOGCClient', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('starts in disconnected state', () => {
    const { result } = renderHook(() => useOGCClient());
    expect(result.current.serverUrl).toBeNull();
    expect(result.current.landing).toBeNull();
    expect(result.current.conformance).toBeNull();
    expect(result.current.collections).toEqual([]);
    expect(result.current.isConnecting).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('connects to a server: fetches landing, conformance, collections', async () => {
    mockOgcFetch.mockResolvedValueOnce(LANDING).mockResolvedValueOnce(CONFORMANCE).mockResolvedValueOnce(COLLECTIONS);

    const { result } = renderHook(() => useOGCClient());

    await act(async () => {
      await result.current.connect('https://example.com/ogc');
    });

    expect(result.current.serverUrl).toBe('https://example.com/ogc');
    expect(result.current.landing).toEqual(LANDING);
    expect(result.current.conformance).toEqual(CONFORMANCE);
    expect(result.current.collections).toEqual(COLLECTIONS.collections);
    expect(result.current.isConnecting).toBe(false);
    expect(result.current.error).toBeNull();

    expect(mockOgcFetch).toHaveBeenCalledTimes(3);
    expect(mockOgcFetch.mock.calls[0][0]).toBe('https://example.com/ogc/');
    expect(mockOgcFetch.mock.calls[1][0]).toBe('https://example.com/ogc/conformance');
    expect(mockOgcFetch.mock.calls[2][0]).toBe('https://example.com/ogc/collections');
  });

  it('strips trailing slash from server URL', async () => {
    mockOgcFetch.mockResolvedValueOnce(LANDING).mockResolvedValueOnce(CONFORMANCE).mockResolvedValueOnce(COLLECTIONS);

    const { result } = renderHook(() => useOGCClient());

    await act(async () => {
      await result.current.connect('https://example.com/ogc/');
    });

    expect(mockOgcFetch.mock.calls[0][0]).toBe('https://example.com/ogc/');
  });

  it('sets error on connection failure', async () => {
    mockOgcFetch.mockRejectedValueOnce(new Error('Failed to fetch'));

    const { result } = renderHook(() => useOGCClient());

    await act(async () => {
      await result.current.connect('https://bad.com');
    });

    expect(result.current.error).toBe('Failed to fetch');
    expect(result.current.isConnecting).toBe(false);
    expect(result.current.serverUrl).toBeNull();
  });

  it('disconnects and resets state', async () => {
    mockOgcFetch.mockResolvedValueOnce(LANDING).mockResolvedValueOnce(CONFORMANCE).mockResolvedValueOnce(COLLECTIONS);

    const { result } = renderHook(() => useOGCClient());

    await act(async () => {
      await result.current.connect('https://example.com/ogc');
    });

    act(() => {
      result.current.disconnect();
    });

    expect(result.current.serverUrl).toBeNull();
    expect(result.current.landing).toBeNull();
    expect(result.current.collections).toEqual([]);
  });

  it('fetchItems calls ogcFetch with correct URL and limit', async () => {
    mockOgcFetch.mockResolvedValueOnce(LANDING).mockResolvedValueOnce(CONFORMANCE).mockResolvedValueOnce(COLLECTIONS);

    const { result } = renderHook(() => useOGCClient());

    await act(async () => {
      await result.current.connect('https://example.com/ogc');
    });

    const itemsResponse = {
      type: 'FeatureCollection',
      features: [],
      numberMatched: 0,
      links: [],
    };
    mockOgcFetch.mockResolvedValueOnce(itemsResponse);

    let items;
    await act(async () => {
      items = await result.current.fetchItems('buildings', 50);
    });

    expect(items).toEqual(itemsResponse);
    expect(mockOgcFetch.mock.calls[3][0]).toBe('https://example.com/ogc/collections/buildings/items?limit=50&f=json');
  });

  it('fetchNextPage calls ogcFetch with the next link URL', async () => {
    mockOgcFetch.mockResolvedValueOnce(LANDING).mockResolvedValueOnce(CONFORMANCE).mockResolvedValueOnce(COLLECTIONS);

    const { result } = renderHook(() => useOGCClient());

    await act(async () => {
      await result.current.connect('https://example.com/ogc');
    });

    const nextResponse = { type: 'FeatureCollection', features: [], links: [] };
    mockOgcFetch.mockResolvedValueOnce(nextResponse);

    await act(async () => {
      await result.current.fetchNextPage('https://example.com/ogc/collections/buildings/items?offset=100');
    });

    expect(mockOgcFetch.mock.calls[3][0]).toBe('https://example.com/ogc/collections/buildings/items?offset=100');
  });

  it('passes onRequest callback to ogcFetch', async () => {
    mockOgcFetch.mockResolvedValueOnce(LANDING).mockResolvedValueOnce(CONFORMANCE).mockResolvedValueOnce(COLLECTIONS);

    const onRequest = vi.fn();
    const { result } = renderHook(() => useOGCClient({ onRequest }));

    await act(async () => {
      await result.current.connect('https://example.com/ogc');
    });

    // All 3 calls should have received an options object with onRequest
    for (const call of mockOgcFetch.mock.calls) {
      expect(call[1]).toHaveProperty('onRequest', onRequest);
    }
  });
});
