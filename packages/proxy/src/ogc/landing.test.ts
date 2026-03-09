import { describe, it, expect } from 'vitest';
import express from 'express';
import request from 'supertest';
import { landing } from './landing.js';

describe('landing', () => {
  const app = express();
  app.get('/ogc', landing);

  it('returns landing page with required links', async () => {
    const res = await request(app).get('/ogc');
    expect(res.status).toBe(200);
    expect(res.body.title).toBeDefined();
    expect(res.body.description).toBeDefined();
    expect(res.body.links).toBeInstanceOf(Array);
    const rels = res.body.links.map((l: any) => l.rel);
    expect(rels).toContain('self');
    expect(rels).toContain('service-desc');
    expect(rels).toContain('conformance');
    expect(rels).toContain('data');
  });

  it('includes correct media types in links', async () => {
    const res = await request(app).get('/ogc');
    const links = res.body.links;
    const serviceDesc = links.find((l: any) => l.rel === 'service-desc');
    expect(serviceDesc.type).toBe('application/vnd.oai.openapi+json;version=3.0');
    const selfLink = links.find((l: any) => l.rel === 'self');
    expect(selfLink.type).toBe('application/json');
  });
});
