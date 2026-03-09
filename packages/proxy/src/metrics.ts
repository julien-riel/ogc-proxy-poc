import { collectDefaultMetrics, Counter, Gauge, Histogram, register } from 'prom-client';
import type { Request, Response, NextFunction } from 'express';
import { logger } from './logger.js';

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
  buckets: [1, 10, 50, 100, 500, 1000, 5000],
});

export const circuitBreakerState = new Gauge({
  name: 'ogc_proxy_circuit_breaker_state',
  help: 'Circuit breaker state (0=closed, 1=open, 2=half-open)',
  labelNames: ['collection'] as const,
});

export const circuitBreakerTransitions = new Counter({
  name: 'ogc_proxy_circuit_breaker_transitions_total',
  help: 'Total circuit breaker state transitions',
  labelNames: ['collection', 'to_state'] as const,
});

export const retryAttemptsTotal = new Counter({
  name: 'ogc_proxy_retry_attempts_total',
  help: 'Total retry attempts',
  labelNames: ['collection'] as const,
});

export const responseSizeBytes = new Histogram({
  name: 'ogc_proxy_response_size_bytes',
  help: 'Response size in bytes',
  labelNames: ['collection'] as const,
  buckets: [100, 1000, 10000, 100000, 1000000, 10000000],
});

// --- Safe metric helpers ---

/**
 * Safely record a metric operation. Metrics must never affect the primary request path.
 */
export function safeMetric(fn: () => void): void {
  try {
    fn();
  } catch (err) {
    const log = logger.app();
    log.warning({ err }, 'metric recording failed');
  }
}

// --- Middleware & handler ---

function normalizeRoute(req: Request): string {
  if (req.route?.path) {
    return req.baseUrl + req.route.path;
  }
  return 'unmatched';
}

export function httpMiddleware(req: Request, res: Response, next: NextFunction): void {
  const start = process.hrtime.bigint();

  res.on('finish', () => {
    try {
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
    } catch {
      // Metrics must never crash the process
    }
  });

  next();
}

export async function metricsHandler(_req: Request, res: Response): Promise<void> {
  try {
    res.set('Content-Type', register.contentType);
    res.end(await register.metrics());
  } catch {
    res.status(500).end('Error collecting metrics');
  }
}
