import type { CollectionConfig } from '../types.js';
import type { FetchParams, UpstreamPage, Fetcher } from './types.js';
import { offsetLimitStrategy } from './offset-limit.js';
import { pageBasedStrategy } from './page-based.js';
import { cursorStrategy } from './cursor.js';
import { wfsStrategy } from './wfs.js';

export type { FetchParams, UpstreamPage, Fetcher } from './types.js';
export { applyExtraParams } from './types.js';

export function fetchWithStrategy(
  config: CollectionConfig,
  params: FetchParams,
  fetcher: Fetcher,
): Promise<UpstreamPage> {
  if (config.upstream.type === 'wfs') {
    return wfsStrategy.fetch(
      config,
      { typeName: config.upstream.typeName!, version: config.upstream.version ?? '1.1.0' },
      params,
      fetcher,
    );
  }
  const p = config.upstream.pagination;
  switch (p.type) {
    case 'offset-limit':
      return offsetLimitStrategy.fetch(config, p, params, fetcher);
    case 'page-pageSize':
      return pageBasedStrategy.fetch(config, p, params, fetcher);
    case 'cursor':
      return cursorStrategy.fetch(config, p, params, fetcher);
  }
}
