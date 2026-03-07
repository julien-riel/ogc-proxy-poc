# Production Readiness (P0+P1) Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Harden the OGC proxy for production by adding structured logging, timeouts, request limits, config validation, rate limiting, and security headers.

**Architecture:** All changes go into existing files. New npm deps: `zod`, `helmet`, `express-rate-limit`. Logger uses `@villedemontreal/logger` + `@villedemontreal/correlation-id` (already installed). Zod schemas replace existing TS interfaces in `types.ts`.

**Tech Stack:** TypeScript, Express 4, vitest, zod, helmet, express-rate-limit, @villedemontreal/logger, @villedemontreal/correlation-id

---

## Task 1: Install new dependencies

**Files:**
- Modify: `packages/proxy/package.json`

**Step 1: Install deps**

Run:
```bash
npm install zod helmet express-rate-limit -w packages/proxy
npm install @types/helmet -D -w packages/proxy 2>/dev/null || true
```

**Step 2: Verify installation**

Run: `node -e "require('zod'); require('helmet'); require('express-rate-limit'); console.log('OK')"`
Expected: `OK`

**Step 3: Commit**

```bash
git add packages/proxy/package.json package-lock.json
git commit -m "chore: add zod, helmet, express-rate-limit dependencies"
```

---

## Task 2: Zod config validation (P1-6)

Replace TypeScript interfaces in `types.ts` with Zod schemas. Validate at load time in `registry.ts`.

**Files:**
- Modify: `packages/proxy/src/engine/types.ts`
- Modify: `packages/proxy/src/engine/registry.ts`
- Test: `packages/proxy/src/engine/registry.test.ts`

**Step 1: Write failing tests for config validation**

Add to `packages/proxy/src/engine/registry.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { loadRegistry } from './registry.js';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { writeFileSync, mkdirSync, rmSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));

describe('config validation', () => {
  const tmpDir = resolve(__dirname, '__test_configs__');

  function writeConfig(name: string, content: string): string {
    mkdirSync(tmpDir, { recursive: true });
    const p = resolve(tmpDir, name);
    writeFileSync(p, content);
    return p;
  }

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('rejects config with missing collections', () => {
    const path = writeConfig('bad.yaml', 'defaults:\n  maxPageSize: 10\n');
    expect(() => loadRegistry(path)).toThrow();
  });

  it('rejects config with invalid upstream URL', () => {
    const path = writeConfig('bad-url.yaml', `
collections:
  test:
    title: Test
    upstream:
      baseUrl: "not-a-url"
      method: GET
      pagination:
        type: offset-limit
        offsetParam: offset
        limitParam: limit
      responseMapping:
        items: data
        total: total
        item: data
    geometry:
      type: Point
      xField: x
      yField: y
    idField: id
    properties: []
`);
    expect(() => loadRegistry(path)).toThrow();
  });

  it('accepts valid config', () => {
    const path = writeConfig('good.yaml', `
collections:
  test:
    title: Test
    upstream:
      baseUrl: "http://localhost:3001/api/test"
      method: GET
      pagination:
        type: offset-limit
        offsetParam: offset
        limitParam: limit
      responseMapping:
        items: data
        total: total
        item: data
    geometry:
      type: Point
      xField: x
      yField: y
    idField: id
    properties: []
`);
    const reg = loadRegistry(path);
    expect(reg.collections.test).toBeDefined();
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npm test -w packages/proxy -- --reporter=verbose 2>&1 | tail -20`
Expected: At least one FAIL (missing validation means bad config passes)

**Step 3: Replace interfaces with Zod schemas in `types.ts`**

Replace the entire content of `packages/proxy/src/engine/types.ts` with:

```typescript
import { z } from 'zod';

const upstreamPropertyMappingSchema = z.object({
  param: z.string().optional(),
  operators: z.array(z.string()).optional(),
  sortParam: z.string().optional(),
  sortDesc: z.string().optional(),
});

const propertyConfigSchema = z.object({
  name: z.string(),
  type: z.string(),
  filterable: z.boolean().optional(),
  sortable: z.boolean().optional(),
  upstream: upstreamPropertyMappingSchema.optional(),
});

const offsetLimitPaginationSchema = z.object({
  type: z.literal('offset-limit'),
  offsetParam: z.string(),
  limitParam: z.string(),
});

const pagePaginationSchema = z.object({
  type: z.literal('page-pageSize'),
  pageParam: z.string(),
  pageSizeParam: z.string(),
});

const cursorPaginationSchema = z.object({
  type: z.literal('cursor'),
  cursorParam: z.string(),
  limitParam: z.string(),
  nextCursorField: z.string(),
});

const paginationConfigSchema = z.discriminatedUnion('type', [
  offsetLimitPaginationSchema,
  pagePaginationSchema,
  cursorPaginationSchema,
]);

const collectionConfigSchema = z.object({
  title: z.string(),
  description: z.string().optional(),
  plugin: z.string().optional(),
  maxPageSize: z.number().positive().optional(),
  maxFeatures: z.number().positive().optional(),
  timeout: z.number().positive().optional(),
  maxPostFetchItems: z.number().positive().optional(),
  extent: z.object({
    spatial: z.tuple([z.number(), z.number(), z.number(), z.number()]),
  }).optional(),
  upstream: z.object({
    type: z.enum(['rest', 'wfs']).optional(),
    baseUrl: z.string().url(),
    method: z.string(),
    pagination: paginationConfigSchema,
    responseMapping: z.object({
      items: z.string(),
      total: z.string().nullable(),
      item: z.string(),
    }),
    spatialCapabilities: z.array(z.string()).optional(),
    typeName: z.string().optional(),
    version: z.string().optional(),
  }),
  geometry: z.object({
    type: z.enum(['Point', 'LineString', 'Polygon']),
    xField: z.string().optional(),
    yField: z.string().optional(),
    coordsField: z.string().optional(),
    wktField: z.string().optional(),
  }),
  idField: z.string(),
  properties: z.array(propertyConfigSchema),
});

const defaultsConfigSchema = z.object({
  maxPageSize: z.number().positive().optional(),
  maxFeatures: z.number().positive().optional(),
  maxPostFetchItems: z.number().positive().optional(),
});

const jwtConfigSchema = z.object({
  enabled: z.boolean(),
  host: z.string(),
  endpoint: z.string().optional(),
});

const securityConfigSchema = z.object({
  jwt: jwtConfigSchema.optional(),
});

export const registryConfigSchema = z.object({
  defaults: defaultsConfigSchema.optional(),
  security: securityConfigSchema.optional(),
  collections: z.record(z.string(), collectionConfigSchema),
});

export type UpstreamPropertyMapping = z.infer<typeof upstreamPropertyMappingSchema>;
export type PropertyConfig = z.infer<typeof propertyConfigSchema>;
export type OffsetLimitPagination = z.infer<typeof offsetLimitPaginationSchema>;
export type PagePagination = z.infer<typeof pagePaginationSchema>;
export type CursorPagination = z.infer<typeof cursorPaginationSchema>;
export type PaginationConfig = z.infer<typeof paginationConfigSchema>;
export type CollectionConfig = z.infer<typeof collectionConfigSchema>;
export type DefaultsConfig = z.infer<typeof defaultsConfigSchema>;
export type JwtConfig = z.infer<typeof jwtConfigSchema>;
export type SecurityConfig = z.infer<typeof securityConfigSchema>;
export type RegistryConfig = z.infer<typeof registryConfigSchema>;
```

**Step 4: Add validation to `registry.ts`**

In `packages/proxy/src/engine/registry.ts`, add the import and validation:

```typescript
import { registryConfigSchema } from './types.js';
```

In `loadRegistry()`, replace `registry = substituteEnvVars(parsed) as RegistryConfig;` with:

