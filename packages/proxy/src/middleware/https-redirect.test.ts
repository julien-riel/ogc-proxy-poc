import { describe, it, expect } from 'vitest';
import express from 'express';
import request from 'supertest';
import { httpsRedirect } from './https-redirect.js';

describe('httpsRedirect', () => {
  function createApp() {
    const app = express();
    app.use(httpsRedirect());
    app.get('/test', (_req, res) => res.send('ok'));
    app.get('/health', (_req, res) => res.send('ok'));
    app.get('/ready', (_req, res) => res.send('ok'));
    app.get('/metrics', (_req, res) => res.send('ok'));
    return app;
  }

  it('redirects HTTP to HTTPS', async () => {
    const res = await request(createApp()).get('/test').set('X-Forwarded-Proto', 'http');
    expect(res.status).toBe(301);
    expect(res.headers.location).toMatch(/^https:\/\//);
  });

  it('allows HTTPS requests through', async () => {
    const res = await request(createApp()).get('/test').set('X-Forwarded-Proto', 'https');
    expect(res.status).toBe(200);
  });

  it('allows /health without HTTPS', async () => {
    const res = await request(createApp()).get('/health');
    expect(res.status).toBe(200);
  });

  it('allows /ready without HTTPS', async () => {
    const res = await request(createApp()).get('/ready');
    expect(res.status).toBe(200);
  });

  it('allows /metrics without HTTPS', async () => {
    const res = await request(createApp()).get('/metrics');
    expect(res.status).toBe(200);
  });

  it('preserves query string in redirect', async () => {
    const res = await request(createApp()).get('/test?foo=bar').set('X-Forwarded-Proto', 'http');
    expect(res.status).toBe(301);
    expect(res.headers.location).toContain('foo=bar');
  });
});
