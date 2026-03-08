import type { Request, Response } from 'express';
import { getRegistry, getCollection } from '../engine/registry.js';
import { getBaseUrl } from '../utils/base-url.js';

export function listCollections(req: Request, res: Response) {
  const base = getBaseUrl(req);
  const registry = getRegistry();

  const collections = Object.entries(registry.collections).map(([id, config]) => ({
    id,
    title: config.title,
    description: config.description || '',
    extent: config.extent
      ? {
          spatial: { bbox: [config.extent.spatial] },
        }
      : undefined,
    links: [
      { href: `${base}/collections/${id}`, rel: 'self', type: 'application/json' },
      { href: `${base}/collections/${id}/items`, rel: 'items', type: 'application/geo+json' },
    ],
    crs: ['http://www.opengis.net/def/crs/OGC/1.3/CRS84'],
  }));

  res.json({
    links: [{ href: `${base}/collections`, rel: 'self', type: 'application/json' }],
    collections,
  });
}

export function getCollectionById(req: Request, res: Response) {
  const base = getBaseUrl(req);
  const collectionId = req.params.collectionId as string;
  const config = getCollection(collectionId);

  if (!config) {
    return res.status(404).json({ code: 'NotFound', description: `Collection '${collectionId}' not found` });
  }

  res.json({
    id: collectionId,
    title: config.title,
    description: config.description || '',
    extent: config.extent
      ? {
          spatial: { bbox: [config.extent.spatial] },
        }
      : undefined,
    links: [
      { href: `${base}/collections/${collectionId}`, rel: 'self', type: 'application/json' },
      { href: `${base}/collections/${collectionId}/items`, rel: 'items', type: 'application/geo+json' },
    ],
    crs: ['http://www.opengis.net/def/crs/OGC/1.3/CRS84'],
  });
}
