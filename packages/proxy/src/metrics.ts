import { collectDefaultMetrics, Counter, Histogram, register } from 'prom-client';
import type { Request, Response, NextFunction } from 'express';

collectDefaultMetrics();

// --- HTTP metrics ---

const httpRequestDuration = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code'] as const,
  buckets: [0.01, 0.05, 0.1, 0.3, 0.5, 1, 2, 5, 10],
});

const httpRequestsTotal = new Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code'] as const,
});

// --- Business metrics ---

export const collectionRequestsTotal = new Counter({
  name: 'ogc_proxy_collection_requests_total',
  help: 'Total requests per collection',
  labelNames: ['collection', 'protocol', 'operation'] as const,
});

export const upstreamRequestDuration = new Histogram({
  name: 'ogc_proxy_upstream_request_duration_seconds',
  help: 'Duration of upstream API requests in seconds',
  labelNames: ['collection', 'status_code'] as const,
  buckets: [0.05, 0.1, 0.3, 0.5, 1, 2, 5, 10, 15],
});

export const upstreamErrorsTotal = new Counter({
  name: 'ogc_proxy_upstream_errors_total',
  help: 'Total upstream errors',
  labelNames: ['collection', 'error_type'] as const,
});

export const cacheOperationsTotal = new Counter({
  name: 'ogc_proxy_cache_operations_total',
  help: 'Total cache operations',
  labelNames: ['collection', 'result'] as const,
});

export const rateLimitRejectionsTotal = new Counter({
  name: 'ogc_proxy_rate_limit_rejections_total',
  help: 'Total rate limit rejections',
  labelNames: ['collection', 'limiter'] as const,
});

export const featuresReturned = new Histogram({
  name: 'ogc_proxy_features_returned',
  help: 'Number of features returned per request',
  labelNames: ['collection'] as const,
  buckets: [0, 1, 10, 50, 100, 500, 1000, 5000],
});

// --- Middleware & handler ---

function normalizeRoute(req: Request): string {
  if (req.route?.path) {
    return req.baseUrl + req.route.path;
  }
  return req.path;
}

export function httpMiddleware(req: Request, res: Response, next: NextFunction): void {
  const start = process.hrtime.bigint();

  res.on('finish', () => {
    const durationNs = Number(process.hrtime.bigint() - start);
    const durationSeconds = durationNs / 1e9;
    const route = normalizeRoute(req);
    const labels = {
      method: req.method,
      route,
      status_code: String(res.statusCode),
    };

    httpRequestDuration.observe(labels, durationSeconds);
    httpRequestsTotal.inc(labels);
  });

  next();
}

export async function metricsHandler(_req: Request, res: Response): Promise<void> {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
}
