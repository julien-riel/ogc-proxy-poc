import { describe, it, expect } from 'vitest';
import express from 'express';
import request from 'supertest';
import { conformance } from './conformance.js';

describe('conformance', () => {
  const app = express();
  app.get('/conformance', conformance);

  it('returns conformance classes', async () => {
    const res = await request(app).get('/conformance');
    expect(res.status).toBe(200);
    expect(res.body.conformsTo).toBeInstanceOf(Array);
    expect(res.body.conformsTo.length).toBeGreaterThan(0);
    expect(res.body.conformsTo).toContain('http://www.opengis.net/spec/ogcapi-features-1/1.0/conf/core');
  });

  it('includes GeoJSON conformance class', async () => {
    const res = await request(app).get('/conformance');
    expect(res.body.conformsTo).toContain('http://www.opengis.net/spec/ogcapi-features-1/1.0/conf/geojson');
  });

  it('includes filter conformance class', async () => {
    const res = await request(app).get('/conformance');
    expect(res.body.conformsTo).toContain('http://www.opengis.net/spec/ogcapi-features-3/1.0/conf/filter');
  });
});
