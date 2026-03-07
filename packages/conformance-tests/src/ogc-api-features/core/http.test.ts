import { describe, it, expect } from 'vitest';
import { BASE_URL } from '../../helpers.js';

describe('OGC API — HTTP behaviour', () => {
  it('includes CORS headers when Origin header sent', async () => {
    const res = await fetch(`${BASE_URL}/ogc/`, {
      headers: { Origin: 'http://example.com' },
    });
    expect(res.headers.get('access-control-allow-origin')).toBeDefined();
  });

  it('items endpoint returns application/geo+json content-type', async () => {
    const res = await fetch(`${BASE_URL}/ogc/collections/bornes-fontaines/items`, {
      headers: { Accept: 'application/geo+json' },
    });
    expect(res.headers.get('content-type')).toContain('application/geo+json');
  });

  it('collection endpoint returns application/json content-type', async () => {
    const res = await fetch(`${BASE_URL}/ogc/collections/bornes-fontaines`, {
      headers: { Accept: 'application/json' },
    });
    expect(res.headers.get('content-type')).toContain('application/json');
  });

  it('landing page returns application/json content-type', async () => {
    const res = await fetch(`${BASE_URL}/ogc/`, {
      headers: { Accept: 'application/json' },
    });
    expect(res.headers.get('content-type')).toContain('application/json');
  });
});
