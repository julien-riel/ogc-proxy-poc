# Evaluation Recommendations Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement all 13 recommendations from evaluation.md — security fixes, quality improvements, and nice-to-have features.

**Architecture:** Incremental changes grouped by priority tier (Critical > Important > Nice-to-have). Each task is independent and gets its own commit. Tests use vitest (unit) and vitest with global-setup (conformance).

**Tech Stack:** TypeScript, Express 4, Vitest, Zod, ESLint, Prettier

---

## TIER 1: Critical (Security / Production)

### Task 1: XML Escaping in WFS Capabilities

**Files:**
- Create: `packages/proxy/src/utils/xml.ts`
- Create: `packages/proxy/src/utils/xml.test.ts`
- Modify: `packages/proxy/src/wfs/capabilities.ts`

**Step 1: Write the failing test**

Create `packages/proxy/src/utils/xml.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { escapeXml } from './xml.js';

describe('escapeXml', () => {
  it('escapes ampersand', () => {
    expect(escapeXml('A & B')).toBe('A &amp; B');
  });

  it('escapes angle brackets', () => {
    expect(escapeXml('<script>')).toBe('&lt;script&gt;');
  });

  it('escapes quotes', () => {
    expect(escapeXml('"hello" & \'world\'')).toBe('&quot;hello&quot; &amp; &apos;world&apos;');
  });

  it('returns empty string for empty input', () => {
    expect(escapeXml('')).toBe('');
  });

  it('passes through safe strings unchanged', () => {
    expect(escapeXml('Bornes-fontaines municipales')).toBe('Bornes-fontaines municipales');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd packages/proxy && npx vitest run src/utils/xml.test.ts`
Expected: FAIL — module not found

**Step 3: Write minimal implementation**

Create `packages/proxy/src/utils/xml.ts`:

```typescript
/**
 * Escapes special XML characters to prevent XML injection.
 */
export function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
```

**Step 4: Run test to verify it passes**

Run: `cd packages/proxy && npx vitest run src/utils/xml.test.ts`
Expected: PASS

**Step 5: Apply escapeXml in capabilities.ts**

In `packages/proxy/src/wfs/capabilities.ts`, add import at top:

```typescript
import { escapeXml } from '../utils/xml.js';
```

In `buildCapabilities20Xml` (lines 22-33), wrap interpolated values:

```typescript
const featureTypes = Object.entries(registry.collections).map(([id, config]) => {
    const [minLon, minLat, maxLon, maxLat] = config.extent?.spatial ?? defaultExtent;
    return `
    <FeatureType>
      <Name>${escapeXml(id)}</Name>
      <Title>${escapeXml(config.title)}</Title>
      <Abstract>${escapeXml(config.description || '')}</Abstract>
      ...
```

Do the same in `buildCapabilitiesXml` (lines 155-168) — same pattern.

**Step 6: Run all unit tests**

Run: `cd packages/proxy && npx vitest run`
Expected: All PASS

**Step 7: Commit**

```bash
git add packages/proxy/src/utils/xml.ts packages/proxy/src/utils/xml.test.ts packages/proxy/src/wfs/capabilities.ts
git commit -m "fix: escape XML values in WFS capabilities to prevent injection"
```

---

### Task 2: Restrict CORS Origins

**Files:**
- Modify: `packages/proxy/src/app.ts`

**Step 1: Update CORS configuration**

In `packages/proxy/src/app.ts`, replace `app.use(cors())` (line 21) with:

```typescript
const corsOrigin = process.env.CORS_ORIGIN;
app.use(cors(corsOrigin ? { origin: corsOrigin.split(',') } : undefined));
```

This keeps the default (all origins) for dev, but allows restricting via env var in production. Multiple origins supported via comma separation: `CORS_ORIGIN=https://app.example.com,https://admin.example.com`.

**Step 2: Run all unit tests**

Run: `cd packages/proxy && npx vitest run`
Expected: All PASS

**Step 3: Commit**

```bash
git add packages/proxy/src/app.ts
git commit -m "feat: make CORS origin configurable via CORS_ORIGIN env var"
```

---

### Task 3: JWT Integration Tests

**Files:**
- Modify: `packages/proxy/src/auth/jwt.test.ts`

**Step 1: Read existing test**

Read `packages/proxy/src/auth/jwt.test.ts` to see current tests.

