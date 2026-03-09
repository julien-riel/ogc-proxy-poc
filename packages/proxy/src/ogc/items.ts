import type { Request, Response } from 'express';
import type { Redis } from 'ioredis';
import { getCollection, getCollectionPlugin } from '../engine/registry.js';
import { getRegistry } from '../engine/registry.js';
import { fetchUpstreamItems, fetchUpstreamItem, UpstreamError, UpstreamTimeoutError } from '../engine/adapter.js';
import { buildFeatureCollection, buildFeature, buildFeatureSafe } from '../engine/geojson-builder.js';
import { applyLimits } from '../engine/limits.js';
import type { LimitsResult } from '../engine/limits.js';
import { parseCql2, evaluateFilter, extractBboxFromAst } from '../engine/cql2/index.js';
import { runHook } from '../engine/plugin.js';
import type { CqlNode } from '../engine/cql2/types.js';
import type { PropertyConfig } from '../engine/types.js';
import { parseSortby, validateSortable, buildUpstreamSort } from '../engine/sorting.js';
import { getBaseUrl } from '../utils/base-url.js';
import type { CacheService } from '../engine/cache.js';
import { logger } from '../logger.js';
import { collectionRequestsTotal, featuresReturned, safeMetric } from '../metrics.js';

export function parseBbox(bboxStr: string): [number, number, number, number] | undefined {
  const parts = bboxStr.split(',').map(Number);
  if (parts.length === 4 && parts.every((n) => !isNaN(n))) {
    return parts as [number, number, number, number];
  }
  return undefined;
}

export function isInBbox(feature: GeoJSON.Feature, bbox: [number, number, number, number]): boolean {
  const [minLon, minLat, maxLon, maxLat] = bbox;
  const geom = feature.geometry;
  if (!geom) return false;

  const coords: number[][] = [];
  if (geom.type === 'Point') {
    coords.push(geom.coordinates as number[]);
  } else if (geom.type === 'LineString') {
    coords.push(...(geom.coordinates as number[][]));
  } else if (geom.type === 'Polygon') {
    coords.push(...(geom.coordinates as number[][][])[0]);
  }

  return coords.some(([lon, lat]) => lon >= minLon && lon <= maxLon && lat >= minLat && lat <= maxLat);
}

/**
 * Build upstream query params from simple query string filters.
 * Only passes through properties that are filterable with upstream mapping.
 */
export function buildUpstreamFilters(
  queryParams: Record<string, string>,
  properties: PropertyConfig[],
): Record<string, string> {
  const params: Record<string, string> = {};
  for (const prop of properties) {
    if (!prop.filterable || !prop.upstream?.param) continue;
    const value = queryParams[prop.name];
    if (value !== undefined) {
      params[prop.upstream.param] = value;
    }
  }
  return params;
}

/**
 * Build simple query string filters as CQL2 AST for post-fetch evaluation.
 * Only includes properties that are NOT passed through to upstream.
 */
export function buildPostFetchSimpleFilters(
  queryParams: Record<string, string>,
  properties: PropertyConfig[],
): CqlNode | null {
  const nodes: CqlNode[] = [];
  for (const prop of properties) {
    if (!prop.filterable) continue;
    const value = queryParams[prop.name];
    if (value === undefined) continue;
    // Skip if already passed to upstream
    if (prop.upstream?.param && prop.upstream.operators?.includes('=')) continue;
    nodes.push({
      type: 'comparison',
      property: prop.name,
      operator: '=',
      value: isNaN(Number(value)) ? value : Number(value),
    });
  }
  if (nodes.length === 0) return null;
  return nodes.reduce((acc, node) => ({
    type: 'logical' as const,
    operator: 'AND' as const,
    left: acc,
    right: node,
  }));
}

