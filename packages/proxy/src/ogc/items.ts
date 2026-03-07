import type { Request, Response } from 'express';
import { getCollection, getCollectionPlugin } from '../engine/registry.js';
import { getRegistry } from '../engine/registry.js';
import { fetchUpstreamItems, fetchUpstreamItem, UpstreamError } from '../engine/adapter.js';
import { buildFeatureCollection, buildFeature } from '../engine/geojson-builder.js';
import { applyLimits } from '../engine/limits.js';
import { parseCql2, evaluateFilter, extractBboxFromAst } from '../engine/cql2/index.js';
import { runHook } from '../engine/plugin.js';
import type { CqlNode } from '../engine/cql2/types.js';
import type { PropertyConfig } from '../engine/types.js';
import { parseSortby, validateSortable, buildUpstreamSort } from '../engine/sorting.js';
import { getBaseUrl } from '../utils/base-url.js';

function parseBbox(bboxStr: string): [number, number, number, number] | undefined {
  const parts = bboxStr.split(',').map(Number);
  if (parts.length === 4 && parts.every(n => !isNaN(n))) {
    return parts as [number, number, number, number];
  }
  return undefined;
}

function isInBbox(feature: GeoJSON.Feature, bbox: [number, number, number, number]): boolean {
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

  return coords.some(([lon, lat]) =>
    lon >= minLon && lon <= maxLon && lat >= minLat && lat <= maxLat
  );
}

/**
 * Build upstream query params from simple query string filters.
 * Only passes through properties that are filterable with upstream mapping.
 */
function buildUpstreamFilters(
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
function buildPostFetchSimpleFilters(
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

export async function getItems(req: Request, res: Response) {
  const collectionId = req.params.collectionId as string;
  const config = getCollection(collectionId);

  if (!config) {
    return res.status(404).json({ code: 'NotFound', description: `Collection '${collectionId}' not found` });
  }

  const registry = getRegistry();
  const defaults = registry.defaults ?? {};

  // Apply limits
  const rawLimit = parseInt(req.query.limit as string) || 10;
  const rawOffset = parseInt(req.query.offset as string) || 0;
  const limits = applyLimits({ limit: rawLimit, offset: rawOffset }, config, defaults);

  if (limits.rejected) {
    return res.status(400).json({
      code: 'LimitExceeded',
      description: `Offset ${rawOffset} exceeds maxFeatures (${limits.maxFeatures})`,
    });
  }

  const limit = limits.limit;
  const offset = limits.offset;

  // Parse bbox
  const bboxStr = req.query.bbox as string | undefined;
  let bbox = bboxStr ? parseBbox(bboxStr) : undefined;

  // Parse CQL2 filter
  const filterStr = req.query.filter as string | undefined;
  let cqlAst: CqlNode | null = null;
  if (filterStr) {
    try {
      cqlAst = parseCql2(filterStr);
      // Extract bbox from spatial predicates for upstream optimization
      if (!bbox) {
        bbox = extractBboxFromAst(cqlAst) ?? undefined;
      }
    } catch (err) {
      return res.status(400).json({
        code: 'InvalidFilter',
        description: err instanceof Error ? err.message : 'Invalid CQL2 filter',
      });
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
      return res.status(400).json({ code: 'InvalidSortby', description: sortError });
    }
    const sortParams = buildUpstreamSort(sortFields, config.properties);
    Object.assign(upstreamParams, sortParams);
  }

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
    const upstream = await fetchUpstreamItems(config, {
      offset: ogcReq.offset,
      limit: ogcReq.limit,
      bbox: ogcReq.bbox,
      upstreamParams,
    });

    // Hook: transformUpstreamResponse
    let rawItems = await runHook(plugin, 'transformUpstreamResponse', upstream.items);

    // Build features (skip if plugin says so)
    let features: GeoJSON.Feature[];
    if (plugin?.skipGeojsonBuilder) {
      features = rawItems as unknown as GeoJSON.Feature[];
    } else {
      features = (rawItems as Record<string, unknown>[]).map(item => buildFeature(item, config));
    }

    // Hook: transformFeatures (batch)
    if (plugin?.transformFeatures) {
      features = await plugin.transformFeatures(features);
    }

    // Hook: transformFeature (per-item)
    if (plugin?.transformFeature) {
      features = await Promise.all(features.map(f => plugin.transformFeature!(f)));
    }

    // Post-fetch bbox filter (for REST upstreams that don't support bbox)
    if (bbox && config.upstream.type !== 'wfs') {
      features = features.filter(f => isInBbox(f, bbox!));
    }

    // Post-fetch CQL2 filter
    if (cqlAst) {
      features = features.filter(f => evaluateFilter(cqlAst!, f));
    }

    // Post-fetch simple filters not passed to upstream
    if (postFetchSimpleAst) {
      features = features.filter(f => evaluateFilter(postFetchSimpleAst, f));
    }

    // Build response
    let fc = buildFeatureCollection(
      [], // We pass features directly below
      config,
      { baseUrl: getBaseUrl(req), collectionId, offset, limit, total: upstream.total },
    );
    fc = { ...fc, features, numberReturned: features.length };

    // Suppress next link if at maxFeatures
    if (limits.suppressNext) {
      fc = { ...fc, links: fc.links.filter(l => l.rel !== 'next') };
    }

    // Hook: transformResponse
    fc = await runHook(plugin, 'transformResponse', fc);

    if (limits.capped) {
      res.set('OGC-maxPageSize', String(limits.maxPageSize));
    }
    res.set('Content-Type', 'application/geo+json');
    res.json(fc);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(502).json({ code: 'UpstreamError', description: message });
  }
}

export async function getItem(req: Request, res: Response) {
  const collectionId = req.params.collectionId as string;
  const featureId = req.params.featureId as string;
  const config = getCollection(collectionId);

  if (!config) {
    return res.status(404).json({ code: 'NotFound', description: `Collection '${collectionId}' not found` });
  }

  try {
    const plugin = await getCollectionPlugin(collectionId);
    const raw = await fetchUpstreamItem(config, featureId);
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
    if (err instanceof UpstreamError && err.statusCode === 404) {
      return res.status(404).json({ code: 'NotFound', description: `Feature '${featureId}' not found` });
    }
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(502).json({ code: 'UpstreamError', description: message });
  }
}
