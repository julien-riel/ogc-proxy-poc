import { describe, it, expect } from 'vitest';
import { fetchJson } from '../helpers.js';

describe('OGC API — Landing Page (/ogc/)', () => {
  it('returns 200', async () => {
    const { status } = await fetchJson('/ogc/');
    expect(status).toBe(200);
  });

  it('has a links array', async () => {
    const { body } = await fetchJson('/ogc/');
    expect(body.links).toBeDefined();
    expect(Array.isArray(body.links)).toBe(true);
    expect(body.links.length).toBeGreaterThan(0);
  });

  it('has a service-desc or service-doc link', async () => {
    const { body } = await fetchJson('/ogc/');
    const hasServiceDesc = body.links.some((l: any) => l.rel === 'service-desc' || l.rel === 'service-doc');
    expect(hasServiceDesc).toBe(true);
  });

  it('has a conformance link', async () => {
    const { body } = await fetchJson('/ogc/');
    const link = body.links.find((l: any) => l.rel === 'conformance');
    expect(link).toBeDefined();
    expect(link.type).toBeDefined();
  });

  it('has a data link', async () => {
    const { body } = await fetchJson('/ogc/');
    const link = body.links.find((l: any) => l.rel === 'data');
    expect(link).toBeDefined();
    expect(link.type).toBeDefined();
  });

  it('every link has rel and type', async () => {
    const { body } = await fetchJson('/ogc/');
    for (const link of body.links) {
      expect(link.rel).toBeDefined();
      expect(link.type).toBeDefined();
    }
  });
});
