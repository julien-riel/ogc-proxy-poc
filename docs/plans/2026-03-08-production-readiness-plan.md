# Production Readiness Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make the OGC proxy production-ready for municipal deployment by adding resilience, tests, monitoring, caching, security, and documentation.

**Architecture:** Add circuit breaker + retry in the adapter layer, health checks as a periodic service, cache improvements with stale-while-revalidate, HTTP cache headers as middleware, admin dashboard as a static HTML page served by Express, and comprehensive tests using supertest with mocked registries.

**Tech Stack:** TypeScript, Express 5, Vitest, supertest, prom-client, k6, Grafana

---

### Task 1: Circuit Breaker

**Files:**
- Create: `packages/proxy/src/engine/circuit-breaker.ts`
- Create: `packages/proxy/src/engine/circuit-breaker.test.ts`
- Modify: `packages/proxy/src/engine/types.ts`

**Step 1: Add circuit breaker config to types**

In `packages/proxy/src/engine/types.ts`, add to `collectionConfigSchema` before the closing `})`:

```typescript
// In collectionConfigSchema, add after cache:
circuitBreaker: z.object({
  failureThreshold: z.number().positive().default(5),
  resetTimeoutMs: z.number().positive().default(30000),
  halfOpenRequests: z.number().positive().default(1),
}).optional(),
```

Add inferred type:
```typescript
export type CircuitBreakerConfig = z.infer<typeof circuitBreakerConfigSchema>;
```

**Step 2: Write circuit breaker tests**

Create `packages/proxy/src/engine/circuit-breaker.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CircuitBreaker, CircuitState } from './circuit-breaker.js';

describe('CircuitBreaker', () => {
  let cb: CircuitBreaker;

  beforeEach(() => {
    cb = new CircuitBreaker({ failureThreshold: 3, resetTimeoutMs: 1000, halfOpenRequests: 1 });
  });

  it('starts in closed state', () => {
    expect(cb.state).toBe(CircuitState.Closed);
  });

  it('stays closed under threshold', () => {
    cb.recordFailure();
    cb.recordFailure();
    expect(cb.state).toBe(CircuitState.Closed);
    expect(cb.canExecute()).toBe(true);
  });

  it('opens after reaching failure threshold', () => {
    for (let i = 0; i < 3; i++) cb.recordFailure();
    expect(cb.state).toBe(CircuitState.Open);
    expect(cb.canExecute()).toBe(false);
  });

  it('resets failure count on success', () => {
    cb.recordFailure();
    cb.recordFailure();
    cb.recordSuccess();
    expect(cb.state).toBe(CircuitState.Closed);
    cb.recordFailure();
    expect(cb.state).toBe(CircuitState.Closed);
  });

  it('transitions to half-open after reset timeout', () => {
    vi.useFakeTimers();
    for (let i = 0; i < 3; i++) cb.recordFailure();
    expect(cb.canExecute()).toBe(false);
    vi.advanceTimersByTime(1001);
    expect(cb.canExecute()).toBe(true);
    expect(cb.state).toBe(CircuitState.HalfOpen);
    vi.useRealTimers();
  });

  it('closes on success in half-open', () => {
    vi.useFakeTimers();
    for (let i = 0; i < 3; i++) cb.recordFailure();
    vi.advanceTimersByTime(1001);
    cb.canExecute(); // triggers half-open
    cb.recordSuccess();
    expect(cb.state).toBe(CircuitState.Closed);
    vi.useRealTimers();
  });

  it('re-opens on failure in half-open', () => {
    vi.useFakeTimers();
    for (let i = 0; i < 3; i++) cb.recordFailure();
    vi.advanceTimersByTime(1001);
    cb.canExecute(); // triggers half-open
    cb.recordFailure();
    expect(cb.state).toBe(CircuitState.Open);
    vi.useRealTimers();
  });

  it('limits concurrent requests in half-open', () => {
    vi.useFakeTimers();
    for (let i = 0; i < 3; i++) cb.recordFailure();
    vi.advanceTimersByTime(1001);
    expect(cb.canExecute()).toBe(true); // first half-open request
    expect(cb.canExecute()).toBe(false); // beyond halfOpenRequests limit
    vi.useRealTimers();
  });
});
```

**Step 3: Run tests to verify they fail**

Run: `cd packages/proxy && npx vitest run src/engine/circuit-breaker.test.ts`
Expected: FAIL — module not found

**Step 4: Implement circuit breaker**

Create `packages/proxy/src/engine/circuit-breaker.ts`:

