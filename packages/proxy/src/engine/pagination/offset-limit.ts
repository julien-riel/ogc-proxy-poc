import type { PaginationStrategy, FetchParams, UpstreamPage, Fetcher } from './types.js';
import type { CollectionConfig, OffsetLimitPagination } from '../types.js';
import { extractItems, extractTotal } from '../fetch-service.js';
import { applyExtraParams } from './types.js';

export const offsetLimitStrategy: PaginationStrategy<OffsetLimitPagination> = {
  async fetch(
    config: CollectionConfig,
    pagination: OffsetLimitPagination,
    params: FetchParams,
    fetcher: Fetcher,
  ): Promise<UpstreamPage> {
    const url = new URL(config.upstream.baseUrl);
    url.searchParams.set(pagination.offsetParam, String(params.offset));
    url.searchParams.set(pagination.limitParam, String(params.limit));
    applyExtraParams(url, params);
    const body = await fetcher(url.toString(), config.timeout);
    return { items: extractItems(body, config), total: extractTotal(body, config) };
  },
};