**Step 2: Add tests for enabled mode**

Append to `packages/proxy/src/auth/jwt.test.ts`:

```typescript
describe('createJwtMiddleware — enabled', () => {
  it('throws if host is missing', async () => {
    await expect(createJwtMiddleware({ enabled: true, host: '' }))
      .rejects.toThrow('JWT is enabled but jwt.host is not configured');
  });

  it('throws if host is not set', async () => {
    await expect(createJwtMiddleware({ enabled: true, host: '' }))
      .rejects.toThrow('jwt.host is not configured');
  });
});
```

Note: We cannot test the full JWT flow without `@villedemontreal/jwt-validator` running. These tests validate the guard clauses. The import-based initialization is tested indirectly by conformance tests when JWT is enabled.

**Step 3: Run tests**

Run: `cd packages/proxy && npx vitest run src/auth/jwt.test.ts`
Expected: All PASS

**Step 4: Commit**

```bash
git add packages/proxy/src/auth/jwt.test.ts
git commit -m "test: add JWT middleware enabled-mode guard clause tests"
```

---

### Task 4: Add README

**Files:**
- Create: `README.md`

**Step 1: Write README**

Create `README.md` at project root with:
- Project title and description
- Architecture overview (monorepo, 3 packages)
- Prerequisites (Node.js 20+, npm)
- Setup instructions (`npm install`, env vars)
- Development commands (`npm run dev:mock`, `npm run dev:proxy`, etc.)
- Testing commands (`npm run test:unit`, `npm run test:conformance`)
- Environment variables table (UPSTREAM_HOST, JWT_HOST, JWT_ENDPOINT, CORS_ORIGIN, RATE_LIMIT_WINDOW_MS, RATE_LIMIT_MAX, LOG_LEVEL, PORT, BASE_URL)
- Project structure diagram (from evaluation.md section 3.1)
- Supported OGC standards (OGC API Features Part 1 & 3, WFS 1.1.0/2.0.0)

**Step 2: Commit**

```bash
git add README.md
git commit -m "docs: add README with setup, architecture, and usage instructions"
```

---

## TIER 2: Important (Quality)

### Task 5: Refactor items.ts — Extract Pipeline Functions

The file is already partially refactored with `parseItemsRequest`, `applyPostFilters`, `isParseError`, `buildUpstreamFilters`, `buildPostFetchSimpleFilters` extracted as pure functions. The remaining handler functions (`getItems`, `getItem`) are at ~100 and ~50 lines respectively — reasonable for Express handlers. No further refactoring needed beyond what's already done.

**Action: SKIP** — already adequately structured. The evaluation noted 428 lines but much of that is the extracted helper functions which are already well-separated.

---

### Task 6: Remove Committed dist/ from Repo

**Files:**
- Remove: `packages/mock-api/dist/` (tracked files only)

**Step 1: Remove from git tracking**

```bash
git rm -r --cached packages/mock-api/dist/
```