```typescript
import { logger } from '../logger.js';

export enum CircuitState {
  Closed = 'closed',
  Open = 'open',
  HalfOpen = 'half-open',
}

export interface CircuitBreakerOptions {
  failureThreshold: number;
  resetTimeoutMs: number;
  halfOpenRequests: number;
}

export class CircuitBreaker {
  private _state = CircuitState.Closed;
  private failureCount = 0;
  private lastFailureTime = 0;
  private halfOpenAttempts = 0;
  private readonly options: CircuitBreakerOptions;

  constructor(options: CircuitBreakerOptions) {
    this.options = options;
  }

  get state(): CircuitState {
    if (this._state === CircuitState.Open && this.shouldAttemptReset()) {
      return CircuitState.HalfOpen;
    }
    return this._state;
  }

  canExecute(): boolean {
    const currentState = this.state;
    if (currentState === CircuitState.Closed) return true;
    if (currentState === CircuitState.HalfOpen) {
      if (this.halfOpenAttempts < this.options.halfOpenRequests) {
        this._state = CircuitState.HalfOpen;
        this.halfOpenAttempts++;
        return true;
      }
      return false;
    }
    return false;
  }

  recordSuccess(): void {
    this.failureCount = 0;
    this.halfOpenAttempts = 0;
    this._state = CircuitState.Closed;
  }

  recordFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();
    if (this._state === CircuitState.HalfOpen) {
      this._state = CircuitState.Open;
      this.halfOpenAttempts = 0;
      return;
    }
    if (this.failureCount >= this.options.failureThreshold) {
      this._state = CircuitState.Open;
      const log = logger.adapter();
      log.warning({ failureCount: this.failureCount }, 'circuit breaker opened');
    }
  }

  private shouldAttemptReset(): boolean {
    return Date.now() - this.lastFailureTime > this.options.resetTimeoutMs;
  }
}

const breakers = new Map<string, CircuitBreaker>();

export function getCircuitBreaker(
  collectionId: string,
  config?: CircuitBreakerOptions,
): CircuitBreaker | null {
  if (!config) return null;
  if (!breakers.has(collectionId)) {
    breakers.set(collectionId, new CircuitBreaker(config));
  }
  return breakers.get(collectionId)!;
}

/** Reset all breakers — for testing only. */
export function resetAllBreakers(): void {
  breakers.clear();
}
```

**Step 5: Run tests to verify they pass**

Run: `cd packages/proxy && npx vitest run src/engine/circuit-breaker.test.ts`
Expected: PASS

**Step 6: Commit**

```bash
git add packages/proxy/src/engine/circuit-breaker.ts packages/proxy/src/engine/circuit-breaker.test.ts packages/proxy/src/engine/types.ts
git commit -m "feat: add circuit breaker with closed/open/half-open states"
```

---

### Task 2: Retry Logic

**Files:**
- Create: `packages/proxy/src/engine/retry.ts`
- Create: `packages/proxy/src/engine/retry.test.ts`
- Modify: `packages/proxy/src/engine/types.ts`

**Step 1: Add retry config to types**

In `packages/proxy/src/engine/types.ts`, add to `collectionConfigSchema`:

```typescript
retry: z.object({
  maxAttempts: z.number().positive().default(3),
  backoffMs: z.number().positive().default(200),
  backoffMultiplier: z.number().positive().default(2),
}).optional(),
```

**Step 2: Write retry tests**

Create `packages/proxy/src/engine/retry.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { withRetry } from './retry.js';
import { UpstreamError, UpstreamTimeoutError } from './adapter.js';

describe('withRetry', () => {
  const config = { maxAttempts: 3, backoffMs: 10, backoffMultiplier: 2 };

  it('returns result on first success', async () => {
    const fn = vi.fn().mockResolvedValue('ok');
    const result = await withRetry(fn, config);
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries on 5xx upstream error', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new UpstreamError(502))
      .mockResolvedValue('ok');
    const result = await withRetry(fn, config);
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('retries on timeout', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new UpstreamTimeoutError('http://test', 5000))
      .mockResolvedValue('ok');
    const result = await withRetry(fn, config);
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('does NOT retry on 4xx errors', async () => {
    const fn = vi.fn().mockRejectedValue(new UpstreamError(404));
    await expect(withRetry(fn, config)).rejects.toThrow();
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('does NOT retry on 429', async () => {
    const fn = vi.fn().mockRejectedValue(new UpstreamError(429));
    await expect(withRetry(fn, config)).rejects.toThrow();
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('throws after exhausting retries', async () => {
    const fn = vi.fn().mockRejectedValue(new UpstreamError(500));
    await expect(withRetry(fn, config)).rejects.toThrow();
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('retries on generic network errors', async () => {
    const err = new Error('ECONNRESET');
    const fn = vi.fn()
      .mockRejectedValueOnce(err)
      .mockResolvedValue('ok');
    const result = await withRetry(fn, config);
    expect(result).toBe('ok');
  });
});
```

