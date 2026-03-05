import { Router } from 'express';
import express from 'express';
import { buildCapabilitiesXml } from './capabilities.js';
import { buildDescribeFeatureType } from './describe.js';
import { parseGetFeatureGet, parseGetFeaturePost, executeGetFeature } from './get-feature.js';

const router = Router();

router.use(express.text({ type: ['application/xml', 'text/xml'] }));

function normalizeQuery(query: Record<string, unknown>): Record<string, string> {
  const normalized: Record<string, string> = {};
  for (const [key, value] of Object.entries(query)) {
    normalized[key.toLowerCase()] = String(value);
  }
  return normalized;
}

router.get('/', async (req, res) => {
  const query = normalizeQuery(req.query as Record<string, unknown>);
  const request = query.request || '';

  switch (request.toLowerCase()) {
    case 'getcapabilities':
      res.set('Content-Type', 'application/xml');
      return res.send(buildCapabilitiesXml(req));

    case 'describefeaturetype': {
      const typeName = query.typename || query.typenames || '';
      const result = buildDescribeFeatureType(typeName);
      if (!result) return res.status(404).json({ error: `Type '${typeName}' not found` });
      return res.json(result);
    }

    case 'getfeature': {
      try {
        const params = parseGetFeatureGet(query);
        const result = await executeGetFeature(params);
        if (!result) return res.status(404).json({ error: `Type '${params.typeName}' not found` });
        return res.json(result);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        return res.status(502).json({ error: message });
      }
    }

    default:
      return res.status(400).json({ error: `Unknown request: ${request}` });
  }
});

router.post('/', async (req, res) => {
  const body = req.body as string;
  if (!body) return res.status(400).json({ error: 'Missing XML body' });

  try {
    const params = parseGetFeaturePost(body);
    const result = await executeGetFeature(params);
    if (!result) return res.status(404).json({ error: `Type '${params.typeName}' not found` });
    return res.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return res.status(502).json({ error: message });
  }
});

export default router;
