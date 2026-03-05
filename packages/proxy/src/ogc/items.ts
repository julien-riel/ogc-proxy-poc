import type { Request, Response } from 'express';
import { getCollection } from '../engine/registry.js';
import { fetchUpstreamItems, fetchUpstreamItem, UpstreamError } from '../engine/adapter.js';
import { buildFeatureCollection, buildFeature } from '../engine/geojson-builder.js';

function getBaseUrl(req: Request): string {
  return process.env.BASE_URL || `${req.protocol}://${req.get('host')}/ogc`;
}

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

export async function getItems(req: Request, res: Response) {
  const { collectionId } = req.params;
  const config = getCollection(collectionId);

  if (!config) {
    return res.status(404).json({ code: 'NotFound', description: `Collection '${collectionId}' not found` });
  }

  const limit = Math.min(parseInt(req.query.limit as string) || 10, 1000);
  const offset = parseInt(req.query.offset as string) || 0;
  const bboxStr = req.query.bbox as string | undefined;
  const bbox = bboxStr ? parseBbox(bboxStr) : undefined;

  try {
    const upstream = await fetchUpstreamItems(config, { offset, limit });
    let fc = buildFeatureCollection(upstream.items, config, {
      baseUrl: getBaseUrl(req),
      collectionId,
      offset,
      limit,
      total: upstream.total,
    });

    if (bbox) {
      const filtered = fc.features.filter(f => isInBbox(f, bbox));
      fc = { ...fc, features: filtered, numberReturned: filtered.length };
    }

    res.set('Content-Type', 'application/geo+json');
    res.json(fc);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(502).json({ code: 'UpstreamError', description: message });
  }
}

export async function getItem(req: Request, res: Response) {
  const { collectionId, featureId } = req.params;
  const config = getCollection(collectionId);

  if (!config) {
    return res.status(404).json({ code: 'NotFound', description: `Collection '${collectionId}' not found` });
  }

  try {
    const raw = await fetchUpstreamItem(config, featureId);
    if (!raw) {
      return res.status(404).json({ code: 'NotFound', description: `Feature '${featureId}' not found` });
    }

    const base = getBaseUrl(req);
    const feature = buildFeature(raw, config);
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
