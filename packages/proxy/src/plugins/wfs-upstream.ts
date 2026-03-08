import type { CollectionPlugin, OgcRequest } from '../engine/plugin.js';

interface WfsGetFeatureOptions {
  startIndex: number;
  count: number;
  version: string;
  sortBy?: string;
  cqlFilter?: string;
  bbox?: [number, number, number, number];
}

export function buildWfsGetFeatureUrl(baseUrl: string, typeName: string, options: WfsGetFeatureOptions): string {
  const url = new URL(baseUrl);
  url.searchParams.set('service', 'WFS');
  url.searchParams.set('version', options.version);
  url.searchParams.set('request', 'GetFeature');
  url.searchParams.set('typeName', typeName);
  url.searchParams.set('outputFormat', 'application/json');
  url.searchParams.set('startIndex', String(options.startIndex));
  url.searchParams.set('maxFeatures', String(options.count));

  if (options.sortBy) {
    url.searchParams.set('sortBy', options.sortBy);
  }

  if (options.cqlFilter) {
    url.searchParams.set('CQL_FILTER', options.cqlFilter);
  }

  if (options.bbox) {
    url.searchParams.set('BBOX', options.bbox.join(','));
  }

  return url.toString();
}

export const wfsUpstreamPlugin: CollectionPlugin = {
  skipGeojsonBuilder: true,

  async transformRequest(req: OgcRequest): Promise<OgcRequest> {
    return req;
  },

  async transformUpstreamResponse(raw: unknown): Promise<unknown> {
    const response = raw as Record<string, unknown>;
    if (Array.isArray(response)) return response;
    if (response.features && Array.isArray(response.features)) {
      return response.features;
    }
    return raw;
  },
};

export default wfsUpstreamPlugin;
