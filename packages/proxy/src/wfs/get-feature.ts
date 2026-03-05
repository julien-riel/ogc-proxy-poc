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
}

export function parseGetFeatureGet(query: Record<string, string>): WfsGetFeatureParams {
  return {
    typeName: query.typename || query.typenames || '',
    maxFeatures: parseInt(query.maxfeatures || query.count || '10'),
    startIndex: parseInt(query.startindex || '0'),
    outputFormat: query.outputformat || 'application/json',
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
    bbox,
  };
}

export async function executeGetFeature(params: WfsGetFeatureParams) {
  const config = getCollection(params.typeName);
  if (!config) return null;

  const upstream = await fetchUpstreamItems(config, {
    offset: params.startIndex,
    limit: params.maxFeatures,
  });

  const features = upstream.items.map(item => buildFeature(item, config));

  return {
    type: 'FeatureCollection',
    totalFeatures: upstream.total ?? features.length,
    features,
    numberMatched: upstream.total ?? features.length,
    numberReturned: features.length,
    crs: {
      type: 'name',
      properties: { name: 'urn:ogc:def:crs:EPSG::4326' },
    },
  };
}
