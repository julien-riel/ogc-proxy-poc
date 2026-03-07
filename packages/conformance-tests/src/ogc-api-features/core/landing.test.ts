import { describe, it, expect } from 'vitest';
import { fetchJson } from '../../helpers.js';

describe('OGC API — Landing Page (/ogc/)', () => {
  it('supports HTTP GET at root path', async () => {
    const { status } = await fetchJson('/ogc/');
    expect(status).toBe(200);
  });

  it('returns body with links array', async () => {
    const { body } = await fetchJson('/ogc/');
    expect(body.links).toBeDefined();
    expect(Array.isArray(body.links)).toBe(true);
    expect(body.links.length).toBeGreaterThan(0);
  });

  it('has title', async () => {
    const { body } = await fetchJson('/ogc/');
    expect(body.title).toBeDefined();
    expect(typeof body.title).toBe('string');
  });

  it('has service-desc or service-doc link', async () => {
    const { body } = await fetchJson('/ogc/');
    const hasServiceLink = body.links.some(
      (l: any) => l.rel === 'service-desc' || l.rel === 'service-doc'
    );
    expect(hasServiceLink).toBe(true);
  });

  it('has conformance link with href and type', async () => {
    const { body } = await fetchJson('/ogc/');
    const link = body.links.find((l: any) => l.rel === 'conformance');
    expect(link).toBeDefined();
    expect(link.href).toBeDefined();
    expect(link.type).toBeDefined();
  });

  it('has data link pointing to /collections', async () => {
    const { body } = await fetchJson('/ogc/');
    const link = body.links.find((l: any) => l.rel === 'data');
    expect(link).toBeDefined();
    expect(link.href).toContain('/collections');
  });

  it('every link has rel, type, and href', async () => {
    const { body } = await fetchJson('/ogc/');
    for (const link of body.links) {
      expect(link.rel).toBeDefined();
      expect(link.type).toBeDefined();
      expect(link.href).toBeDefined();
    }
  });

  it('has a self link', async () => {
    const { body } = await fetchJson('/ogc/');
    const selfLink = body.links.find((l: any) => l.rel === 'self');
    expect(selfLink).toBeDefined();
  });
});