```typescript
const substituted = substituteEnvVars(parsed);
registry = registryConfigSchema.parse(substituted);
```

**Step 5: Run tests**

Run: `npm test -w packages/proxy -- --reporter=verbose 2>&1 | tail -30`
Expected: All tests PASS

**Step 6: Commit**

```bash
git add packages/proxy/src/engine/types.ts packages/proxy/src/engine/registry.ts packages/proxy/src/engine/registry.test.ts
git commit -m "feat: add zod config validation with fail-fast on invalid config"
```

---

## Task 3: Structured logging (P0-1)

Initialize `@villedemontreal/logger` and `@villedemontreal/correlation-id`. Add request logging middleware, upstream logging, and error logging.

**Files:**
- Create: `packages/proxy/src/logger.ts`
- Modify: `packages/proxy/src/app.ts`
- Modify: `packages/proxy/src/engine/adapter.ts`
- Modify: `packages/proxy/src/ogc/items.ts`
- Modify: `packages/proxy/src/wfs/router.ts`
- Modify: `packages/proxy/src/index.ts`

**Step 1: Create logger module**

Create `packages/proxy/src/logger.ts`:

```typescript
import { createLogger, initLogger, LoggerConfigs } from '@villedemontreal/logger';
import { correlationIdService, createCorrelationIdMiddleware } from '@villedemontreal/correlation-id';
import { init as initCorrelationId } from '@villedemontreal/correlation-id';

let initialized = false;

export function initLogging(): void {
  if (initialized) return;

  const config = new LoggerConfigs(() => {
    try {
      return correlationIdService.getId();
    } catch {
      return 'no-correlation-id';
    }
  });

  config.setLogLevel(process.env.LOG_LEVEL === 'debug' ? 0 : 1); // 0=DEBUG, 1=INFO
  config.setLogHumanReadableinConsole(process.env.NODE_ENV !== 'production');

  initLogger(config);
  initCorrelationId(createLogger);
  initialized = true;
}

export const logger = {
  app: () => createLogger('app'),
  adapter: () => createLogger('adapter'),
  items: () => createLogger('items'),
  wfs: () => createLogger('wfs'),
  registry: () => createLogger('registry'),
};

export { createCorrelationIdMiddleware };
```

**Step 2: Wire logging into `app.ts`**

Add to `packages/proxy/src/app.ts` after imports:

```typescript
import { initLogging, logger, createCorrelationIdMiddleware } from './logger.js';
```

Inside `createApp()`, before `const app = express();`:

```typescript
initLogging();
const log = logger.app();
```

After `const app = express();`, add middleware (before routes):

```typescript
app.use(createCorrelationIdMiddleware());
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    log.info({
      method: req.method,
      path: req.path,
      query: req.query,
      status: res.statusCode,
      durationMs: Date.now() - start,
    }, `${req.method} ${req.path} ${res.statusCode}`);
  });
  next();
});
```

**Step 3: Add upstream logging to `adapter.ts`**

In `packages/proxy/src/engine/adapter.ts`, add import:

```typescript
import { logger } from '../logger.js';
```

In `fetchJson()`, wrap the fetch with logging:

```typescript
async function fetchJson(url: string, timeoutMs?: number): Promise<Record<string, unknown>> {
  const log = logger.adapter();
  const start = Date.now();
  try {
    const response = await fetch(url);
    const durationMs = Date.now() - start;
    log.info({ url, status: response.status, durationMs }, `upstream ${response.status} in ${durationMs}ms`);
    if (!response.ok) {
      throw new UpstreamError(response.status);
    }
    return response.json() as Promise<Record<string, unknown>>;
  } catch (err) {
    const durationMs = Date.now() - start;
    log.error({ url, durationMs, err }, 'upstream fetch failed');
    throw err;
  }
}
```

Similarly update `fetchWfsUpstream()` to log the WFS fetch.

**Step 4: Add error logging to `items.ts`**

In `packages/proxy/src/ogc/items.ts`, add import:

```typescript
import { logger } from '../logger.js';
```

In the catch block of `getItems()` (line ~336):

```typescript
} catch (err) {
  const log = logger.items();
  log.error({ err, collectionId, query: req.query }, 'getItems failed');
  const message = err instanceof Error ? err.message : 'Unknown error';
  res.status(502).json({ code: 'UpstreamError', description: 'An upstream error occurred' });
}
```

Same pattern for `getItem()`.

**Step 5: Add error logging to `wfs/router.ts`**

In `packages/proxy/src/wfs/router.ts`, add import:

```typescript
import { logger } from '../logger.js';
```

In catch blocks, log the error and sanitize:

```typescript
} catch (err) {
  const log = logger.wfs();
  log.error({ err, query: req.query }, 'WFS GetFeature failed');
  return res.status(502).json({ error: 'An upstream error occurred' });
}
```

**Step 6: Update `index.ts`**

In `packages/proxy/src/index.ts`, add logger for startup:

```typescript
import { initLogging, logger } from './logger.js';

initLogging();
const log = logger.app();
```

Replace `console.log`:

```typescript
app.listen(PORT, () => {
  log.info(`OGC Proxy running on port ${PORT}`);
});
```

**Step 7: Run tests**

Run: `npm test -w packages/proxy -- --reporter=verbose 2>&1 | tail -20`
Expected: All tests PASS

**Step 8: Commit**

```bash
git add packages/proxy/src/logger.ts packages/proxy/src/app.ts packages/proxy/src/engine/adapter.ts packages/proxy/src/ogc/items.ts packages/proxy/src/wfs/router.ts packages/proxy/src/index.ts
git commit -m "feat: add structured logging with correlation IDs"
```

---

## Task 4: Upstream timeouts (P0-2)

**Files:**
- Modify: `packages/proxy/src/engine/adapter.ts`
- Test: `packages/proxy/src/engine/adapter.test.ts`

**Step 1: Write failing test for timeout**

Add to `packages/proxy/src/engine/adapter.test.ts`:

```typescript
describe('timeout', () => {
  it('throws on timeout', async () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise((resolve) => setTimeout(resolve, 60000))));
    const configWithTimeout = { ...offsetLimitConfig, timeout: 50 };
    await expect(fetchUpstreamItems(configWithTimeout, { offset: 0, limit: 10 }))
      .rejects.toThrow();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -w packages/proxy -- --reporter=verbose -t "timeout" 2>&1 | tail -10`
Expected: FAIL (hangs or passes without abort)

**Step 3: Add AbortController to fetch calls**

In `packages/proxy/src/engine/adapter.ts`, update `fetchJson`:

```typescript
const DEFAULT_TIMEOUT_MS = 15_000;

async function fetchJson(url: string, timeoutMs?: number): Promise<Record<string, unknown>> {
  const log = logger.adapter();
  const start = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs ?? DEFAULT_TIMEOUT_MS);

  try {
    const response = await fetch(url, { signal: controller.signal });
    const durationMs = Date.now() - start;
    log.info({ url, status: response.status, durationMs }, `upstream ${response.status} in ${durationMs}ms`);
    if (!response.ok) {
      throw new UpstreamError(response.status);
    }
    return response.json() as Promise<Record<string, unknown>>;
  } catch (err) {
    const durationMs = Date.now() - start;
    if (err instanceof DOMException && err.name === 'AbortError') {
      log.error({ url, durationMs, timeoutMs: timeoutMs ?? DEFAULT_TIMEOUT_MS }, 'upstream timeout');
      throw new UpstreamTimeoutError(url, timeoutMs ?? DEFAULT_TIMEOUT_MS);
    }
    log.error({ url, durationMs, err }, 'upstream fetch failed');
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}
```

Add the error class:

```typescript
export class UpstreamTimeoutError extends Error {
  constructor(public readonly url: string, public readonly timeoutMs: number) {
    super(`Upstream timeout after ${timeoutMs}ms`);
  }
}
```

