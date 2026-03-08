import { Router, type RequestHandler } from 'express';
import type { CacheService } from '../engine/cache.js';

/**
 * Creates an Express router for admin operations.
 * @param jwtMiddleware - Authentication middleware to protect admin endpoints
 * @param cache - Cache service instance for cache management operations
 * @returns Express Router with admin endpoints
 */
export function createAdminRouter(jwtMiddleware: RequestHandler, cache: CacheService): Router {
  const router = Router();

  router.delete('/cache/:collectionId', jwtMiddleware, async (req, res) => {
    const { collectionId } = req.params;
    try {
      const keysDeleted = await cache.invalidate(collectionId);
      res.json({ collection: collectionId, keysDeleted });
    } catch {
      res.status(500).json({ code: 'CacheError', description: 'Failed to invalidate cache' });
    }
  });

  return router;
}