**Step 3: Run tests to verify they fail**

Run: `cd packages/proxy && npx vitest run src/engine/retry.test.ts`
Expected: FAIL

**Step 4: Implement retry**

Create `packages/proxy/src/engine/retry.ts`:

```typescript
import { UpstreamError, UpstreamTimeoutError } from './adapter.js';
import { logger } from '../logger.js';

export interface RetryConfig {
  maxAttempts: number;
  backoffMs: number;
  backoffMultiplier: number;
}

function isRetryable(err: unknown): boolean {
  if (err instanceof UpstreamError) {
    return err.statusCode >= 500 && err.statusCode !== 503;
  }
  if (err instanceof UpstreamTimeoutError) return true;
  if (err instanceof Error) return true; // network errors
  return false;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function withRetry<T>(fn: () => Promise<T>, config: RetryConfig): Promise<T> {
  const log = logger.adapter();
  let lastError: unknown;

  for (let attempt = 1; attempt <= config.maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt >= config.maxAttempts || !isRetryable(err)) {
        throw err;
      }
      const delay = config.backoffMs * Math.pow(config.backoffMultiplier, attempt - 1);
      log.warning({ attempt, maxAttempts: config.maxAttempts, delayMs: delay }, 'retrying upstream request');
      await sleep(delay);
    }
  }

  throw lastError;
}
```

**Step 5: Run tests, verify pass**

Run: `cd packages/proxy && npx vitest run src/engine/retry.test.ts`
Expected: PASS

**Step 6: Commit**

```bash
git add packages/proxy/src/engine/retry.ts packages/proxy/src/engine/retry.test.ts packages/proxy/src/engine/types.ts
git commit -m "feat: add retry logic with exponential backoff for upstream requests"
```

---

### Task 3: Integrate Circuit Breaker + Retry into Adapter

**Files:**
- Modify: `packages/proxy/src/engine/adapter.ts`
- Modify: `packages/proxy/src/metrics.ts`

**Step 1: Add new metrics**

In `packages/proxy/src/metrics.ts`, add:

```typescript
import { Gauge } from 'prom-client';

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
```

**Step 2: Wrap fetch calls with circuit breaker + retry in adapter**

In `packages/proxy/src/engine/adapter.ts`, modify `fetchUpstreamItems`:

- Import `getCircuitBreaker` and `withRetry`
- After rate limit check, check circuit breaker (`canExecute()`)
- If circuit breaker blocks, throw `new UpstreamError(503)`
- Wrap the fetch call with `withRetry` if retry config exists
- On success, call `breaker.recordSuccess()`
- On failure, call `breaker.recordFailure()`
- Record metrics

The same pattern for `fetchUpstreamItem`.

**Step 3: Run all tests**

Run: `cd packages/proxy && npx vitest run`
Expected: PASS (existing tests should still pass since circuit breaker/retry are optional config)

**Step 4: Commit**

```bash
git add packages/proxy/src/engine/adapter.ts packages/proxy/src/metrics.ts
git commit -m "feat: integrate circuit breaker and retry into upstream adapter"
```

---

### Task 4: Upstream Health Checks

**Files:**
- Create: `packages/proxy/src/engine/health-check.ts`
- Create: `packages/proxy/src/engine/health-check.test.ts`
- Modify: `packages/proxy/src/app.ts` (enrich `/health` and `/ready`)

**Step 1: Write health check tests**

Create `packages/proxy/src/engine/health-check.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { HealthChecker } from './health-check.js';

describe('HealthChecker', () => {
  let checker: HealthChecker;

  beforeEach(() => {
    checker = new HealthChecker();
  });

  afterEach(() => {
    checker.stop();
  });

  it('reports unknown status initially', () => {
    expect(checker.getStatus('test')).toBe('unknown');
  });

  it('reports healthy after successful check', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true });
    await checker.check('test', 'http://localhost/api');
    expect(checker.getStatus('test')).toBe('healthy');
  });

  it('reports unhealthy after failed check', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('fail'));
    await checker.check('test', 'http://localhost/api');
    expect(checker.getStatus('test')).toBe('unhealthy');
  });

  it('reports unhealthy on non-ok response', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 500 });
    await checker.check('test', 'http://localhost/api');
    expect(checker.getStatus('test')).toBe('unhealthy');
  });

  it('returns all statuses', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true });
    await checker.check('a', 'http://a');
    await checker.check('b', 'http://b');
    const all = checker.getAllStatuses();
    expect(all).toEqual({ a: 'healthy', b: 'healthy' });
  });
});
```