Pass `config.timeout` to all `fetchJson` calls and to the WFS fetch in `fetchWfsUpstream`.

In `fetchOffsetLimit`, `fetchPageBased`, `fetchCursorBased`: pass `config.timeout` to `fetchJson()`.

In `fetchWfsUpstream`: add the same AbortController pattern with `config.timeout`.

**Step 4: Handle timeout in route handlers**

In `packages/proxy/src/ogc/items.ts` and `packages/proxy/src/wfs/router.ts`, import `UpstreamTimeoutError`:

```typescript
import { UpstreamTimeoutError } from '../engine/adapter.js';
```

In catch blocks, check for timeout:

```typescript
if (err instanceof UpstreamTimeoutError) {
  return res.status(504).json({ code: 'GatewayTimeout', description: 'Upstream request timed out' });
}
```

**Step 5: Run tests**

Run: `npm test -w packages/proxy -- --reporter=verbose 2>&1 | tail -20`
Expected: All PASS

**Step 6: Commit**

```bash
git add packages/proxy/src/engine/adapter.ts packages/proxy/src/engine/adapter.test.ts packages/proxy/src/ogc/items.ts packages/proxy/src/wfs/router.ts
git commit -m "feat: add configurable upstream timeouts with 504 response"
```

---

## Task 5: Post-fetch limit (P0-3)

**Files:**
- Modify: `packages/proxy/src/wfs/get-feature.ts:153-155`
- Modify: `packages/proxy/src/ogc/items.ts:286-291`
- Test: `packages/proxy/src/wfs/get-feature.ts` (existing tests)

**Step 1: Cap the post-fetch multiplier in `get-feature.ts`**

In `packages/proxy/src/wfs/get-feature.ts`, around line 153:

Replace:
```typescript
const fetchLimit = params.filterNode
  ? params.maxFeatures * 10
  : params.maxFeatures;
```

With:
```typescript
const DEFAULT_MAX_POST_FETCH_ITEMS = 5000;
const maxPostFetch = config.maxPostFetchItems ?? DEFAULT_MAX_POST_FETCH_ITEMS;
const fetchLimit = params.filterNode
  ? Math.min(params.maxFeatures * 10, maxPostFetch)
  : params.maxFeatures;
```

**Step 2: Cap in `items.ts` for OGC route**

In `packages/proxy/src/ogc/items.ts`, in `getItems()`, the fetch currently uses `limit` directly. When there's a post-fetch filter (cqlAst or postFetchSimpleAst), overfetch with cap:

After `const { limit, offset, bbox, ... }` block, before the fetch:

```typescript
const DEFAULT_MAX_POST_FETCH_ITEMS = 5000;
const maxPostFetch = config.maxPostFetchItems ?? registry.defaults?.maxPostFetchItems ?? DEFAULT_MAX_POST_FETCH_ITEMS;
const needsPostFetch = !!(cqlAst || postFetchSimpleAst);
const fetchLimit = needsPostFetch
  ? Math.min(limit * 10, maxPostFetch)
  : limit;
```

Use `fetchLimit` instead of `ogcReq.limit` in the `fetchUpstreamItems` call.

**Step 3: Add warning when cap limits results**

After filtering, if `needsPostFetch && features.length < limit`:

```typescript
if (needsPostFetch && features.length < limit) {
  res.set('OGC-Warning', 'Post-fetch filter may have limited results');
}
```

**Step 4: Run tests**

Run: `npm test -w packages/proxy -- --reporter=verbose 2>&1 | tail -20`
Expected: All PASS

**Step 5: Commit**

```bash
git add packages/proxy/src/wfs/get-feature.ts packages/proxy/src/ogc/items.ts
git commit -m "feat: cap post-fetch filtering to maxPostFetchItems (default 5000)"
```

---

## Task 6: Request size limits (P0-4)

