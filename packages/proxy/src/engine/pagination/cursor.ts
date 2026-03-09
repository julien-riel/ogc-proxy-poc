import type { PaginationStrategy, FetchParams, UpstreamPage, Fetcher } from './types.js';
import type { CollectionConfig, CursorPagination } from '../types.js';
import { extractItems } from '../fetch-service.js';
import { getByPath } from '../geojson-builder.js';
import { applyExtraParams } from './types.js';

export const cursorStrategy: PaginationStrategy<CursorPagination> = {
  async fetch(
    config: CollectionConfig,
    pagination: CursorPagination,
    params: FetchParams,
    fetcher: Fetcher,
  ): Promise<UpstreamPage> {
    let cursor: string | undefined;
    const collected: Record<string, unknown>[] = [];

    while (collected.length < params.offset + params.limit) {
      const url = new URL(config.upstream.baseUrl);
      url.searchParams.set(pagination.limitParam, String(params.limit));
      if (cursor) {
        url.searchParams.set(pagination.cursorParam, cursor);
      }
      applyExtraParams(url, params);

      const body = await fetcher(url.toString(), config.timeout);
      const items = extractItems(body, config);
      collected.push(...items);

      const nextCursor = getByPath(body, pagination.nextCursorField) as string | null;
      if (!nextCursor || items.length === 0) break;
      cursor = nextCursor;
    }

    return {
      items: collected.slice(params.offset, params.offset + params.limit),
      total: undefined,
    };
  },
};