**Step 2: Implement health checker**

Create `packages/proxy/src/engine/health-check.ts`:

```typescript
import { logger } from '../logger.js';
import { safeMetric } from '../metrics.js';
import { Gauge } from 'prom-client';

export const upstreamHealthStatus = new Gauge({
  name: 'ogc_proxy_upstream_health_status',
  help: 'Upstream health status (1=healthy, 0=unhealthy)',
  labelNames: ['collection'] as const,
});

type HealthStatus = 'healthy' | 'unhealthy' | 'unknown';

export class HealthChecker {
  private statuses = new Map<string, HealthStatus>();
  private intervalId: ReturnType<typeof setInterval> | null = null;

  getStatus(collectionId: string): HealthStatus {
    return this.statuses.get(collectionId) ?? 'unknown';
  }

  getAllStatuses(): Record<string, HealthStatus> {
    return Object.fromEntries(this.statuses);
  }

  async check(collectionId: string, baseUrl: string): Promise<void> {
    const log = logger.adapter();
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      const response = await fetch(baseUrl, {
        method: 'HEAD',
        signal: controller.signal,
      });
      clearTimeout(timeout);
      const status: HealthStatus = response.ok ? 'healthy' : 'unhealthy';
      this.statuses.set(collectionId, status);
      safeMetric(() => upstreamHealthStatus.set({ collection: collectionId }, status === 'healthy' ? 1 : 0));
    } catch {
      this.statuses.set(collectionId, 'unhealthy');
      safeMetric(() => upstreamHealthStatus.set({ collection: collectionId }, 0));
      log.warning({ collectionId, baseUrl }, 'upstream health check failed');
    }
  }

  startPeriodic(
    collections: Record<string, { upstream: { baseUrl: string } }>,
    intervalMs = 30000,
  ): void {
    const checkAll = () => {
      for (const [id, config] of Object.entries(collections)) {
        this.check(id, config.upstream.baseUrl);
      }
    };
    checkAll();
    this.intervalId = setInterval(checkAll, intervalMs);
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }
}
```

**Step 3: Integrate into app.ts**

In `packages/proxy/src/app.ts`:
- Import `HealthChecker`
- Create instance after registry load
- Call `healthChecker.startPeriodic(getRegistry().collections)`
- Store on `app.set('healthChecker', healthChecker)`
- Enrich `/health` to include upstream statuses
- Enrich `/ready` to show degraded collections

**Step 4: Run tests, verify pass**

Run: `cd packages/proxy && npx vitest run src/engine/health-check.test.ts`

**Step 5: Commit**

```bash
git add packages/proxy/src/engine/health-check.ts packages/proxy/src/engine/health-check.test.ts packages/proxy/src/app.ts
git commit -m "feat: add periodic upstream health checks with Prometheus metrics"
```

---

### Task 5: Cache Improvements (stale-while-revalidate + pattern invalidation)

**Files:**
- Modify: `packages/proxy/src/engine/cache.ts`
- Modify: `packages/proxy/src/engine/cache.test.ts`
- Modify: `packages/proxy/src/admin/router.ts`
- Modify: `packages/proxy/src/admin/router.test.ts`

**Step 1: Write tests for new cache features**

Add to `packages/proxy/src/engine/cache.test.ts`:

```typescript
describe('CacheService.getWithStale', () => {
  it('returns fresh data when not expired', async () => {
    // Set data, then getWithStale — should return { data, stale: false }
  });

  it('returns stale data when expired', async () => {
    // Set data with 1s TTL, wait, getWithStale — should return { data, stale: true }
    // Uses a separate stale TTL key (staleTtl = ttl * 2)
  });

  it('returns null when fully expired', async () => {
    // Beyond stale TTL — returns null
  });
});

describe('CacheService.invalidateByPattern', () => {
  it('deletes keys matching pattern', async () => {
    // Set multiple keys, invalidate by pattern, verify deleted
  });
});
```

**Step 2: Implement stale-while-revalidate in cache**

Modify `packages/proxy/src/engine/cache.ts`:

- `set()` method: store with a stale TTL of `ttlSeconds * 2`, and store the actual expiry timestamp as metadata
- `getWithStale()` method: returns `{ data, stale: boolean } | null`
  - If key exists and timestamp < now: `{ data, stale: false }`
  - If key exists and timestamp >= now: `{ data, stale: true }`
  - If key doesn't exist: `null`
- `invalidateByPattern(pattern: string)`: use SCAN with the pattern

**Step 3: Add pattern invalidation to admin router**

In `packages/proxy/src/admin/router.ts`, add:

