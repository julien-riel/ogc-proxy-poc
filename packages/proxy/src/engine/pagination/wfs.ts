import type { PaginationStrategy, FetchParams, UpstreamPage, Fetcher } from './types.js';
import type { CollectionConfig } from '../types.js';
import { buildWfsGetFeatureUrl } from '../../plugins/wfs-upstream.js';

export interface WfsPaginationParams {
  typeName: string;
  version: string;
}

export const wfsStrategy: PaginationStrategy<WfsPaginationParams> = {
  async fetch(
    config: CollectionConfig,
    pagination: WfsPaginationParams,
    params: FetchParams,
    fetcher: Fetcher,
  ): Promise<UpstreamPage> {
    const url = buildWfsGetFeatureUrl(config.upstream.baseUrl, pagination.typeName, {
      startIndex: params.offset,
      count: params.limit,
      version: pagination.version,
      bbox: params.bbox,
    });

    const body = await fetcher(url, config.timeout);
    const features = (body.features ?? []) as Record<string, unknown>[];
    const total = body.totalFeatures as number | undefined;

    return { items: features, total };
  },
};