**Step 2: Verify .gitignore already covers dist/**

The `.gitignore` has `dist/` on line 2 — this will prevent future commits.

**Step 3: Commit**

```bash
git commit -m "chore: remove committed dist/ build artifacts from tracking"
```

---

### Task 7: Expose extent in Collections Response

**Files:**
- Modify: `packages/proxy/src/ogc/collections.ts`

**Step 1: Update listCollections to include extent**

In `packages/proxy/src/ogc/collections.ts`, modify the `listCollections` function (lines 9-18). Add extent to each collection object:

```typescript
const collections = Object.entries(registry.collections).map(([id, config]) => ({
    id,
    title: config.title,
    description: config.description || '',
    extent: config.extent ? {
      spatial: { bbox: [config.extent.spatial] },
    } : undefined,
    links: [
      { href: `${base}/collections/${id}`, rel: 'self', type: 'application/json' },
      { href: `${base}/collections/${id}/items`, rel: 'items', type: 'application/geo+json' },
    ],
    crs: ['http://www.opengis.net/def/crs/OGC/1.3/CRS84'],
  }));
```

**Step 2: Update getCollectionById similarly**

In `getCollectionById` (lines 35-44), add extent:

```typescript
res.json({
    id: collectionId,
    title: config.title,
    description: config.description || '',
    extent: config.extent ? {
      spatial: { bbox: [config.extent.spatial] },
    } : undefined,
    links: [...],
    crs: [...],
  });
```

The OGC API spec requires `extent.spatial.bbox` as an array of bbox arrays.

**Step 3: Run all tests**

Run: `cd packages/proxy && npx vitest run`
Run: `npm run test:conformance` (if conformance tests check for extent absence, they may need updating)

**Step 4: Commit**

```bash
git add packages/proxy/src/ogc/collections.ts
git commit -m "feat: expose spatial extent in collections response"
```

---

### Task 8: Unit Tests for items.ts Helper Functions

**Files:**
- Create: `packages/proxy/src/ogc/items.test.ts`

The exported functions `getItems` and `getItem` are Express handlers — testing them requires mocking req/res. But the internal pure functions (`parseBbox`, `isInBbox`, `buildUpstreamFilters`, `buildPostFetchSimpleFilters`, `applyPostFilters`) are not exported.

**Step 1: Export the pure helper functions for testing**

In `packages/proxy/src/ogc/items.ts`, add exports to the pure functions that need testing:

```typescript
export function parseBbox(...)  // line 16
export function isInBbox(...)   // line 24
export function buildUpstreamFilters(...)  // line 47
export function buildPostFetchSimpleFilters(...)  // line 66
export function applyPostFilters(...)  // line 240
```

**Step 2: Write tests**

Create `packages/proxy/src/ogc/items.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { parseBbox, isInBbox, buildUpstreamFilters, buildPostFetchSimpleFilters, applyPostFilters } from './items.js';

describe('parseBbox', () => {
  it('parses valid bbox string', () => {
    expect(parseBbox('-73.9,45.4,-73.5,45.7')).toEqual([-73.9, 45.4, -73.5, 45.7]);
  });

  it('returns undefined for invalid bbox', () => {
    expect(parseBbox('invalid')).toBeUndefined();
  });

  it('returns undefined for incomplete bbox', () => {
    expect(parseBbox('1,2,3')).toBeUndefined();
  });
});

describe('isInBbox', () => {
  const bbox: [number, number, number, number] = [-74, 45, -73, 46];

  it('returns true for point inside bbox', () => {
    const feature: GeoJSON.Feature = {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [-73.5, 45.5] },
      properties: {},
    };
    expect(isInBbox(feature, bbox)).toBe(true);
  });

  it('returns false for point outside bbox', () => {
    const feature: GeoJSON.Feature = {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [-72, 44] },
      properties: {},
    };
    expect(isInBbox(feature, bbox)).toBe(false);
  });

  it('returns false for null geometry', () => {
    const feature: GeoJSON.Feature = {
      type: 'Feature',
      geometry: null as any,
      properties: {},
    };
    expect(isInBbox(feature, bbox)).toBe(false);
  });
});

describe('buildUpstreamFilters', () => {
  const properties = [
    { name: 'etat', type: 'string', filterable: true, upstream: { param: 'etat', operators: ['='] } },
    { name: 'nom', type: 'string', filterable: true },
    { name: 'id', type: 'int' },
  ];

  it('maps filterable properties with upstream param', () => {
    expect(buildUpstreamFilters({ etat: 'actif' }, properties)).toEqual({ etat: 'actif' });
  });

  it('ignores properties without upstream param', () => {
    expect(buildUpstreamFilters({ nom: 'test' }, properties)).toEqual({});
  });

  it('ignores non-filterable properties', () => {
    expect(buildUpstreamFilters({ id: '1' }, properties)).toEqual({});
  });
});

describe('buildPostFetchSimpleFilters', () => {
  const properties = [
    { name: 'etat', type: 'string', filterable: true, upstream: { param: 'etat', operators: ['='] } },
    { name: 'nom', type: 'string', filterable: true },
  ];

  it('returns null when no post-fetch filters needed', () => {
    expect(buildPostFetchSimpleFilters({ etat: 'actif' }, properties)).toBeNull();
  });

  it('builds CQL2 AST for properties without upstream mapping', () => {
    const result = buildPostFetchSimpleFilters({ nom: 'test' }, properties);
    expect(result).toEqual({
      type: 'comparison',
      property: 'nom',
      operator: '=',
      value: 'test',
    });
  });

  it('converts numeric string values to numbers', () => {
    const result = buildPostFetchSimpleFilters({ nom: '42' }, properties);
    expect(result?.value).toBe(42);
  });
});

describe('applyPostFilters', () => {
  const features: GeoJSON.Feature[] = [
    { type: 'Feature', geometry: { type: 'Point', coordinates: [-73.5, 45.5] }, properties: { etat: 'actif' } },
    { type: 'Feature', geometry: { type: 'Point', coordinates: [-72, 44] }, properties: { etat: 'inactif' } },
  ];

  it('filters by bbox when not WFS', () => {
    const result = applyPostFilters(features, [-74, 45, -73, 46], null, null, false);
    expect(result).toHaveLength(1);
  });

  it('skips bbox filter for WFS', () => {
    const result = applyPostFilters(features, [-74, 45, -73, 46], null, null, true);
    expect(result).toHaveLength(2);
  });

  it('applies CQL2 filter', () => {
    const ast = { type: 'comparison' as const, property: 'etat', operator: '=' as const, value: 'actif' };
    const result = applyPostFilters(features, undefined, ast, null, false);
    expect(result).toHaveLength(1);
    expect(result[0].properties?.etat).toBe('actif');
  });

  it('returns all features when no filters', () => {
    const result = applyPostFilters(features, undefined, null, null, false);
    expect(result).toHaveLength(2);
  });
});
```

**Step 3: Run tests**

Run: `cd packages/proxy && npx vitest run src/ogc/items.test.ts`
Expected: All PASS

**Step 4: Commit**

```bash
git add packages/proxy/src/ogc/items.ts packages/proxy/src/ogc/items.test.ts
git commit -m "test: add unit tests for items.ts helper functions"
```

---

### Task 9: Configure ESLint + Prettier

**Files:**
- Create: `eslint.config.js` (root)
- Create: `.prettierrc` (root)
- Modify: `package.json` (root — add scripts and devDependencies)

**Step 1: Install dependencies**

```bash
npm install -D eslint @eslint/js typescript-eslint prettier eslint-config-prettier
```

**Step 2: Create eslint.config.js (flat config)**

Create `eslint.config.js` at project root:

```javascript
import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettierConfig from 'eslint-config-prettier';

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  prettierConfig,
  {
    ignores: ['**/dist/**', '**/node_modules/**'],
  },
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  },
);
```

**Step 3: Create .prettierrc**

```json
{
  "singleQuote": true,
  "trailingComma": "all",
  "printWidth": 120,
  "tabWidth": 2
}
```

**Step 4: Add scripts to root package.json**

Add to `scripts` in root `package.json`:

```json
"lint": "eslint packages/*/src/",
"lint:fix": "eslint packages/*/src/ --fix",
"format": "prettier --write 'packages/*/src/**/*.ts'",
"format:check": "prettier --check 'packages/*/src/**/*.ts'"
```

**Step 5: Run lint and fix any issues**

```bash
npm run lint
npm run format
```

Fix any errors that arise. Common issues: unused vars prefixed with `_` should pass, `as any` casts will warn but not error.

**Step 6: Commit**

```bash
git add eslint.config.js .prettierrc package.json package-lock.json
git commit -m "chore: configure ESLint and Prettier"
```

If formatter changed files:

```bash
git add -u
git commit -m "style: apply Prettier formatting"
```

---

## TIER 3: Nice-to-Have (Improvements)

### Task 10: Per-Upstream Rate Limiting

**Files:**
- Create: `packages/proxy/src/engine/upstream-rate-limit.ts`
- Create: `packages/proxy/src/engine/upstream-rate-limit.test.ts`
- Modify: `packages/proxy/src/engine/adapter.ts`

**Step 1: Write the failing test**

Create `packages/proxy/src/engine/upstream-rate-limit.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TokenBucket } from './upstream-rate-limit.js';