```typescript
router.delete('/cache', jwtMiddleware, async (req, res) => {
  const pattern = req.query.pattern as string;
  if (!pattern) {
    return res.status(400).json({ code: 'InvalidRequest', description: 'pattern query parameter required' });
  }
  const keysDeleted = await cache.invalidateByPattern(pattern);
  res.json({ pattern, keysDeleted });
});
```

**Step 4: Run tests, verify pass**

Run: `cd packages/proxy && npx vitest run src/engine/cache.test.ts src/admin/router.test.ts`

**Step 5: Commit**

```bash
git add packages/proxy/src/engine/cache.ts packages/proxy/src/engine/cache.test.ts packages/proxy/src/admin/router.ts packages/proxy/src/admin/router.test.ts
git commit -m "feat: add stale-while-revalidate cache and pattern-based invalidation"
```

---

### Task 6: HTTP Cache-Control Headers Middleware

**Files:**
- Create: `packages/proxy/src/middleware/cache-headers.ts`
- Create: `packages/proxy/src/middleware/cache-headers.test.ts`
- Modify: `packages/proxy/src/ogc/items.ts`
- Modify: `packages/proxy/src/wfs/router.ts`

**Step 1: Write tests**

Create `packages/proxy/src/middleware/cache-headers.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { generateETag, buildCacheControlHeader } from './cache-headers.js';

describe('generateETag', () => {
  it('generates consistent etag for same content', () => {
    const content = JSON.stringify({ test: true });
    expect(generateETag(content)).toBe(generateETag(content));
  });

  it('generates different etags for different content', () => {
    expect(generateETag('a')).not.toBe(generateETag('b'));
  });
});

describe('buildCacheControlHeader', () => {
  it('builds header from TTL', () => {
    expect(buildCacheControlHeader(300)).toBe('public, max-age=300, stale-while-revalidate=150');
  });

  it('returns no-cache when TTL is 0', () => {
    expect(buildCacheControlHeader(0)).toBe('no-cache');
  });
});
```

**Step 2: Implement**

Create `packages/proxy/src/middleware/cache-headers.ts`:

```typescript
import { createHash } from 'crypto';

export function generateETag(content: string): string {
  return `"${createHash('md5').update(content).digest('hex')}"`;
}

export function buildCacheControlHeader(ttlSeconds: number): string {
  if (!ttlSeconds) return 'no-cache';
  return `public, max-age=${ttlSeconds}, stale-while-revalidate=${Math.floor(ttlSeconds / 2)}`;
}
```

**Step 3: Add ETag + Cache-Control in items.ts response**

In `packages/proxy/src/ogc/items.ts`, after building the response JSON:
- Generate ETag from response body
- Check `If-None-Match` header — if matches, return 304
- Set `Cache-Control` header based on collection's cache TTL
- Set `ETag` header

Same pattern in WFS router for GetFeature responses.

**Step 4: Run tests, verify pass**

Run: `cd packages/proxy && npx vitest run src/middleware/cache-headers.test.ts`

**Step 5: Commit**

```bash
git add packages/proxy/src/middleware/ packages/proxy/src/ogc/items.ts packages/proxy/src/wfs/router.ts
git commit -m "feat: add HTTP Cache-Control and ETag headers"
```

---

### Task 7: HTTPS Enforcement Middleware

**Files:**
- Create: `packages/proxy/src/middleware/https-redirect.ts`
- Create: `packages/proxy/src/middleware/https-redirect.test.ts`
- Modify: `packages/proxy/src/app.ts`

**Step 1: Write tests**

```typescript
import { describe, it, expect } from 'vitest';
import express from 'express';
import request from 'supertest';
import { httpsRedirect } from './https-redirect.js';

describe('httpsRedirect', () => {
  it('redirects HTTP to HTTPS', async () => {
    const app = express();
    app.use(httpsRedirect());
    app.get('/test', (_req, res) => res.send('ok'));

    const res = await request(app).get('/test').set('X-Forwarded-Proto', 'http');
    expect(res.status).toBe(301);
    expect(res.headers.location).toMatch(/^https:\/\//);
  });

  it('allows HTTPS requests through', async () => {
    const app = express();
    app.use(httpsRedirect());
    app.get('/test', (_req, res) => res.send('ok'));

    const res = await request(app).get('/test').set('X-Forwarded-Proto', 'https');
    expect(res.status).toBe(200);
  });

  it('allows health check without HTTPS', async () => {
    const app = express();
    app.use(httpsRedirect());
    app.get('/health', (_req, res) => res.send('ok'));

    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
  });
});
```

**Step 2: Implement**

