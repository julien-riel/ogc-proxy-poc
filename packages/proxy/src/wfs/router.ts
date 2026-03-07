import { Router, type RequestHandler } from 'express';
import express from 'express';
import { buildCapabilitiesXml, buildCapabilities20Xml } from './capabilities.js';
import { buildDescribeFeatureType } from './describe.js';
import { parseGetFeatureGet, parseGetFeaturePost, executeGetFeature } from './get-feature.js';
import { logger } from '../logger.js';
import { UpstreamTimeoutError } from '../engine/adapter.js';

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

  router.get('/', (req, res, next) => {
    const query = normalizeQuery(req.query as Record<string, unknown>);
    const request = (query.request || '').toLowerCase();

    // GetCapabilities is a discovery operation — no auth required
    if (request === 'getcapabilities') {
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
          const result = buildDescribeFeatureType(typeName);
          if (!result) return res.status(404).json({ code: 'NotFound', description: 'Requested type not found' });
          return res.json(result);
        }

        case 'getfeature': {
          try {
            const params = parseGetFeatureGet(query);
            const result = await executeGetFeature(params);
            if (!result) return res.status(404).json({ code: 'NotFound', description: 'Requested type not found' });
            return res.json(result);
          } catch (err) {
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
          return res.status(400).json({ code: 'InvalidRequest', description: 'Unknown or missing WFS request parameter' });
      }
    });
  });

  router.post('/', jwtMiddleware, async (req, res) => {
    const body = req.body as string;
    if (!body) return res.status(400).json({ code: 'InvalidRequest', description: 'Missing XML body' });

    try {
      const params = parseGetFeaturePost(body);
      const result = await executeGetFeature(params);
      if (!result) return res.status(404).json({ code: 'NotFound', description: 'Requested type not found' });
      return res.json(result);
    } catch (err) {
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
