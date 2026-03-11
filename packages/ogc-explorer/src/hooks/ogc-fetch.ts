import type { RequestLogEntry } from '../types/ogc.js';

let counter = 0;

interface OgcFetchOptions {
  onRequest?: (entry: RequestLogEntry) => void;
}

/**
 * Fetches a URL, parses JSON, measures timing, and logs the request.
 * Throws on non-OK responses with a clear error message.
 */
export async function ogcFetch<T = unknown>(url: string, options?: OgcFetchOptions): Promise<T> {
  const start = performance.now();
  let status = 0;
  let responseBody: unknown;

  try {
    const response = await fetch(url, {
      headers: { Accept: 'application/json' },
    });
    status = response.status;
    responseBody = await response.json();

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return responseBody as T;
  } catch (error) {
    if (status === 0 && error instanceof TypeError) {
      options?.onRequest?.({
        id: String(++counter),
        url,
        method: 'GET',
        status: 0,
        duration: Math.round(performance.now() - start),
        timestamp: new Date(),
      });
      throw error;
    }
    throw error;
  } finally {
    if (status !== 0) {
      options?.onRequest?.({
        id: String(++counter),
        url,
        method: 'GET',
        status,
        duration: Math.round(performance.now() - start),
        timestamp: new Date(),
        responseBody,
      });
    }
  }
}
