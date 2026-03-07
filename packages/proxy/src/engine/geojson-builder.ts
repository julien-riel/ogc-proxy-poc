import type { CollectionConfig } from './types.js';

/**
 * Resolves a dot-notation path on an object.
 * Example: getByPath({ a: { b: 1 } }, 'a.b') => 1
 */
export function getByPath(obj: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce<unknown>((o, key) => {
    if (o && typeof o === 'object') return (o as Record<string, unknown>)[key];
    return undefined;
  }, obj);
}

function parseWkt(wkt: string): GeoJSON.Geometry {
  const trimmed = wkt.trim();

  const pointMatch = trimmed.match(/^POINT\s*\(\s*([-\d.]+)\s+([-\d.]+)\s*\)$/i);
  if (pointMatch) {
    return { type: 'Point', coordinates: [parseFloat(pointMatch[1]), parseFloat(pointMatch[2])] };
  }

  const polygonMatch = trimmed.match(/^POLYGON\s*\(\((.+)\)\)$/i);
  if (polygonMatch) {
    const ring = polygonMatch[1].split(',').map(pair => {
      const [x, y] = pair.trim().split(/\s+/).map(Number);
      return [x, y];
    });
    return { type: 'Polygon', coordinates: [ring] };
  }

  throw new Error(`Unsupported WKT: ${wkt}`);
}

function buildGeometry(raw: Record<string, unknown>, config: CollectionConfig): GeoJSON.Geometry {
  const { geometry } = config;

  switch (geometry.type) {
    case 'Point': {
      const x = raw[geometry.xField!] as number;
      const y = raw[geometry.yField!] as number;
      return { type: 'Point', coordinates: [x, y] };
    }
    case 'LineString': {
      const coords = getByPath(raw, geometry.coordsField!) as number[][];
      return { type: 'LineString', coordinates: coords };
    }
    case 'Polygon': {
      const wkt = raw[geometry.wktField!] as string;
      return parseWkt(wkt);
    }
    default:
      throw new Error(`Unsupported geometry type: ${geometry.type}`);
  }
}

function buildProperties(raw: Record<string, unknown>, config: CollectionConfig): Record<string, unknown> {
  const props: Record<string, unknown> = {};
  for (const prop of config.properties) {
    if (prop.name in raw) {
      props[prop.name] = raw[prop.name];
    }
  }
  return props;
}

export function buildFeature(raw: Record<string, unknown>, config: CollectionConfig): GeoJSON.Feature {
  return {
    type: 'Feature',
    id: raw[config.idField] as string | number,
    geometry: buildGeometry(raw, config),
    properties: buildProperties(raw, config),
  };
}

interface PaginationContext {
  baseUrl: string;
  collectionId: string;
  offset: number;
  limit: number;
  total?: number;
}

interface OgcFeatureCollection {
  type: 'FeatureCollection';
  features: GeoJSON.Feature[];
  links: Array<{ href: string; rel: string; type: string }>;
  numberMatched?: number;
  numberReturned: number;
  timeStamp: string;
}

export function buildFeatureCollection(
  features: GeoJSON.Feature[],
  ctx: PaginationContext,
): OgcFeatureCollection {
  const itemsUrl = `${ctx.baseUrl}/collections/${ctx.collectionId}/items`;

  const links: Array<{ href: string; rel: string; type: string }> = [
    { href: `${itemsUrl}?offset=${ctx.offset}&limit=${ctx.limit}`, rel: 'self', type: 'application/geo+json' },
  ];

  if (ctx.total !== undefined && ctx.offset + ctx.limit < ctx.total) {
    links.push({
      href: `${itemsUrl}?offset=${ctx.offset + ctx.limit}&limit=${ctx.limit}`,
      rel: 'next',
      type: 'application/geo+json',
    });
  }

  if (ctx.offset > 0) {
    const prevOffset = Math.max(0, ctx.offset - ctx.limit);
    links.push({
      href: `${itemsUrl}?offset=${prevOffset}&limit=${ctx.limit}`,
      rel: 'prev',
      type: 'application/geo+json',
    });
  }

  const result: OgcFeatureCollection = {
    type: 'FeatureCollection',
    features,
    links,
    numberReturned: features.length,
    timeStamp: new Date().toISOString(),
  };

  if (ctx.total !== undefined) {
    result.numberMatched = ctx.total;
  }

  return result;
}
