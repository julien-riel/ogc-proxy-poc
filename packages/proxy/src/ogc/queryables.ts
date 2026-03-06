import type { Request, Response } from 'express';
import { getCollection } from '../engine/registry.js';

function getBaseUrl(req: Request): string {
  return process.env.BASE_URL || `${req.protocol}://${req.get('host')}/ogc`;
}

const TYPE_MAP: Record<string, string> = {
  string: 'string',
  int: 'integer',
  integer: 'integer',
  double: 'number',
  boolean: 'boolean',
};

const GEOM_REF: Record<string, string> = {
  Point: 'https://geojson.org/schema/Point.json',
  LineString: 'https://geojson.org/schema/LineString.json',
  Polygon: 'https://geojson.org/schema/Polygon.json',
};

export function getQueryables(req: Request, res: Response) {
  const { collectionId } = req.params;
  const config = getCollection(collectionId);

  if (!config) {
    return res.status(404).json({ code: 'NotFound', description: `Collection '${collectionId}' not found` });
  }

  const base = getBaseUrl(req);
  const properties: Record<string, Record<string, unknown>> = {};

  for (const prop of config.properties) {
    if (!prop.filterable) continue;
    const schema: Record<string, unknown> = {
      type: TYPE_MAP[prop.type] ?? 'string',
    };
    if (prop.sortable) {
      schema['x-ogc-sortable'] = true;
    }
    properties[prop.name] = schema;
  }

  properties.geometry = {
    $ref: GEOM_REF[config.geometry.type] ?? GEOM_REF.Point,
  };

  res.json({
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $id: `${base}/collections/${collectionId}/queryables`,
    type: 'object',
    title: config.title,
    properties,
  });
}
