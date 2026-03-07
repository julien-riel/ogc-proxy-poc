import { Router, type RequestHandler } from 'express';
import { landing } from './landing.js';
import { conformance } from './conformance.js';
import { listCollections, getCollectionById } from './collections.js';
import { getItems, getItem } from './items.js';
import { getQueryables } from './queryables.js';

export function createOgcRouter(jwtMiddleware: RequestHandler): Router {
  const router = Router();

  // Discovery endpoints — no auth
  router.get('/', landing);
  router.get('/api', (_req, res) => {
    res.json({
      openapi: '3.0.0',
      info: { title: 'OGC Proxy Municipal', version: '0.1.0' },
      paths: {},
    });
  });
  router.get('/conformance', conformance);

  // Data endpoints — JWT protected
  router.get('/collections', jwtMiddleware, listCollections);
  router.get('/collections/:collectionId', jwtMiddleware, getCollectionById);
  router.get('/collections/:collectionId/queryables', jwtMiddleware, getQueryables);
  router.get('/collections/:collectionId/items', jwtMiddleware, getItems);
  router.get('/collections/:collectionId/items/:featureId', jwtMiddleware, getItem);

  return router;
}