describe('TokenBucket', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it('allows requests within rate', () => {
    const bucket = new TokenBucket(10, 10); // 10 tokens, 10/sec refill
    expect(bucket.tryConsume()).toBe(true);
  });

  it('rejects requests when empty', () => {
    const bucket = new TokenBucket(2, 1);
    expect(bucket.tryConsume()).toBe(true);
    expect(bucket.tryConsume()).toBe(true);
    expect(bucket.tryConsume()).toBe(false);
  });

  it('refills tokens over time', () => {
    const bucket = new TokenBucket(2, 2); // 2 tokens, 2/sec
    bucket.tryConsume();
    bucket.tryConsume();
    expect(bucket.tryConsume()).toBe(false);

    vi.advanceTimersByTime(1000); // 1 second later
    expect(bucket.tryConsume()).toBe(true);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd packages/proxy && npx vitest run src/engine/upstream-rate-limit.test.ts`
Expected: FAIL

**Step 3: Implement TokenBucket**

Create `packages/proxy/src/engine/upstream-rate-limit.ts`:

```typescript
/**
 * Simple token bucket rate limiter for upstream requests.
 */
export class TokenBucket {
  private tokens: number;
  private lastRefill: number;

  constructor(
    private readonly capacity: number,
    private readonly refillRate: number, // tokens per second
  ) {
    this.tokens = capacity;
    this.lastRefill = Date.now();
  }

  tryConsume(): boolean {
    this.refill();
    if (this.tokens < 1) return false;
    this.tokens -= 1;
    return true;
  }

  private refill(): void {
    const now = Date.now();
    const elapsed = (now - this.lastRefill) / 1000;
    this.tokens = Math.min(this.capacity, this.tokens + elapsed * this.refillRate);
    this.lastRefill = now;
  }
}

const buckets = new Map<string, TokenBucket>();

/**
 * Get or create a token bucket for a given collection.
 * Default: 50 requests/sec capacity, 50/sec refill.
 */
export function getUpstreamBucket(
  collectionId: string,
  capacity = 50,
  refillRate = 50,
): TokenBucket {
  let bucket = buckets.get(collectionId);
  if (!bucket) {
    bucket = new TokenBucket(capacity, refillRate);
    buckets.set(collectionId, bucket);
  }
  return bucket;
}
```

**Step 4: Run test to verify it passes**

Run: `cd packages/proxy && npx vitest run src/engine/upstream-rate-limit.test.ts`
Expected: All PASS

**Step 5: Integrate into adapter.ts**

In `packages/proxy/src/engine/adapter.ts`, add at top:

```typescript
import { getUpstreamBucket } from './upstream-rate-limit.js';
```

In `fetchUpstreamItems` (line 207), before the switch/if block, add:

```typescript
const bucket = getUpstreamBucket(config.title);
if (!bucket.tryConsume()) {
  throw new UpstreamError(429);
}
```

In `packages/proxy/src/ogc/items.ts`, in the `getItems` catch block, add a case for 429:

```typescript
if (err instanceof UpstreamError && err.statusCode === 429) {
  return res.status(429).json({ code: 'TooManyRequests', description: 'Upstream rate limit exceeded' });
}
```

**Step 6: Run all tests**

Run: `cd packages/proxy && npx vitest run`
Expected: All PASS

**Step 7: Commit**

```bash
git add packages/proxy/src/engine/upstream-rate-limit.ts packages/proxy/src/engine/upstream-rate-limit.test.ts packages/proxy/src/engine/adapter.ts packages/proxy/src/ogc/items.ts
git commit -m "feat: add per-upstream token bucket rate limiting"
```

---

### Task 11: Add /ready Endpoint

**Files:**
- Modify: `packages/proxy/src/app.ts`

**Step 1: Add /ready endpoint**

In `packages/proxy/src/app.ts`, after the `/health` endpoint (line 49), add:

```typescript
app.get('/ready', (_req, res) => {
  try {
    const reg = getRegistry();
    const hasCollections = Object.keys(reg.collections).length > 0;
    if (hasCollections) {
      return res.json({ status: 'ready', collections: Object.keys(reg.collections).length });
    }
    return res.status(503).json({ status: 'not ready', reason: 'no collections loaded' });
  } catch {
    return res.status(503).json({ status: 'not ready', reason: 'registry not loaded' });
  }
});
```

**Step 2: Run all tests**

Run: `cd packages/proxy && npx vitest run`
Expected: All PASS

**Step 3: Commit**

```bash
git add packages/proxy/src/app.ts
git commit -m "feat: add /ready endpoint for readiness checks"
```

---

### Task 12: Complete OpenAPI Spec

**Files:**
- Create: `packages/proxy/src/ogc/openapi.ts`
- Modify: `packages/proxy/src/ogc/router.ts`

**Step 1: Create OpenAPI spec builder**

Create `packages/proxy/src/ogc/openapi.ts`:

```typescript
import { getRegistry } from '../engine/registry.js';

/**
 * Builds an OpenAPI 3.0 spec from the registry configuration.
 */
export function buildOpenApiSpec(baseUrl: string): Record<string, unknown> {
  const registry = getRegistry();
  const collectionIds = Object.keys(registry.collections);

  const collectionPaths: Record<string, unknown> = {};
  for (const id of collectionIds) {
    collectionPaths[`/collections/${id}/items`] = {
      get: {
        summary: `Get features from ${id}`,
        parameters: [
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 10 } },
          { name: 'offset', in: 'query', schema: { type: 'integer', default: 0 } },
          { name: 'bbox', in: 'query', schema: { type: 'string' } },
          { name: 'filter', in: 'query', schema: { type: 'string' } },
          { name: 'filter-lang', in: 'query', schema: { type: 'string', enum: ['cql2-text'] } },
        ],
        responses: {
          '200': { description: 'GeoJSON FeatureCollection' },
          '400': { description: 'Invalid request' },
          '404': { description: 'Collection not found' },
        },
      },
    };
    collectionPaths[`/collections/${id}/items/{featureId}`] = {
      get: {
        summary: `Get a single feature from ${id}`,
        parameters: [{ name: 'featureId', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          '200': { description: 'GeoJSON Feature' },
          '404': { description: 'Feature not found' },
        },
      },
    };
  }

  return {
    openapi: '3.0.0',
    info: { title: 'OGC Proxy Municipal', version: '0.1.0', description: 'Interface GIS commune aux APIs maison' },
    servers: [{ url: baseUrl }],
    paths: {
      '/': {
        get: { summary: 'Landing page', responses: { '200': { description: 'Landing page' } } },
      },
      '/conformance': {
        get: { summary: 'Conformance classes', responses: { '200': { description: 'Conformance declaration' } } },
      },
      '/collections': {
        get: { summary: 'List collections', responses: { '200': { description: 'Collections list' } } },
      },
      ...collectionPaths,
    },
  };
}
```

**Step 2: Update router to use spec builder**

In `packages/proxy/src/ogc/router.ts`, replace the inline `/api` handler (lines 13-19):

```typescript
import { buildOpenApiSpec } from './openapi.js';
import { getBaseUrl } from '../utils/base-url.js';
```

```typescript
router.get('/api', (req, res) => {
  res.json(buildOpenApiSpec(getBaseUrl(req)));
});
```

**Step 3: Run all tests**

Run: `cd packages/proxy && npx vitest run`
Expected: All PASS

**Step 4: Commit**

```bash
git add packages/proxy/src/ogc/openapi.ts packages/proxy/src/ogc/router.ts
git commit -m "feat: generate OpenAPI spec from registry configuration"
```

---

### Task 13: Add .env.example

**Files:**
- Create: `.env.example`

**Step 1: Create .env.example**

Create `.env.example` at project root:

```bash
# Upstream API host (used in collections.yaml)
UPSTREAM_HOST=http://localhost:3001

# Server port
PORT=3000

# Base URL override (optional — auto-detected from request if not set)
# BASE_URL=https://proxy.example.com/ogc

# JWT authentication
JWT_HOST=
JWT_ENDPOINT=

# CORS — comma-separated origins (default: all origins allowed)
# CORS_ORIGIN=https://app.example.com,https://admin.example.com

# Rate limiting
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX=100

# Logging
# LOG_LEVEL=debug
```

**Step 2: Commit**

```bash
git add .env.example
git commit -m "docs: add .env.example documenting all environment variables"
```

---

## Summary

| # | Task | Type | Tier |
|---|------|------|------|
| 1 | XML escaping in capabilities | Security fix | Critical |
| 2 | Configurable CORS origins | Security fix | Critical |
| 3 | JWT enabled-mode tests | Test | Critical |
| 4 | README | Docs | Critical |
| 5 | Refactor items.ts | SKIP (already done) | Important |
| 6 | Remove dist/ from git | Cleanup | Important |
| 7 | Expose extent in collections | Feature | Important |
| 8 | Unit tests for items.ts | Test | Important |
| 9 | ESLint + Prettier | DX | Important |
| 10 | Per-upstream rate limiting | Feature | Nice-to-have |
| 11 | /ready endpoint | Feature | Nice-to-have |
| 12 | Complete OpenAPI spec | Feature | Nice-to-have |
| 13 | .env.example | Docs | Nice-to-have |
