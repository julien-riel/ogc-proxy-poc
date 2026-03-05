import type { Request, Response } from 'express';

export function conformance(_req: Request, res: Response) {
  res.json({
    conformsTo: [
      'http://www.opengis.net/spec/ogcapi-features-1/1.0/conf/core',
      'http://www.opengis.net/spec/ogcapi-features-1/1.0/conf/geojson',
      'http://www.opengis.net/spec/ogcapi-features-1/1.0/conf/oas30',
    ],
  });
}