interface ParsedItemsRequest {
  limit: number;
  offset: number;
  bbox?: [number, number, number, number];
  cqlAst: CqlNode | null;
  filterStr?: string;
  filterLang?: string;
  sortbyStr?: string;
  upstreamParams: Record<string, string>;
  postFetchSimpleAst: CqlNode | null;
  queryParams: Record<string, string>;
  limits: LimitsResult;
}

interface ParseError {
  error: { status: number; body: Record<string, string> };
}

/**
 * Parse and validate all request parameters for getItems.
 * Returns either a parsed request object or an error.
 */
function parseItemsRequest(
  req: Request,
  config: ReturnType<typeof getCollection> & object,
): ParsedItemsRequest | ParseError {
  const registry = getRegistry();
  const defaults = registry.defaults ?? {};

  // Apply limits
  const rawLimit = parseInt(req.query.limit as string) || 10;
  const rawOffset = parseInt(req.query.offset as string) || 0;
  const limits = applyLimits({ limit: rawLimit, offset: rawOffset }, config, defaults);

  if (limits.rejected) {
    return {
      error: {
        status: 400,
        body: {
          code: 'LimitExceeded',
          description: `Offset ${rawOffset} exceeds maxFeatures (${limits.maxFeatures})`,
        },
      },
    };
  }

  const limit = limits.limit;
  const offset = limits.offset;

  // Parse bbox
  const bboxStr = req.query.bbox as string | undefined;
  let bbox = bboxStr ? parseBbox(bboxStr) : undefined;

  // Parse CQL2 filter
  const filterStr = req.query.filter as string | undefined;
  const filterLang = req.query['filter-lang'] as string | undefined;
  if (filterStr && filterLang && filterLang !== 'cql2-text') {
    return {
      error: {
        status: 400,
        body: {
          code: 'InvalidFilterLang',
          description: `Unsupported filter language: '${filterLang}'. Only 'cql2-text' is supported.`,
        },
      },
    };
  }

  const MAX_FILTER_LENGTH = 4096;
  if (filterStr && filterStr.length > MAX_FILTER_LENGTH) {
    return {
      error: {
        status: 400,
        body: {
          code: 'InvalidFilter',
          description: `Filter exceeds maximum length of ${MAX_FILTER_LENGTH} characters`,
        },
      },
    };
  }

  let cqlAst: CqlNode | null = null;
  if (filterStr) {
    try {
      cqlAst = parseCql2(filterStr);
      // Extract bbox from spatial predicates for upstream optimization
      if (!bbox) {
        bbox = extractBboxFromAst(cqlAst) ?? undefined;
      }
    } catch (err) {
      return {
        error: {
          status: 400,
          body: {
            code: 'InvalidFilter',
            description: err instanceof Error ? err.message : 'Invalid CQL2 filter',
          },
        },
      };
    }
  }

  // Build upstream params from simple query string filters
  const queryParams: Record<string, string> = {};
  for (const [key, val] of Object.entries(req.query)) {
    if (typeof val === 'string') queryParams[key] = val;
  }
  const upstreamParams = buildUpstreamFilters(queryParams, config.properties);

  // Build post-fetch filter for simple params not passed to upstream
  const postFetchSimpleAst = buildPostFetchSimpleFilters(queryParams, config.properties);

  // Sorting
  const sortbyStr = req.query.sortby as string | undefined;
  if (sortbyStr) {
    const sortFields = parseSortby(sortbyStr);
    const sortError = validateSortable(sortFields, config.properties);
    if (sortError) {
      return {
        error: {
          status: 400,
          body: { code: 'InvalidSortby', description: sortError },
        },
      };
    }
    const sortParams = buildUpstreamSort(sortFields, config.properties);
    Object.assign(upstreamParams, sortParams);
  }

  return {
    limit,
    offset,
    bbox,
    cqlAst,
    filterStr,
    filterLang,
    sortbyStr,
    upstreamParams,
    postFetchSimpleAst,
    queryParams,
    limits,
  };
}

/**
 * Apply post-fetch filters: bbox, CQL2, and simple query param filters.
 */