```typescript
import type { RequestHandler } from 'express';

const EXEMPT_PATHS = ['/health', '/ready', '/metrics'];

export function httpsRedirect(): RequestHandler {
  return (req, res, next) => {
    if (EXEMPT_PATHS.includes(req.path)) return next();
    const proto = req.get('X-Forwarded-Proto') || req.protocol;
    if (proto === 'https') return next();
    const host = req.get('Host') || 'localhost';
    res.redirect(301, `https://${host}${req.originalUrl}`);
  };
}
```

**Step 3: Add to app.ts conditionally**

In `packages/proxy/src/app.ts`, after helmet:
```typescript
if (process.env.ENFORCE_HTTPS === 'true') {
  app.use(httpsRedirect());
}
```

**Step 4: Run tests, commit**

```bash
git add packages/proxy/src/middleware/https-redirect.ts packages/proxy/src/middleware/https-redirect.test.ts packages/proxy/src/app.ts
git commit -m "feat: add optional HTTPS enforcement middleware"
```

---

### Task 8: Admin Status Endpoint + Dashboard

**Files:**
- Modify: `packages/proxy/src/admin/router.ts`
- Create: `packages/proxy/src/admin/dashboard.ts`
- Modify: `packages/proxy/src/admin/router.test.ts`

**Step 1: Add `/admin/status` endpoint**

In `packages/proxy/src/admin/router.ts`, add a new endpoint that aggregates:
- Collection list with upstream health status (from healthChecker)
- Circuit breaker states per collection (from circuitBreaker registry)
- Cache stats (from Redis INFO or metrics)
- Global status (healthy/degraded based on upstream health)

```typescript
router.get('/status', jwtMiddleware, (req, res) => {
  const healthChecker = req.app.get('healthChecker') as HealthChecker;
  const registry = getRegistry();
  const collections = Object.entries(registry.collections).map(([id, config]) => ({
    id,
    title: config.title,
    upstream: healthChecker?.getStatus(id) ?? 'unknown',
    circuitBreaker: getCircuitBreaker(id, config.circuitBreaker)?.state ?? 'none',
  }));
  const hasUnhealthy = collections.some(c => c.upstream === 'unhealthy');
  res.json({
    status: hasUnhealthy ? 'degraded' : 'healthy',
    collections,
    timestamp: new Date().toISOString(),
  });
});
```

**Step 2: Create admin dashboard HTML**

Create `packages/proxy/src/admin/dashboard.ts` that exports a function returning an HTML string:
- Status overview (green/yellow/red)
- Collections table with upstream health + circuit breaker state
- Auto-refresh every 10s via `fetch('/admin/status')`
- Clean CSS inline, no external dependencies
- Dark/light mode support via `prefers-color-scheme`

**Step 3: Serve dashboard**

```typescript
router.get('/dashboard', (req, res) => {
  res.set('Content-Type', 'text/html');
  res.send(buildDashboardHtml());
});
```

**Step 4: Add tests for `/admin/status`**

**Step 5: Run tests, commit**

```bash
git add packages/proxy/src/admin/
git commit -m "feat: add admin status endpoint and dashboard UI"
```

---

### Task 9: OGC Endpoint Tests

**Files:**
- Modify: `packages/proxy/src/ogc/items.test.ts` (expand significantly)
- Create: `packages/proxy/src/ogc/collections.test.ts`
- Create: `packages/proxy/src/ogc/landing.test.ts`

**Step 1: Write collections tests**

Create `packages/proxy/src/ogc/collections.test.ts` using supertest pattern from admin router test:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createOgcRouter } from './router.js';

// Mock registry module
vi.mock('../engine/registry.js', () => ({
  getRegistry: () => ({
    collections: {
      'bornes-fontaines': {
        title: 'Bornes-fontaines',
        description: 'Test',
        properties: [],
        geometry: { type: 'Point' },
        idField: 'id',
        upstream: { baseUrl: 'http://test', method: 'GET', pagination: { type: 'offset-limit', offsetParam: 'offset', limitParam: 'limit' }, responseMapping: { items: 'data', total: 'total', item: '.' } },
      },
    },
  }),
  getCollection: (id: string) => { /* return from mock */ },
  getCollectionPlugin: vi.fn().mockResolvedValue(null),
}));

describe('GET /ogc/collections', () => {
  it('returns collection list', async () => { /* test */ });
  it('includes proper links', async () => { /* test */ });
});

describe('GET /ogc/collections/:id', () => {
  it('returns collection by id', async () => { /* test */ });
  it('returns 404 for unknown collection', async () => { /* test */ });
});
```

**Step 2: Write landing tests**

```typescript
describe('GET /ogc/', () => {
  it('returns landing page with required links', async () => { /* test links: self, service-desc, conformance, data */ });
});

describe('GET /ogc/conformance', () => {
  it('returns conformance classes', async () => { /* test conformsTo array */ });
});
```

