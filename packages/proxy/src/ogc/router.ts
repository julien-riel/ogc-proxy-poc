import { Router, type RequestHandler } from 'express';
import { landing } from './landing.js';
import { conformance } from './conformance.js';
import { listCollections, getCollectionById } from './collections.js';
import { getItems, getItem } from './items.js';
import { getQueryables } from './queryables.js';
import { buildOpenApiSpec } from './openapi.js';
import { getBaseUrl } from '../utils/base-url.js';

export function createOgcRouter(jwtMiddleware: RequestHandler): Router {
  const router = Router();

  // Discovery endpoints — no auth
  router.get('/', landing);
  router.get('/api', (req, res) => {
    res.json(buildOpenApiSpec(getBaseUrl(req)));
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
