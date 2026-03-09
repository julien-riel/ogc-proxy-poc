import { Router, type RequestHandler } from 'express';
import type { Redis } from 'ioredis';
import express from 'express';
import { buildCapabilitiesXml, buildCapabilities20Xml } from './capabilities.js';
import { buildDescribeFeatureType } from './describe.js';
import { parseGetFeatureGet, parseGetFeaturePost, executeGetFeature } from './get-feature.js';
import type { CacheService } from '../engine/cache.js';
import { logger } from '../logger.js';
import { UpstreamError, UpstreamTimeoutError } from '../engine/adapter.js';
import { collectionRequestsTotal, featuresReturned } from '../metrics.js';

function normalizeQuery(query: Record<string, unknown>): Record<string, string> {
  const normalized: Record<string, string> = {};
  for (const [key, value] of Object.entries(query)) {
    normalized[key.toLowerCase()] = String(value);
  }
  return normalized;
}

export function createWfsRouter(jwtMiddleware: RequestHandler): Router {
  const router = Router();

  router.use(express.text({ type: ['application/xml', 'text/xml'], limit: '100kb' }));

  router.get('/', (req, res, _next) => {
    const query = normalizeQuery(req.query as Record<string, unknown>);
    const request = (query.request || '').toLowerCase();

    // GetCapabilities is a discovery operation — no auth required
    if (request === 'getcapabilities') {
      collectionRequestsTotal.inc({ collection: '_discovery', protocol: 'wfs', operation: 'GetCapabilities' });
      res.set('Content-Type', 'application/xml');
      const version = query.version || '1.1.0';
      if (version.startsWith('2.')) {
        return res.send(buildCapabilities20Xml(req));
      }
      return res.send(buildCapabilitiesXml(req));
    }

    // All other operations require JWT
    jwtMiddleware(req, res, async () => {
      switch (request) {
        case 'describefeaturetype': {
          const typeName = query.typename || query.typenames || '';
          collectionRequestsTotal.inc({ collection: typeName, protocol: 'wfs', operation: 'DescribeFeatureType' });
          const result = buildDescribeFeatureType(typeName);
          if (!result) return res.status(404).json({ code: 'NotFound', description: 'Requested type not found' });
          return res.json(result);
        }

        case 'getfeature': {
          try {
            const params = parseGetFeatureGet(query);
            collectionRequestsTotal.inc({ collection: params.typeName, protocol: 'wfs', operation: 'GetFeature' });
            const redis = req.app.get('redis') as Redis | null;
            const keyPrefix = req.app.get('redisKeyPrefix') as string | undefined;
            const cache = req.app.get('cache') as CacheService | null;
            const result = await executeGetFeature(params, redis, keyPrefix, cache);
            if (result) featuresReturned.observe({ collection: params.typeName }, result.numberReturned);
            if (!result) return res.status(404).json({ code: 'NotFound', description: 'Requested type not found' });
            return res.json(result);
          } catch (err) {
            if (err instanceof UpstreamError && err.statusCode === 429) {
              const log = logger.wfs();
              log.warning({}, 'WFS rate limited');
              return res.status(429).json({ code: 'TooManyRequests', description: 'Upstream rate limit exceeded' });
            }
            if (err instanceof UpstreamTimeoutError) {
              const log = logger.wfs();
              log.error({ err }, 'WFS upstream timeout');
              return res.status(504).json({ code: 'GatewayTimeout', description: 'Upstream request timed out' });
            }
            const log = logger.wfs();
            log.error({ err, query }, 'WFS GetFeature failed');
            return res.status(502).json({ code: 'UpstreamError', description: 'An upstream error occurred' });
          }
        }

        default:
          return res
            .status(400)
            .json({ code: 'InvalidRequest', description: 'Unknown or missing WFS request parameter' });
      }
    });
  });

  router.post('/', jwtMiddleware, async (req, res) => {
    const body = req.body as string;
    if (!body) return res.status(400).json({ code: 'InvalidRequest', description: 'Missing XML body' });

    try {
      const params = parseGetFeaturePost(body);
      collectionRequestsTotal.inc({ collection: params.typeName, protocol: 'wfs', operation: 'GetFeature' });
      const redis = req.app.get('redis') as Redis | null;
      const keyPrefix = req.app.get('redisKeyPrefix') as string | undefined;
      const cache = req.app.get('cache') as CacheService | null;
      const result = await executeGetFeature(params, redis, keyPrefix, cache);
      if (result) featuresReturned.observe({ collection: params.typeName }, result.numberReturned);
      if (!result) return res.status(404).json({ code: 'NotFound', description: 'Requested type not found' });
      return res.json(result);
    } catch (err) {
      if (err instanceof UpstreamError && err.statusCode === 429) {
        const log = logger.wfs();
        log.warning({}, 'WFS rate limited');
        return res.status(429).json({ code: 'TooManyRequests', description: 'Upstream rate limit exceeded' });
      }
      if (err instanceof UpstreamTimeoutError) {
        const log = logger.wfs();
        log.error({ err }, 'WFS upstream timeout');
        return res.status(504).json({ code: 'GatewayTimeout', description: 'Upstream request timed out' });
      }
      const log = logger.wfs();
      log.error({ err }, 'WFS GetFeature POST failed');
      return res.status(502).json({ code: 'UpstreamError', description: 'An upstream error occurred' });
    }
  });

  return router;
}