**Step 3: Expand items.test.ts with integration tests**

Add supertest-based tests to `items.test.ts`:

```typescript
describe('GET /ogc/collections/:id/items (integration)', () => {
  it('returns 404 for unknown collection');
  it('returns GeoJSON FeatureCollection');
  it('respects limit parameter');
  it('returns 400 for invalid filter-lang');
  it('returns 400 for filter exceeding max length');
  it('returns 502 on upstream error');
  it('returns 504 on upstream timeout');
  it('returns 429 on rate limit');
});
```

**Step 4: Run tests, check coverage**

Run: `cd packages/proxy && npx vitest run --coverage`
Target: OGC routes should now be 60%+

**Step 5: Commit**

```bash
git add packages/proxy/src/ogc/*.test.ts
git commit -m "test: add comprehensive OGC endpoint tests"
```

---

### Task 10: WFS Endpoint Tests

**Files:**
- Create: `packages/proxy/src/wfs/router.test.ts`
- Create: `packages/proxy/src/wfs/describe.test.ts`
- Create: `packages/proxy/src/wfs/capabilities.test.ts`

**Step 1: Write WFS router tests**

```typescript
describe('WFS Router GET', () => {
  it('returns capabilities XML for GetCapabilities');
  it('returns WFS 2.0 capabilities when version=2.0.0');
  it('returns WFS 1.1 capabilities by default');
  it('returns 400 for unknown request type');
  it('returns describe feature type for valid type name');
  it('returns 404 for unknown type name');
  it('returns GeoJSON for GetFeature');
  it('returns 502 on upstream error');
  it('returns 504 on timeout');
  it('returns 429 on rate limit');
});

describe('WFS Router POST', () => {
  it('returns 400 for empty body');
  it('parses GetFeature XML POST');
});
```

**Step 2: Write describe tests**

```typescript
describe('buildDescribeFeatureType', () => {
  it('returns null for unknown type');
  it('returns schema with geometry and properties');
  it('maps property types correctly');
});
```

**Step 3: Write capabilities tests**

```typescript
describe('buildCapabilitiesXml', () => {
  it('generates valid WFS 1.1 capabilities');
  it('includes all collections as FeatureTypes');
});

describe('buildCapabilities20Xml', () => {
  it('generates valid WFS 2.0 capabilities');
});
```

**Step 4: Run tests, check coverage**

Run: `cd packages/proxy && npx vitest run --coverage`
Target: WFS routes should now be 60%+, global should exceed 65% threshold

**Step 5: Commit**

```bash
git add packages/proxy/src/wfs/*.test.ts
git commit -m "test: add comprehensive WFS endpoint tests"
```

---

### Task 11: Prometheus Alerting Rules

**Files:**
- Create: `deploy/prometheus/alerts.yml`

**Step 1: Write alerting rules**

```yaml
groups:
  - name: ogc-proxy
    rules:
      - alert: ProxyUpstreamDown
        expr: ogc_proxy_upstream_health_status == 0
        for: 2m
        labels:
          severity: warning
        annotations:
          summary: "Upstream {{ $labels.collection }} is down"

      - alert: ProxyHighErrorRate
        expr: rate(http_requests_total{status_code=~"5.."}[5m]) / rate(http_requests_total[5m]) > 0.05
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: "Error rate above 5%"

      - alert: ProxyHighLatency
        expr: histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m])) > 2
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "P95 latency above 2s"

      - alert: ProxyCircuitBreakerOpen
        expr: ogc_proxy_circuit_breaker_state == 1
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: "Circuit breaker open for {{ $labels.collection }}"

      - alert: ProxyCacheHitRateLow
        expr: rate(ogc_proxy_cache_operations_total{result="hit"}[15m]) / rate(ogc_proxy_cache_operations_total[15m]) < 0.5
        for: 15m
        labels:
          severity: warning
        annotations:
          summary: "Cache hit rate below 50%"

      - alert: ProxyRateLimitExceeded
        expr: rate(ogc_proxy_rate_limit_rejections_total[5m]) * 60 > 100
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "Rate limit triggered >100/min"
```

**Step 2: Commit**

```bash
git add deploy/prometheus/alerts.yml
git commit -m "feat: add Prometheus alerting rules for production monitoring"
```

---

### Task 12: Grafana Dashboard

**Files:**
- Create: `deploy/grafana/dashboard.json`

**Step 1: Create comprehensive Grafana dashboard JSON**

Build a dashboard with 4 rows:
1. **Overview**: requests/s, latency p50/p95/p99, error rate, active collections
2. **Upstream**: health status per collection, circuit breaker states, retry rates
3. **Cache**: hit ratio, operations/s, stale serves
4. **Rate Limiting**: rejections by client, by collection

