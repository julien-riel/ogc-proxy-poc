import { XMLParser } from 'fast-xml-parser';
import { getCollection } from '../engine/registry.js';
import { fetchUpstreamItems } from '../engine/adapter.js';
import { buildFeature } from '../engine/geojson-builder.js';

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  removeNSPrefix: true,
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
}

const R = 20037508.342789244;

/**
 * Reproject a single [lon, lat] coordinate to EPSG:3857 [x, y].
 */
function lonLatTo3857(lon: number, lat: number): [number, number] {
  const x = (lon * R) / 180;
  const y = Math.log(Math.tan(((90 + lat) * Math.PI) / 360)) * R / Math.PI;
  return [x, y];
}

function reprojectCoords(coords: unknown, srs: string): unknown {
  if (srs !== 'EPSG:3857') return coords;
  if (!Array.isArray(coords)) return coords;
  if (typeof coords[0] === 'number') {
    return lonLatTo3857(coords[0] as number, coords[1] as number);
  }
  return coords.map(c => reprojectCoords(c, srs));
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
  return {
    typeName: query.typename || query.typenames || '',
    maxFeatures: parseInt(query.maxfeatures || query.count || '10'),
    startIndex: parseInt(query.startindex || '0'),
    outputFormat: query.outputformat || 'application/json',
    resultType: query.resulttype || 'results',
    srsName: query.srsname || '',
    cqlFilter: query.cql_filter,
    sortBy: query.sortby,
  };
}

export function parseGetFeaturePost(body: string): WfsGetFeatureParams {
  const parsed = xmlParser.parse(body);
  const getFeature = parsed['GetFeature'] || {};
  const query = getFeature['Query'] || {};

  let bbox: [number, number, number, number] | undefined;
  const filter = query['Filter'] || {};
  const bboxFilter = filter['BBOX'];
  if (bboxFilter) {
    const envelope = bboxFilter['Envelope'] || {};
    const lower = envelope['lowerCorner']?.split(' ').map(Number);
    const upper = envelope['upperCorner']?.split(' ').map(Number);
    if (lower && upper) {
      bbox = [lower[0], lower[1], upper[0], upper[1]];
    }
  }

  return {
    typeName: query['@_typeName'] || query['@_typeNames'] || '',
    maxFeatures: parseInt(getFeature['@_maxFeatures'] || getFeature['@_count'] || '10'),
    startIndex: parseInt(getFeature['@_startIndex'] || '0'),
    outputFormat: getFeature['@_outputFormat'] || 'application/json',
    resultType: getFeature['@_resultType'] || 'results',
    srsName: query['@_srsName'] || getFeature['@_srsName'] || '',
    bbox,
  };
}

export async function executeGetFeature(params: WfsGetFeatureParams) {
  const config = getCollection(params.typeName);
  if (!config) return null;

  const srs = normalizeSrs(params.srsName);

  if (params.resultType === 'hits') {
    const upstream = await fetchUpstreamItems(config, { offset: 0, limit: 1 });
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

  const upstream = await fetchUpstreamItems(config, {
    offset: params.startIndex,
    limit: params.maxFeatures,
  });

  const features = upstream.items
    .map(item => buildFeature(item, config))
    .map(f => reprojectFeature(f as unknown as Record<string, unknown>, srs));

  return {
    type: 'FeatureCollection',
    totalFeatures: upstream.total ?? features.length,
    features,
    numberMatched: upstream.total ?? features.length,
    numberReturned: features.length,
    timeStamp: new Date().toISOString(),
    crs: {
      type: 'name',
      properties: { name: crsUrn(srs) },
    },
  };
}