**Files:**
- Modify: `packages/proxy/src/wfs/router.ts:18`
- Modify: `packages/proxy/src/app.ts`
- Modify: `packages/proxy/src/ogc/items.ts`
- Modify: `packages/proxy/src/engine/cql2/parser.ts`
- Modify: `packages/proxy/src/wfs/get-feature.ts:10-14`

**Step 1: Write failing test for AST depth limit**

Add to `packages/proxy/src/engine/cql2/parser.test.ts`:

```typescript
describe('depth limit', () => {
  it('rejects deeply nested expressions', () => {
    // Build an expression with 25 levels of nesting: (((((...a = 1...)))))
    let expr = 'a = 1';
    for (let i = 0; i < 25; i++) {
      expr = `(${expr}) AND (b = ${i})`;
    }
    expect(() => parseCql2(expr)).toThrow(/depth/i);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -w packages/proxy -- --reporter=verbose -t "depth" 2>&1 | tail -10`
Expected: FAIL (currently no depth limit)

**Step 3: Add depth tracking to CQL2 parser**

In `packages/proxy/src/engine/cql2/parser.ts`, add to the `Parser` class:

```typescript
private depth = 0;
private static readonly MAX_DEPTH = 20;
```

In `parsePrimary()`, where parenthesized expressions are handled (line ~70):

```typescript
if (token.type === 'LPAREN') {
  this.depth++;
  if (this.depth > Parser.MAX_DEPTH) {
    throw new Error(`Filter depth exceeds maximum of ${Parser.MAX_DEPTH}`);
  }
  this.advance();
  const node = this.parseOr();
  this.expect('RPAREN');
  this.depth--;
  return node;
}
```

**Step 4: Add body size limits**

In `packages/proxy/src/wfs/router.ts` line 18, change:
```typescript
router.use(express.text({ type: ['application/xml', 'text/xml'] }));
```
to:
```typescript
router.use(express.text({ type: ['application/xml', 'text/xml'], limit: '100kb' }));
```

In `packages/proxy/src/app.ts`, add after `app.use(cors())`:
```typescript
app.use(express.json({ limit: '100kb' }));
```

**Step 5: Add filter length limit**

In `packages/proxy/src/ogc/items.ts`, in `parseItemsRequest()`, before parsing the filter (around line 161):

```typescript
const MAX_FILTER_LENGTH = 4096;
if (filterStr && filterStr.length > MAX_FILTER_LENGTH) {
  return {
    error: {
      status: 400,
      body: {
        code: 'InvalidFilter',
        description: `Filter exceeds maximum length of ${MAX_FILTER_LENGTH} characters`,
      },
    },
  };
}
```

Same check in `packages/proxy/src/wfs/get-feature.ts` `parseGetFeatureGet()` for `cql_filter`.

**Step 6: Disable XML entity expansion**

In `packages/proxy/src/wfs/get-feature.ts`, line 10-14, update the XMLParser config:

```typescript
const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  removeNSPrefix: true,
  processEntities: false,
});
```

**Step 7: Run tests**

Run: `npm test -w packages/proxy -- --reporter=verbose 2>&1 | tail -20`
Expected: All PASS

**Step 8: Commit**

```bash
git add packages/proxy/src/wfs/router.ts packages/proxy/src/app.ts packages/proxy/src/ogc/items.ts packages/proxy/src/engine/cql2/parser.ts packages/proxy/src/engine/cql2/parser.test.ts packages/proxy/src/wfs/get-feature.ts
git commit -m "feat: add request size limits, filter length cap, and AST depth limit"
```

---

## Task 7: Graceful shutdown (P0-5)

**Files:**
- Modify: `packages/proxy/src/index.ts`

**Step 1: Implement graceful shutdown**

Replace `packages/proxy/src/index.ts`:

