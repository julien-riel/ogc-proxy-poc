import type { PaginationStrategy, FetchParams, UpstreamPage, Fetcher } from './types.js';
import type { CollectionConfig, PagePagination } from '../types.js';
import { extractItems, extractTotal } from '../fetch-service.js';
import { applyExtraParams } from './types.js';

export const pageBasedStrategy: PaginationStrategy<PagePagination> = {
  async fetch(
    config: CollectionConfig,
    pagination: PagePagination,
    params: FetchParams,
    fetcher: Fetcher,
  ): Promise<UpstreamPage> {
    const page = Math.floor(params.offset / params.limit) + 1;
    const url = new URL(config.upstream.baseUrl);
    url.searchParams.set(pagination.pageParam, String(page));
    url.searchParams.set(pagination.pageSizeParam, String(params.limit));
    applyExtraParams(url, params);
    const body = await fetcher(url.toString(), config.timeout);
    return { items: extractItems(body, config), total: extractTotal(body, config) };
  },
};
