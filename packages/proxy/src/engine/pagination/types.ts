import type { CollectionConfig } from '../types.js';

export interface FetchParams {
  offset: number;
  limit: number;
  bbox?: [number, number, number, number];
  upstreamParams?: Record<string, string>;
}

export interface UpstreamPage {
  items: Record<string, unknown>[];
  total?: number;
}

export type Fetcher = (url: string, timeoutMs?: number) => Promise<Record<string, unknown>>;

export interface PaginationStrategy<P = unknown> {
  fetch(config: CollectionConfig, pagination: P, params: FetchParams, fetcher: Fetcher): Promise<UpstreamPage>;
}

export function applyExtraParams(url: URL, params: FetchParams): void {
  if (params.bbox) {
    url.searchParams.set('bbox', params.bbox.join(','));
  }
  if (params.upstreamParams) {
    for (const [key, value] of Object.entries(params.upstreamParams)) {
      url.searchParams.set(key, value);
    }
  }
}