```typescript
import { createApp } from './app.js';
import { initLogging, logger } from './logger.js';

const PORT = process.env.PORT || 3000;
const SHUTDOWN_TIMEOUT_MS = 30_000;

initLogging();
const log = logger.app();

const app = await createApp();
const server = app.listen(PORT, () => {
  log.info(`OGC Proxy running on port ${PORT}`);
});

function shutdown(signal: string) {
  log.info(`${signal} received, starting graceful shutdown`);

  server.close(() => {
    log.info('All connections drained, exiting');
    process.exit(0);
  });

  setTimeout(() => {
    log.warning('Shutdown timeout reached, forcing exit');
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
```

**Step 2: Run tests**

Run: `npm test -w packages/proxy -- --reporter=verbose 2>&1 | tail -10`
Expected: All PASS

**Step 3: Commit**

```bash
git add packages/proxy/src/index.ts
git commit -m "feat: add graceful shutdown with SIGTERM/SIGINT handlers"
```

---

## Task 8: Runtime upstream validation (P1-7)

**Files:**
- Modify: `packages/proxy/src/engine/adapter.ts`
- Modify: `packages/proxy/src/engine/geojson-builder.ts`
- Test: `packages/proxy/src/engine/adapter.test.ts`
- Test: `packages/proxy/src/engine/geojson-builder.test.ts`

**Step 1: Write failing test for items validation**

Add to `packages/proxy/src/engine/adapter.test.ts`:

```typescript
describe('upstream validation', () => {
  it('returns empty array when items field is not an array', async () => {
    vi.stubGlobal('fetch', vi.fn(() =>
      Promise.resolve({ ok: true, json: () => Promise.resolve({ data: 'not-an-array', total: 5 }) })
    ));
    const result = await fetchUpstreamItems(offsetLimitConfig, { offset: 0, limit: 10 });
    expect(result.items).toEqual([]);
  });

  it('returns undefined total when total is NaN', async () => {
    vi.stubGlobal('fetch', vi.fn(() =>
      Promise.resolve({ ok: true, json: () => Promise.resolve({ data: [], total: 'bad' }) })
    ));
    const result = await fetchUpstreamItems(offsetLimitConfig, { offset: 0, limit: 10 });
    expect(result.total).toBeUndefined();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -w packages/proxy -- --reporter=verbose -t "upstream validation" 2>&1 | tail -10`

**Step 3: Add validation to adapter.ts**

In `extractItems()`:

```typescript
function extractItems(body: Record<string, unknown>, config: CollectionConfig): Record<string, unknown>[] {
  const raw = getByPath(body, config.upstream.responseMapping.items);
  if (!Array.isArray(raw)) {
    const log = logger.adapter();
    log.warning({ path: config.upstream.responseMapping.items }, 'upstream items field is not an array');
    return [];
  }
  return raw as Record<string, unknown>[];
}
```

In `extractTotal()`:

```typescript
function extractTotal(body: Record<string, unknown>, config: CollectionConfig): number | undefined {
  const { total } = config.upstream.responseMapping;
  if (!total) return undefined;
  const value = getByPath(body, total);
  if (typeof value !== 'number' || isNaN(value)) {
    if (value !== undefined && value !== null) {
      const log = logger.adapter();
      log.warning({ path: total, value }, 'upstream total is not a valid number');
    }
    return undefined;
  }
  return value;
}
```

**Step 4: Add safe buildFeature in geojson-builder.ts**

In `packages/proxy/src/engine/geojson-builder.ts`, wrap `buildFeature` to catch errors:

```typescript
export function buildFeatureSafe(raw: Record<string, unknown>, config: CollectionConfig): GeoJSON.Feature | null {
  try {
    return buildFeature(raw, config);
  } catch (err) {
    // Log warning but don't crash — skip malformed feature
    return null;
  }
}
```

Update consumers (`items.ts`, `get-feature.ts`) to use `buildFeatureSafe` and filter nulls:

```typescript
const features = rawItems
  .map(item => buildFeatureSafe(item, config))
  .filter((f): f is GeoJSON.Feature => f !== null);
```

**Step 5: Run tests**

Run: `npm test -w packages/proxy -- --reporter=verbose 2>&1 | tail -20`
Expected: All PASS