export function applyPostFilters(
  features: GeoJSON.Feature[],
  bbox: [number, number, number, number] | undefined,
  cqlAst: CqlNode | null,
  postFetchSimpleAst: CqlNode | null,
  isWfs: boolean,
): GeoJSON.Feature[] {
  let result = features;
  if (bbox && !isWfs) {
    result = result.filter((f) => isInBbox(f, bbox));
  }
  if (cqlAst) {
    result = result.filter((f) => evaluateFilter(cqlAst, f));
  }
  if (postFetchSimpleAst) {
    result = result.filter((f) => evaluateFilter(postFetchSimpleAst, f));
  }
  return result;
}

/**
 * Type guard to check if a parse result is an error.
 */
function isParseError(result: ParsedItemsRequest | ParseError): result is ParseError {
  return 'error' in result;
}

export async function getItems(req: Request, res: Response) {
  const collectionId = req.params.collectionId as string;
  const config = getCollection(collectionId);

  if (!config) {
    return res.status(404).json({ code: 'NotFound', description: `Collection '${collectionId}' not found` });
  }

  safeMetric(() => collectionRequestsTotal.inc({ collection: collectionId, protocol: 'ogc', operation: 'getItems' }));

  const parsed = parseItemsRequest(req, config);
  if (isParseError(parsed)) {
    return res.status(parsed.error.status).json(parsed.error.body);
  }

  const { limit, offset, bbox, cqlAst, filterStr, upstreamParams, postFetchSimpleAst, queryParams, limits } = parsed;

  // Cap post-fetch multiplier
  const registry = getRegistry();
  const DEFAULT_MAX_POST_FETCH_ITEMS = 5000;
  const maxPostFetch = config.maxPostFetchItems ?? registry.defaults?.maxPostFetchItems ?? DEFAULT_MAX_POST_FETCH_ITEMS;
  const needsPostFetch = !!(cqlAst || postFetchSimpleAst);
  const fetchLimit = needsPostFetch ? Math.min(limit * 10, maxPostFetch) : limit;

  // Load plugin
  const plugin = await getCollectionPlugin(collectionId);

  try {
    // Hook: transformRequest
    let ogcReq = {
      collectionId,
      limit,
      offset,
      bbox,
      filter: filterStr,
      filterLang: req.query['filter-lang'] as string,
      sortby: req.query.sortby as string,
      queryParams,
    };
    ogcReq = await runHook(plugin, 'transformRequest', ogcReq);

    // Fetch upstream
    const redis = req.app.get('redis') as Redis | null;
    const keyPrefix = req.app.get('redisKeyPrefix') as string | undefined;
    const cache = req.app.get('cache') as CacheService | null;
    const upstream = await fetchUpstreamItems(
      collectionId,
      config,
      {
        offset: ogcReq.offset,
        limit: fetchLimit,
        bbox: ogcReq.bbox,
        upstreamParams,
      },
      redis,
      keyPrefix,
      cache,
    );

    // Hook: transformUpstreamResponse
    const rawItems = await runHook(plugin, 'transformUpstreamResponse', upstream.items);

    // Build features (skip if plugin says so)
    let features: GeoJSON.Feature[];
    if (plugin?.skipGeojsonBuilder) {
      features = rawItems as unknown as GeoJSON.Feature[];
    } else {
      features = (rawItems as Record<string, unknown>[])
        .map((item) => buildFeatureSafe(item, config))
        .filter((f): f is GeoJSON.Feature => f !== null);
    }

    // Hook: transformFeatures (batch)
    if (plugin?.transformFeatures) {
      features = await plugin.transformFeatures(features);
    }

    // Hook: transformFeature (per-item)
    if (plugin?.transformFeature) {
      features = await Promise.all(features.map((f) => plugin.transformFeature!(f)));
    }

    // Apply post-fetch filters
    features = applyPostFilters(features, bbox, cqlAst, postFetchSimpleAst, config.upstream.type === 'wfs');

    if (needsPostFetch && features.length < limit) {
      res.set('OGC-Warning', 'Post-fetch filter may have limited results');
    }

    // Build response
    let fc = buildFeatureCollection(features, {
      baseUrl: getBaseUrl(req),
      collectionId,
      offset,
      limit,
      total: upstream.total,
    });

    // Suppress next link if at maxFeatures
    if (limits.suppressNext) {
      fc = { ...fc, links: fc.links.filter((l) => l.rel !== 'next') };
    }

    // Hook: transformResponse
    fc = await runHook(plugin, 'transformResponse', fc);

    if (limits.capped) {
      res.set('OGC-maxPageSize', String(limits.maxPageSize));
    }
    res.set('Content-Type', 'application/geo+json');
    safeMetric(() => featuresReturned.observe({ collection: collectionId }, fc.features.length));
    res.json(fc);
  } catch (err) {
    if (err instanceof UpstreamError && err.statusCode === 429) {
      return res.status(429).json({ code: 'TooManyRequests', description: 'Upstream rate limit exceeded' });
    }
    if (err instanceof UpstreamTimeoutError) {
      const log = logger.items();
      log.error({ err, collectionId }, 'upstream timeout');
      return res.status(504).json({ code: 'GatewayTimeout', description: 'Upstream request timed out' });
    }
    const log = logger.items();
    log.error({ err, collectionId, query: req.query }, 'getItems failed');
    res.status(502).json({ code: 'UpstreamError', description: 'An upstream error occurred' });
  }
}