Use standard Grafana dashboard JSON format with Prometheus datasource.

**Step 2: Commit**

```bash
git add deploy/grafana/dashboard.json
git commit -m "feat: add Grafana dashboard for OGC proxy monitoring"
```

---

### Task 13: k6 Load Tests

**Files:**
- Create: `packages/load-tests/package.json`
- Create: `packages/load-tests/scripts/smoke.js`
- Create: `packages/load-tests/scripts/load.js`
- Create: `packages/load-tests/scripts/stress.js`

**Step 1: Create package.json**

```json
{
  "name": "@ogc-proxy/load-tests",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "smoke": "k6 run scripts/smoke.js",
    "load": "k6 run scripts/load.js",
    "stress": "k6 run scripts/stress.js"
  }
}
```

**Step 2: Write k6 scripts**

Smoke test (1 VU, 30s):
```javascript
import http from 'k6/http';
import { check } from 'k6';

export const options = {
  vus: 1,
  duration: '30s',
  thresholds: {
    http_req_duration: ['p(95)<500'],
    http_req_failed: ['rate<0.01'],
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';

export default function () {
  const collections = http.get(`${BASE_URL}/ogc/collections`);
  check(collections, { 'collections 200': (r) => r.status === 200 });

  const items = http.get(`${BASE_URL}/ogc/collections/bornes-fontaines/items?limit=10`);
  check(items, { 'items 200': (r) => r.status === 200 });
}
```

Load test (50 VU, 5m) and stress test (200 VU ramp, 10m) follow the same pattern with different options.

**Step 3: Commit**

```bash
git add packages/load-tests/
git commit -m "feat: add k6 load test scripts (smoke, load, stress)"
```

---

### Task 14: CI Security Audit

**Files:**
- Modify: `.github/workflows/ci.yml`

**Step 1: Add audit job**

```yaml
  security-audit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6
      - uses: actions/setup-node@v6
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: npm audit --audit-level=high
```

**Step 2: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: add npm security audit to CI pipeline"
```

---

### Task 15: Runbooks

**Files:**
- Create: `docs/runbooks.md`

Write operational runbooks covering:
1. **Upstream not responding** — check `/admin/status`, check circuit breaker state, check upstream health metrics, try manual cache serve, escalation
2. **High latency** — identify slow collection via Grafana, check cache hit ratio, check upstream response times, increase cache TTL
3. **5xx errors spike** — check logs, check upstream errors, check circuit breaker, restart if needed
4. **Emergency cache invalidation** — `DELETE /admin/cache/{collection}` or `DELETE /admin/cache?pattern=*`
5. **Deployment / rollback** — Docker pull, health check verification, rollback procedure

**Commit:**
```bash
git add docs/runbooks.md
git commit -m "docs: add operational runbooks for production"
```

---

### Task 16: Architecture Documentation

**Files:**
- Create: `docs/architecture.md`

Write with Mermaid diagrams:
1. **Request flow**: Client → Express → JWT → Rate Limit → OGC/WFS Router → Adapter → Circuit Breaker → Retry → Cache → Upstream API
2. **Component diagram**: All internal modules and their relationships
3. **Deployment diagram**: Docker/K8s with Redis, Prometheus, Grafana

**Commit:**
```bash
git add docs/architecture.md
git commit -m "docs: add architecture documentation with Mermaid diagrams"
```

---

### Task 17: Plugin Development Guide

**Files:**
- Create: `docs/plugin-development.md`

Cover:
1. Plugin interface (`CollectionPlugin` type)
2. Hook lifecycle and execution order
3. Step-by-step example: creating a custom transformer
4. Configuration in `collections.yaml`
5. Testing plugins
6. Best practices (keep hooks pure, handle errors, don't block)

**Commit:**
```bash
git add docs/plugin-development.md
git commit -m "docs: add plugin development guide"
```

---

### Task 18: Final — Update Coverage Thresholds + Verify

**Files:**
- Modify: `packages/proxy/vitest.config.ts`

**Step 1: Raise coverage thresholds**

```typescript
thresholds: {
  lines: 65,
  functions: 70,
},
```

**Step 2: Run full test suite with coverage**

Run: `cd packages/proxy && npx vitest run --coverage`
Expected: All thresholds met

**Step 3: Run lint**

Run: `npm run lint`
Expected: No errors

**Step 4: Run build**

Run: `npm run build`
Expected: Clean build

**Step 5: Commit**

```bash
git add packages/proxy/vitest.config.ts
git commit -m "chore: raise test coverage thresholds to 70% functions"
```
