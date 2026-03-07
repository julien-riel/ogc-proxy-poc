import type { Request, Response } from 'express';
import { getBaseUrl } from '../utils/base-url.js';

export function landing(req: Request, res: Response) {
  const base = getBaseUrl(req);
  res.json({
    title: 'OGC API Proxy Municipal',
    description: 'Interface GIS commune aux APIs maison',
    links: [
      { href: `${base}/`, rel: 'self', type: 'application/json', title: 'This document' },
      { href: `${base}/api`, rel: 'service-desc', type: 'application/vnd.oai.openapi+json;version=3.0', title: 'API definition' },
      { href: `${base}/conformance`, rel: 'conformance', type: 'application/json', title: 'Conformance classes' },
      { href: `${base}/collections`, rel: 'data', type: 'application/json', title: 'Collections' },
    ],
  });
}
