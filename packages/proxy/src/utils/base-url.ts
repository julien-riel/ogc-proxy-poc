import type { Request } from 'express';

/**
 * Returns the base URL for OGC API links.
 * Uses BASE_URL env var if set, otherwise constructs from the request.
 */
export function getBaseUrl(req: Request): string {
  return process.env.BASE_URL || `${req.protocol}://${req.get('host')}/ogc`;
}
