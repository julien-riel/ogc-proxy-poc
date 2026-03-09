import { describe, it, expect, vi, beforeEach } from 'vitest';
import { register } from 'prom-client';

beforeEach(() => {
  vi.resetModules();
  register.clear();
});

describe('metrics', () => {
  it('exports httpMiddleware function', async () => {
    const { httpMiddleware } = await import('./metrics.js');
    expect(typeof httpMiddleware).toBe('function');
  });

  it('exports metricsHandler function', async () => {
    const { metricsHandler } = await import('./metrics.js');
    expect(typeof metricsHandler).toBe('function');
  });

  it('httpMiddleware records request duration and count', async () => {
    const mod = await import('./metrics.js');
    const req = { method: 'GET', route: { path: '/test' }, path: '/test', baseUrl: '' } as any;
    const res = {
      statusCode: 200,
      on: vi.fn((event: string, cb: () => void) => {
        if (event === 'finish') cb();
      }),
    } as any;
    const next = vi.fn();

    mod.httpMiddleware(req, res, next);
    expect(next).toHaveBeenCalled();

    const metrics = await register.getMetricsAsJSON();
    const duration = metrics.find((m) => m.name === 'http_request_duration_seconds');
    const total = metrics.find((m) => m.name === 'http_requests_total');
    expect(duration).toBeDefined();
    expect(total).toBeDefined();
  });

  it('metricsHandler returns prometheus text format', async () => {
    const { metricsHandler } = await import('./metrics.js');
    const req = {} as any;
    const res = {
      set: vi.fn(),
      end: vi.fn(),
    } as any;

    await metricsHandler(req, res);
    expect(res.set).toHaveBeenCalledWith('Content-Type', expect.stringContaining('text/plain'));
    expect(res.end).toHaveBeenCalledWith(expect.any(String));
  });

  it('exports all expected business metrics', async () => {
    const mod = await import('./metrics.js');
    expect(mod.collectionRequestsTotal).toBeDefined();
    expect(mod.upstreamRequestDuration).toBeDefined();
    expect(mod.upstreamErrorsTotal).toBeDefined();
    expect(mod.cacheOperationsTotal).toBeDefined();
    expect(mod.rateLimitRejectionsTotal).toBeDefined();
    expect(mod.featuresReturned).toBeDefined();
  });

  it('metricsHandler includes default Node.js metrics', async () => {
    const { metricsHandler } = await import('./metrics.js');
    const output = { content: '' };
    const res = {
      set: vi.fn(),
      end: vi.fn((str: string) => {
        output.content = str;
      }),
    } as any;

    await metricsHandler({} as any, res);
    expect(output.content).toContain('process_cpu');
    expect(output.content).toContain('nodejs_');
  });
});
