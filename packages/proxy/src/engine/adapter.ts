import type { Redis } from 'ioredis';
import type { CollectionConfig } from './types.js';
import type { CacheService } from './cache.js';
import { getByPath } from './geojson-builder.js';
import { fetchJson, UpstreamError, UpstreamTimeoutError } from './fetch-service.js';
import { fetchWithStrategy } from './pagination/index.js';
import type { FetchParams, UpstreamPage } from './pagination/types.js';
import { getUpstreamBucket, TokenBucket } from './upstream-rate-limit.js';
import { logger } from '../logger.js';
import {
  upstreamRequestDuration,
  upstreamErrorsTotal,
  rateLimitRejectionsTotal,
  circuitBreakerState,
  retryAttemptsTotal,
  safeMetric,
} from '../metrics.js';
import { getCircuitBreaker, CircuitState } from './circuit-breaker.js';
import { withRetry } from './retry.js';

export type { FetchParams, UpstreamPage } from './pagination/types.js';
export { UpstreamError, UpstreamTimeoutError } from './fetch-service.js';

export interface AdapterDeps {
  cache?: CacheService | null;
  redis?: Redis | null;
  keyPrefix?: string;
}

async function executeWithMiddleware<T>(
  collectionId: string,
  config: CollectionConfig,
  cacheKey: Record<string, unknown>,
  doFetch: () => Promise<T>,
  deps: AdapterDeps,
): Promise<T> {
  // 1. Cache check
  if (deps.cache && config.cache?.ttlSeconds) {
    const cached = await deps.cache.get(collectionId, cacheKey);
    if (cached) return cached as T;
  }

  // 2. Rate limit
  const bucket = getUpstreamBucket(
    collectionId,
    config.rateLimit?.capacity,
    config.rateLimit?.refillRate,
    deps.redis,
    deps.keyPrefix,
  );
  const allowed = bucket instanceof TokenBucket ? bucket.tryConsume() : await bucket.tryConsume();
  if (!allowed) {
    const log = logger.adapter();
    log.warning({ collectionId }, 'upstream rate limit exceeded');
    safeMetric(() => rateLimitRejectionsTotal.inc({ collection: collectionId, limiter: 'upstream' }));
    throw new UpstreamError(429);
  }

  // 3. Circuit breaker
  const breaker = getCircuitBreaker(collectionId, config.circuitBreaker);
  if (breaker && !breaker.canExecute()) {
    const log = logger.adapter();
    log.warning({ collectionId }, 'circuit breaker is open, rejecting request');
    safeMetric(() => {
      const stateValue = breaker.state === CircuitState.Open ? 1 : breaker.state === CircuitState.HalfOpen ? 2 : 0;
      circuitBreakerState.set({ collection: collectionId }, stateValue);
    });
    throw new UpstreamError(503);
  }

  // 4. Execute with retry + metrics
  const fetchStart = process.hrtime.bigint();
  let result: T;
  try {
    if (config.retry) {
      safeMetric(() => retryAttemptsTotal.inc({ collection: collectionId }));
      result = await withRetry(doFetch, config.retry);
    } else {
      result = await doFetch();
    }
  } catch (err) {
    if (breaker) breaker.recordFailure();
    const durationS = Number(process.hrtime.bigint() - fetchStart) / 1e9;
    safeMetric(() => {
      if (err instanceof UpstreamError) {
        upstreamRequestDuration.observe({ collection: collectionId, status_code: String(err.statusCode) }, durationS);
        upstreamErrorsTotal.inc({ collection: collectionId, error_type: 'http_error' });
      } else if (err instanceof UpstreamTimeoutError) {
        upstreamRequestDuration.observe({ collection: collectionId, status_code: 'timeout' }, durationS);
        upstreamErrorsTotal.inc({ collection: collectionId, error_type: 'timeout' });
      } else {
        upstreamErrorsTotal.inc({ collection: collectionId, error_type: 'network' });
      }
    });
    throw err;
  }

  if (breaker) breaker.recordSuccess();
  const durationS = Number(process.hrtime.bigint() - fetchStart) / 1e9;
  safeMetric(() => upstreamRequestDuration.observe({ collection: collectionId, status_code: '200' }, durationS));

  // 5. Cache store
  if (deps.cache && config.cache?.ttlSeconds) {
    await deps.cache.set(collectionId, cacheKey, result, config.cache.ttlSeconds);
  }

  return result;
}

export async function fetchUpstreamItems(
  collectionId: string,
  config: CollectionConfig,
  params: FetchParams,
  deps: AdapterDeps = {},
): Promise<UpstreamPage> {
  const cacheKey = {
    offset: params.offset,
    limit: params.limit,
    bbox: params.bbox,
    upstreamParams: params.upstreamParams,
  };
  const doFetch = () => fetchWithStrategy(config, params, fetchJson);
  return executeWithMiddleware(collectionId, config, cacheKey, doFetch, deps);
}

export async function fetchUpstreamItem(
  collectionId: string,
  config: CollectionConfig,
  itemId: string,
  deps: AdapterDeps = {},
): Promise<Record<string, unknown>> {
  const doFetch = async () => {
    const body = await fetchJson(`${config.upstream.baseUrl}/${itemId}`, config.timeout);
    return getByPath(body, config.upstream.responseMapping.item) as Record<string, unknown>;
  };
  return executeWithMiddleware(collectionId, config, { itemId }, doFetch, deps);
}
