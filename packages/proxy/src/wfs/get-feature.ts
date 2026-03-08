import { XMLParser } from 'fast-xml-parser';
import type { Redis } from 'ioredis';
import { getCollection } from '../engine/registry.js';
import { fetchUpstreamItems } from '../engine/adapter.js';
import type { CacheService } from '../engine/cache.js';
import { buildFeatureSafe } from '../engine/geojson-builder.js';
import { parseFilterXml } from './filter-encoding.js';
import { evaluateFilter } from '../engine/cql2/evaluator.js';
import { parseCql2 } from '../engine/cql2/parser.js';
import type { CqlNode } from '../engine/cql2/types.js';

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  removeNSPrefix: true,
  processEntities: false,
});

interface WfsGetFeatureParams {
  typeName: string;
  maxFeatures: number;
  startIndex: number;
  bbox?: [number, number, number, number];
  outputFormat: string;
  resultType: string;
  srsName: string;
  cqlFilter?: string;
  sortBy?: string;
  filterNode?: CqlNode;
}

const R = 20037508.342789244;

/**
 * Reproject a single [lon, lat] coordinate to EPSG:3857 [x, y].
 */
function lonLatTo3857(lon: number, lat: number): [number, number] {
  const x = (lon * R) / 180;
  const y = (Math.log(Math.tan(((90 + lat) * Math.PI) / 360)) * R) / Math.PI;
  return [x, y];
}

function reprojectCoords(coords: unknown, srs: string): unknown {
  if (srs !== 'EPSG:3857') return coords;
  if (!Array.isArray(coords)) return coords;
  if (typeof coords[0] === 'number') {
    return lonLatTo3857(coords[0] as number, coords[1] as number);
  }
  return coords.map((c) => reprojectCoords(c, srs));
}

function reprojectFeature(feature: Record<string, unknown>, srs: string): Record<string, unknown> {
  if (srs !== 'EPSG:3857') return feature;
  const geom = feature.geometry as Record<string, unknown> | undefined;
  if (!geom) return feature;
  return {
    ...feature,
    geometry: {
      ...geom,
      coordinates: reprojectCoords(geom.coordinates, srs),
    },
  };
}

function normalizeSrs(srsName: string): string {
  const s = srsName.toUpperCase();
  if (s.includes('3857') || s.includes('900913')) return 'EPSG:3857';
  if (s.includes('4326') || s.includes('CRS84') || !s) return 'CRS84';
  return 'CRS84';
}

function crsUrn(srs: string): string {
  if (srs === 'EPSG:3857') return 'urn:ogc:def:crs:EPSG::3857';
  return 'urn:ogc:def:crs:OGC:1.3:CRS84';
}

export function parseGetFeatureGet(query: Record<string, string>): WfsGetFeatureParams {
  const MAX_FILTER_LENGTH = 4096;
  if (query.cql_filter && query.cql_filter.length > MAX_FILTER_LENGTH) {
    throw new Error(`CQL filter exceeds maximum length of ${MAX_FILTER_LENGTH} characters`);
  }

  let filterNode: CqlNode | undefined;
  if (query.cql_filter) {
    filterNode = parseCql2(query.cql_filter);
  }

  return {
    typeName: query.typename || query.typenames || '',
    maxFeatures: parseInt(query.maxfeatures || query.count || '10'),
    startIndex: parseInt(query.startindex || '0'),
    outputFormat: query.outputformat || 'application/json',
    resultType: query.resulttype || 'results',
    srsName: query.srsname || '',
    cqlFilter: query.cql_filter,
    sortBy: query.sortby,
    filterNode,
  };
}

export function parseGetFeaturePost(body: string): WfsGetFeatureParams {
  const parsed = xmlParser.parse(body);
  const getFeature = parsed['GetFeature'] || {};
  const query = getFeature['Query'] || {};

  let bbox: [number, number, number, number] | undefined;
  let filterNode: CqlNode | undefined;

  const filter = query['Filter'] || {};
  if (Object.keys(filter).length > 0) {
    // Try to extract a simple BBOX for upstream optimization
    const bboxFilter = filter['BBOX'];
    if (bboxFilter) {
      const envelope = bboxFilter['Envelope'] || {};
      const lower = envelope['lowerCorner']?.split(' ').map(Number);
      const upper = envelope['upperCorner']?.split(' ').map(Number);
      if (lower && upper) {
        bbox = [lower[0], lower[1], upper[0], upper[1]];
      }
    }
    // Parse full filter to CqlNode for post-fetch evaluation
    const node = parseFilterXml(filter);
    if (node) filterNode = node;
  }

  return {
    typeName: query['@_typeName'] || query['@_typeNames'] || '',
    maxFeatures: parseInt(getFeature['@_maxFeatures'] || getFeature['@_count'] || '10'),
    startIndex: parseInt(getFeature['@_startIndex'] || '0'),
    outputFormat: getFeature['@_outputFormat'] || 'application/json',
    resultType: getFeature['@_resultType'] || 'results',
    srsName: query['@_srsName'] || getFeature['@_srsName'] || '',
    bbox,
    filterNode,
  };
}

export async function executeGetFeature(
  params: WfsGetFeatureParams,
  redis?: Redis | null,
  keyPrefix?: string,
  cache?: CacheService | null,
) {
  const config = getCollection(params.typeName);
  if (!config) return null;

  const srs = normalizeSrs(params.srsName);

  if (params.resultType === 'hits') {
    const upstream = await fetchUpstreamItems(
      params.typeName,
      config,
      { offset: 0, limit: 1 },
      redis,
      keyPrefix,
      cache,
    );
    return {
      type: 'FeatureCollection',
      totalFeatures: upstream.total ?? 0,
      features: [],
      numberMatched: upstream.total ?? 0,
      numberReturned: 0,
      timeStamp: new Date().toISOString(),
      crs: {
        type: 'name',
        properties: { name: crsUrn(srs) },
      },
    };
  }

  // Fetch more items when filtering post-fetch to avoid under-filling
  const DEFAULT_MAX_POST_FETCH_ITEMS = 5000;
  const maxPostFetch = config.maxPostFetchItems ?? DEFAULT_MAX_POST_FETCH_ITEMS;
  const fetchLimit = params.filterNode ? Math.min(params.maxFeatures * 10, maxPostFetch) : params.maxFeatures;

  const upstream = await fetchUpstreamItems(
    params.typeName,
    config,
    {
      offset: params.startIndex,
      limit: fetchLimit,
    },
    redis,
    keyPrefix,
    cache,
  );

  let features = upstream.items
    .map((item) => buildFeatureSafe(item, config))
    .filter((f): f is GeoJSON.Feature => f !== null);

  // Apply filter post-fetch
  if (params.filterNode) {
    features = features.filter((f) => evaluateFilter(params.filterNode!, f as unknown as import('geojson').Feature));
  }

  // Apply maxFeatures limit after filtering
  const limited = params.filterNode ? features.slice(0, params.maxFeatures) : features;

  const reprojected = limited.map((f) => reprojectFeature(f as unknown as Record<string, unknown>, srs));

  return {
    type: 'FeatureCollection',
    totalFeatures: params.filterNode ? features.length : (upstream.total ?? reprojected.length),
    features: reprojected,
    numberMatched: params.filterNode ? features.length : (upstream.total ?? reprojected.length),
    numberReturned: reprojected.length,
    timeStamp: new Date().toISOString(),
    crs: {
      type: 'name',
      properties: { name: crsUrn(srs) },
    },
  };
}