**Step 6: Commit**

```bash
git add packages/proxy/src/engine/adapter.ts packages/proxy/src/engine/adapter.test.ts packages/proxy/src/engine/geojson-builder.ts packages/proxy/src/engine/geojson-builder.test.ts packages/proxy/src/ogc/items.ts packages/proxy/src/wfs/get-feature.ts
git commit -m "feat: validate upstream responses and skip malformed features"
```

---

## Task 9: Rate limiting (P1-8)

**Files:**
- Modify: `packages/proxy/src/app.ts`

**Step 1: Add rate limiting middleware**

In `packages/proxy/src/app.ts`, add import:

```typescript
import rateLimit from 'express-rate-limit';
```

After `app.use(cors())` and `app.use(express.json(...))`:

```typescript
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000'),
  max: parseInt(process.env.RATE_LIMIT_MAX || '100'),
  standardHeaders: true,
  legacyHeaders: false,
  message: { code: 'TooManyRequests', description: 'Rate limit exceeded' },
});
app.use(limiter);
```

**Step 2: Run tests**

Run: `npm test -w packages/proxy -- --reporter=verbose 2>&1 | tail -10`
Expected: All PASS

**Step 3: Commit**

```bash
git add packages/proxy/src/app.ts
git commit -m "feat: add global rate limiting with configurable window and max"
```

---

## Task 10: Security headers (P1-9)

**Files:**
- Modify: `packages/proxy/src/app.ts`
- Modify: `packages/proxy/src/wfs/router.ts`
- Modify: `packages/proxy/src/ogc/items.ts`

**Step 1: Add helmet middleware**

In `packages/proxy/src/app.ts`, add import:

```typescript
import helmet from 'helmet';
```

After `const app = express();`:

```typescript
app.use(helmet());
```

This automatically:
- Removes `X-Powered-By`
- Adds `X-Content-Type-Options: nosniff`
- Adds `X-Frame-Options: SAMEORIGIN`
- Adds `Strict-Transport-Security`
- Adds `Content-Security-Policy`

**Step 2: Sanitize error messages**

In `packages/proxy/src/wfs/router.ts`, in both catch blocks (lines ~51 and ~73), replace:

```typescript
const message = err instanceof Error ? err.message : 'Unknown error';
return res.status(502).json({ error: message });
```

With:

```typescript
const log = logger.wfs();
log.error({ err }, 'WFS request failed');
return res.status(502).json({ error: 'An upstream error occurred' });
```

In `packages/proxy/src/ogc/items.ts`, same pattern in `getItems()` and `getItem()` catch blocks:

```typescript
const log = logger.items();
log.error({ err, collectionId }, 'request failed');
res.status(502).json({ code: 'UpstreamError', description: 'An upstream error occurred' });
```

The actual error details (upstream URLs, stack traces, internal paths) are only logged server-side.

**Step 3: Run tests**

Run: `npm test -w packages/proxy -- --reporter=verbose 2>&1 | tail -20`
Expected: All PASS

**Step 4: Run full test suite (unit + conformance)**

Run: `npm test 2>&1 | tail -20`
Expected: All PASS

**Step 5: Commit**

```bash
git add packages/proxy/src/app.ts packages/proxy/src/wfs/router.ts packages/proxy/src/ogc/items.ts
git commit -m "feat: add security headers with helmet and sanitize error messages"
```

---

## Task 11: Final verification

**Step 1: Run full test suite**

Run: `npm test 2>&1`
Expected: All tests pass

**Step 2: Type check**

Run: `cd packages/proxy && npx tsc --noEmit 2>&1`
Expected: No errors

**Step 3: Manual smoke test**

Run: `npm run dev 2>&1 &` and verify:
- `curl http://localhost:3000/health` returns OK
- Response headers include `X-Content-Type-Options`, no `X-Powered-By`
- Kill with SIGTERM, verify graceful shutdown log

**Step 4: Final commit if any fixes needed**