export async function getItem(req: Request, res: Response) {
  const collectionId = req.params.collectionId as string;
  const featureId = req.params.featureId as string;
  const config = getCollection(collectionId);

  if (!config) {
    return res.status(404).json({ code: 'NotFound', description: `Collection '${collectionId}' not found` });
  }

  safeMetric(() => collectionRequestsTotal.inc({ collection: collectionId, protocol: 'ogc', operation: 'getItem' }));

  try {
    const plugin = await getCollectionPlugin(collectionId);
    const redis = req.app.get('redis') as Redis | null;
    const keyPrefix = req.app.get('redisKeyPrefix') as string | undefined;
    const cache = req.app.get('cache') as CacheService | null;
    const raw = await fetchUpstreamItem(collectionId, config, featureId, redis, keyPrefix, cache);
    if (!raw) {
      return res.status(404).json({ code: 'NotFound', description: `Feature '${featureId}' not found` });
    }

    let feature: GeoJSON.Feature;
    if (plugin?.skipGeojsonBuilder) {
      feature = raw as unknown as GeoJSON.Feature;
    } else {
      feature = buildFeature(raw, config);
    }

    if (plugin?.transformFeature) {
      feature = await plugin.transformFeature(feature);
    }

    const base = getBaseUrl(req);
    const response = {
      ...feature,
      links: [
        { href: `${base}/collections/${collectionId}/items/${featureId}`, rel: 'self', type: 'application/geo+json' },
        { href: `${base}/collections/${collectionId}`, rel: 'collection', type: 'application/json' },
      ],
    };

    res.set('Content-Type', 'application/geo+json');
    res.json(response);
  } catch (err) {
    if (err instanceof UpstreamError && err.statusCode === 429) {
      return res.status(429).json({ code: 'TooManyRequests', description: 'Upstream rate limit exceeded' });
    }
    if (err instanceof UpstreamError && err.statusCode === 404) {
      return res.status(404).json({ code: 'NotFound', description: `Feature '${featureId}' not found` });
    }
    if (err instanceof UpstreamTimeoutError) {
      const log = logger.items();
      log.error({ err, collectionId }, 'upstream timeout');
      return res.status(504).json({ code: 'GatewayTimeout', description: 'Upstream request timed out' });
    }
    const log = logger.items();
    log.error({ err, collectionId, featureId }, 'getItem failed');
    res.status(502).json({ code: 'UpstreamError', description: 'An upstream error occurred' });
  }
}
