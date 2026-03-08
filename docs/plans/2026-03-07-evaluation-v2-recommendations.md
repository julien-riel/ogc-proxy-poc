# Evaluation V2 Recommendations Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement 11 recommendations from evaluation-v2.md to bring the OGC proxy to production-readiness, and remove all PoC mentions.

**Architecture:** Incremental changes ordered by priority (P0 → P1 → P2 → Extra). Each task is an isolated commit. TDD for all new code.

**Tech Stack:** TypeScript, Vitest, Express 4, Zod 4, jose (JWT testing), husky + lint-staged

---

### Task 1: Coverage Reporting (P0)

**Files:**
- Modify: `packages/proxy/vitest.config.ts`
- Modify: `packages/proxy/package.json`
- Modify: `package.json` (root)

**Step 1: Add coverage config to vitest**

In `packages/proxy/vitest.config.ts`, add v8 coverage provider with thresholds:

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/**/*.bench.ts'],
      thresholds: {
        lines: 60,
        functions: 60,
      },
    },
  },
});
```

**Step 2: Add coverage script**

In root `package.json`, add:
```json
"test:coverage": "npm run test:coverage -w packages/proxy"
```

In `packages/proxy/package.json`, add:
```json
"test:coverage": "vitest run --coverage"
```

**Step 3: Install @vitest/coverage-v8**

Run: `npm install -D @vitest/coverage-v8 -w packages/proxy`

**Step 4: Run coverage to verify**

Run: `npm run test:coverage`
Expected: Tests pass with coverage report, thresholds met.

**Step 5: Commit**

```bash
git add packages/proxy/vitest.config.ts packages/proxy/package.json package.json
git commit -m "feat: add v8 coverage reporting with 60% thresholds"
```

---

### Task 2: JWT Integration Tests with Mock JWKS (P0)

**Files:**
- Modify: `packages/proxy/src/auth/jwt.test.ts`
- Modify: `packages/proxy/src/auth/jwt.ts`

**Context:** The current `createJwtMiddleware` uses `@villedemontreal/jwt-validator` which is hard to mock directly. We need to test the enabled path by verifying the middleware initialization logic without depending on the external library.

**Step 1: Write tests for enabled mode**

Add tests to `jwt.test.ts`:
- Test that `createJwtMiddleware({ enabled: true, host: 'https://auth.example.com' })` calls `init()` and returns a middleware function (mock the villedemontreal imports)
- Test that `createJwtMiddleware({ enabled: true, host: 'https://auth.example.com', endpoint: '/jwks' })` passes the endpoint to `init()`
- Test that `createJwtMiddleware({ enabled: true, host: '' })` throws 'JWT is enabled but jwt.host is not configured'

Use `vi.mock()` to mock the dynamic imports (`@villedemontreal/jwt-validator`, `@villedemontreal/logger`, `@villedemontreal/correlation-id`).

```typescript
vi.mock('@villedemontreal/jwt-validator', () => ({
  init: vi.fn(),
  jwtValidationMiddleware: vi.fn(() => (_req: any, _res: any, next: any) => next()),
}));
vi.mock('@villedemontreal/logger', () => ({
  createLogger: vi.fn(),
}));
vi.mock('@villedemontreal/correlation-id', () => ({
  correlationIdService: { getId: vi.fn(() => 'test-id') },
}));
```

**Step 2: Run tests to verify they pass**

Run: `npx vitest run src/auth/jwt.test.ts -w packages/proxy`
Expected: All tests pass.

**Step 3: Commit**

```bash
git add packages/proxy/src/auth/jwt.test.ts
git commit -m "test: add JWT integration tests with mocked JWKS validator"
```

---

### Task 3: Unit Tests for filter-encoding.ts (P1)

**Files:**
- Create: `packages/proxy/src/wfs/filter-encoding.test.ts`

**Step 1: Write comprehensive tests**

Test `parseFilterXml()` with these scenarios:

```typescript
describe('parseFilterXml', () => {
  // Comparisons
  it('parses PropertyIsEqualTo');
  it('parses PropertyIsNotEqualTo');
  it('parses PropertyIsLessThan');
  it('parses PropertyIsGreaterThan');
  it('parses PropertyIsLessThanOrEqualTo');
  it('parses PropertyIsGreaterThanOrEqualTo');

  // String/numeric coercion
  it('coerces numeric string literals to numbers');
  it('keeps non-numeric strings as strings');

  // Like
  it('parses PropertyIsLike with wildCard and singleChar');
  it('converts wildcards to CQL2 patterns (% and _)');

  // Between & Null
  it('parses PropertyIsBetween');
  it('parses PropertyIsNull');

  // Logical
  it('parses And with two children');
  it('parses Or with two children');
  it('parses Not');
  it('parses And with array children (fast-xml-parser merging)');
  it('throws on empty And');
  it('reduces single-child logical to the child itself');

  // Spatial
  it('parses BBOX with Envelope');
  it('parses Intersects with Point');
  it('parses Within with Polygon');
  it('parses DWithin-like spatial op');

  // GML geometry
  it('parses GML Point');
  it('parses GML Polygon with exterior/LinearRing');
  it('parses GML Envelope to Polygon');

  // Edge cases
  it('returns null for null/undefined input');
  it('returns null for unknown operators');
});
```

Each test passes a parsed XML object (as fast-xml-parser would produce with `removeNSPrefix: true`) to `parseFilterXml` and asserts the returned CqlNode.

**Step 2: Run tests**

Run: `npx vitest run src/wfs/filter-encoding.test.ts -w packages/proxy`
Expected: All tests pass.

**Step 3: Commit**

```bash
git add packages/proxy/src/wfs/filter-encoding.test.ts
git commit -m "test: add comprehensive unit tests for WFS filter-encoding"
```

---

### Task 4: Pre-commit Hooks (P1)

**Files:**
- Modify: `package.json` (root)
- Create: `.husky/pre-commit`

**Step 1: Install husky and lint-staged**

```bash
npm install -D husky lint-staged
```

**Step 2: Initialize husky**

```bash
npx husky init
```

**Step 3: Configure pre-commit hook**

Write `.husky/pre-commit`:
```bash
npx lint-staged
```

**Step 4: Configure lint-staged in root package.json**

Add to root `package.json`:
```json
"lint-staged": {
  "packages/*/src/**/*.ts": [
    "eslint --fix",
    "prettier --write"
  ]
}
```

**Step 5: Test the hook**

Create a test file with a lint issue, stage it, attempt commit. Verify hook runs and fixes/blocks.

**Step 6: Commit**

```bash
git add package.json .husky/
git commit -m "feat: add husky pre-commit hooks with lint-staged"
```

---

### Task 5: Configurable Upstream Rate Limit via YAML (P1)

**Files:**
- Modify: `packages/proxy/src/engine/types.ts`
- Modify: `packages/proxy/src/engine/adapter.ts`
- Modify: `packages/proxy/src/engine/upstream-rate-limit.test.ts`
- Modify: `packages/proxy/src/config/collections.yaml` (optional example)

**Step 1: Write failing test**

Add test to `upstream-rate-limit.test.ts` verifying custom capacity/refillRate from config.

**Step 2: Add rateLimit field to schema**

In `types.ts`, add to `collectionConfigSchema`:
```typescript
rateLimit: z.object({
  capacity: z.number().positive(),
  refillRate: z.number().positive(),
}).optional(),
```

**Step 3: Pass config values to getUpstreamBucket**

In `adapter.ts`, in both `fetchUpstreamItems` and `fetchUpstreamItem`:
```typescript
const bucket = getUpstreamBucket(
  collectionId,
  config.rateLimit?.capacity,
  config.rateLimit?.refillRate,
);
```

**Step 4: Add example to YAML**

Add a `rateLimit` example to the mrc-quebec collection in `collections.yaml`:
```yaml
rateLimit:
  capacity: 10
  refillRate: 5
```

**Step 5: Run tests**

Run: `npm run test:unit`
Expected: All pass.

**Step 6: Commit**

```bash
git add packages/proxy/src/engine/types.ts packages/proxy/src/engine/adapter.ts packages/proxy/src/engine/upstream-rate-limit.test.ts packages/proxy/src/config/collections.yaml
git commit -m "feat: make upstream rate limit configurable per collection via YAML"
```

---

### Task 6: Express Global Request Timeout (P1)

**Files:**
- Modify: `packages/proxy/src/index.ts`

**Step 1: Add server timeout**

After `server = app.listen(...)`:
```typescript
server.setTimeout(60_000);
server.on('timeout', (socket) => {
  socket.destroy();
});
```

**Step 2: Run tests to verify no regression**

Run: `npm run test:unit`

**Step 3: Commit**

```bash
git add packages/proxy/src/index.ts
git commit -m "feat: add 60s global Express request timeout"
```

---

### Task 7: Refactor capabilities.ts (P2)

**Files:**
- Modify: `packages/proxy/src/wfs/capabilities.ts`

**Step 1: Extract shared featureTypes builder**

Create a helper function at the top of the file:

```typescript
function buildFeatureTypesXml(
  collections: Record<string, CollectionConfig>,
  srsTag: 'DefaultCRS' | 'DefaultSRS',
  otherSrsTag: 'OtherCRS' | 'OtherSRS',
): string {
  const defaultExtent: [number, number, number, number] = [-73.98, 45.41, -73.47, 45.70];
  return Object.entries(collections).map(([id, config]) => {
    const [minLon, minLat, maxLon, maxLat] = config.extent?.spatial ?? defaultExtent;
    return `
    <FeatureType>
      <Name>${escapeXml(id)}</Name>
      <Title>${escapeXml(config.title)}</Title>
      <Abstract>${escapeXml(config.description || '')}</Abstract>
      <${srsTag}>urn:ogc:def:crs:OGC:1.3:CRS84</${srsTag}>
      <${otherSrsTag}>urn:ogc:def:crs:EPSG::3857</${otherSrsTag}>
      <ows:WGS84BoundingBox>
        <ows:LowerCorner>${minLon} ${minLat}</ows:LowerCorner>
        <ows:UpperCorner>${maxLon} ${maxLat}</ows:UpperCorner>
      </ows:WGS84BoundingBox>
    </FeatureType>`;
  }).join('\n');
}
```

**Step 2: Use in both functions**

Replace the duplicate code in `buildCapabilities20Xml` and `buildCapabilitiesXml` with:
```typescript
const featureTypes = buildFeatureTypesXml(registry.collections, 'DefaultCRS', 'OtherCRS');  // 2.0
const featureTypes = buildFeatureTypesXml(registry.collections, 'DefaultSRS', 'OtherSRS');  // 1.1
```

**Step 3: Run conformance tests to verify no regression**

Run: `npm run test:unit`

**Step 4: Commit**

```bash
git add packages/proxy/src/wfs/capabilities.ts
git commit -m "refactor: extract shared featureTypes builder in WFS capabilities"
```

---

### Task 8: Performance Benchmark (P2)

**Files:**
- Create: `packages/proxy/src/engine/__bench__/geojson-builder.bench.ts`
- Modify: `packages/proxy/package.json`

**Step 1: Create benchmark**

```typescript
import { bench, describe } from 'vitest';
import { buildFeature, buildFeatureCollection } from '../geojson-builder.js';
import type { CollectionConfig } from '../types.js';

const mockConfig: CollectionConfig = {
  title: 'bench',
  idField: 'id',
  geometry: { type: 'Point', xField: 'lon', yField: 'lat' },
  properties: [
    { name: 'name', type: 'string' },
    { name: 'value', type: 'number' },
  ],
  upstream: {
    baseUrl: 'http://localhost',
    method: 'GET',
    pagination: { type: 'offset-limit', offsetParam: 'offset', limitParam: 'limit' },
    responseMapping: { items: 'data', total: 'total', item: 'data' },
  },
};

function generateRawItems(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    id: i,
    lon: -73.5 + Math.random() * 0.5,
    lat: 45.4 + Math.random() * 0.3,
    name: `Feature ${i}`,
    value: Math.random() * 1000,
  }));
}

describe('GeoJSON Builder', () => {
  const items10k = generateRawItems(10_000);

  bench('buildFeature x 10,000', () => {
    for (const item of items10k) {
      buildFeature(item, mockConfig);
    }
  });

  bench('buildFeatureCollection with 10,000 features', () => {
    const features = items10k.map(item => buildFeature(item, mockConfig));
    buildFeatureCollection(features, {
      baseUrl: 'http://localhost',
      collectionId: 'bench',
      offset: 0,
      limit: 10000,
      total: 10000,
    });
  });
});
```

**Step 2: Add bench script**

In `packages/proxy/package.json`:
```json
"bench": "vitest bench"
```

In root `package.json`:
```json
"bench": "npm run bench -w packages/proxy"
```

**Step 3: Run benchmark**

Run: `npm run bench`
Expected: Benchmark runs and shows timing. Target: < 1.5s for 10k features.

**Step 4: Commit**

```bash
git add packages/proxy/src/engine/__bench__/ packages/proxy/package.json package.json
git commit -m "test: add performance benchmark for GeoJSON builder (10k features)"
```

---

### Task 9: Document JWT Setup in README (P2)

**Files:**
- Modify: `README.md`

**Step 1: Add JWT section**

After the Environment Variables table, add:

```markdown
## Authentication (JWT)

The proxy supports JWT token validation via `@villedemontreal/jwt-validator`.

### Configuration

In `packages/proxy/src/config/collections.yaml`:

```yaml
security:
  jwt:
    enabled: true
    host: "${JWT_HOST}"
    endpoint: "${JWT_ENDPOINT}"
```

### Environment Variables

| Variable | Description |
|---|---|
| `JWT_HOST` | JWKS host URL (e.g., `https://auth.montreal.ca`) |
| `JWT_ENDPOINT` | JWKS endpoint path (optional, defaults to library default) |

### Behavior

- **Disabled (default):** All requests pass through without auth check.
- **Enabled:** Requests to protected endpoints must include a valid `Authorization: Bearer <token>` header.
  - `GetCapabilities` (WFS) and landing page (OGC API) are always public.
  - All other operations require a valid JWT.
- Invalid or expired tokens return `401 Unauthorized`.
```

**Step 2: Commit**

```bash
git add README.md
git commit -m "docs: add JWT authentication setup guide to README"
```

---

### Task 10: CQL2 Temporal Predicates (P2)

**Files:**
- Modify: `packages/proxy/src/engine/cql2/types.ts`
- Modify: `packages/proxy/src/engine/cql2/lexer.ts`
- Modify: `packages/proxy/src/engine/cql2/parser.ts`
- Modify: `packages/proxy/src/engine/cql2/evaluator.ts`
- Create: `packages/proxy/src/engine/cql2/temporal.test.ts`

**Step 1: Write failing tests**

In `temporal.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { parseCql2 } from './parser.js';
import { evaluateFilter } from './evaluator.js';
import type { Feature } from 'geojson';

const feature: Feature = {
  type: 'Feature',
  geometry: { type: 'Point', coordinates: [0, 0] },
  properties: { created: '2025-06-15T10:00:00Z', name: 'test' },
};

describe('CQL2 Temporal Predicates', () => {
  it('T_BEFORE: property before a timestamp', () => {
    const node = parseCql2("created T_BEFORE '2025-07-01T00:00:00Z'");
    expect(evaluateFilter(node, feature)).toBe(true);
  });

  it('T_BEFORE: property not before a timestamp', () => {
    const node = parseCql2("created T_BEFORE '2025-01-01T00:00:00Z'");
    expect(evaluateFilter(node, feature)).toBe(false);
  });

  it('T_AFTER: property after a timestamp', () => {
    const node = parseCql2("created T_AFTER '2025-01-01T00:00:00Z'");
    expect(evaluateFilter(node, feature)).toBe(true);
  });

  it('T_AFTER: property not after a timestamp', () => {
    const node = parseCql2("created T_AFTER '2026-01-01T00:00:00Z'");
    expect(evaluateFilter(node, feature)).toBe(false);
  });

  it('T_DURING: property during a period', () => {
    const node = parseCql2("created T_DURING '2025-01-01T00:00:00Z' '2025-12-31T23:59:59Z'");
    expect(evaluateFilter(node, feature)).toBe(true);
  });

  it('T_DURING: property outside a period', () => {
    const node = parseCql2("created T_DURING '2024-01-01T00:00:00Z' '2024-12-31T23:59:59Z'");
    expect(evaluateFilter(node, feature)).toBe(false);
  });

  it('works with date-only strings', () => {
    const node = parseCql2("created T_AFTER '2025-01-01'");
    expect(evaluateFilter(node, feature)).toBe(true);
  });

  it('combines with AND', () => {
    const node = parseCql2("created T_AFTER '2025-01-01T00:00:00Z' AND name = 'test'");
    expect(evaluateFilter(node, feature)).toBe(true);
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run src/engine/cql2/temporal.test.ts -w packages/proxy`
Expected: FAIL (T_BEFORE, T_AFTER, T_DURING not recognized)

**Step 3: Add temporal type**

In `types.ts`, add:
```typescript
export interface CqlTemporal {
  type: 'temporal';
  operator: 'T_BEFORE' | 'T_AFTER' | 'T_DURING';
  property: string;
  value: string;
  value2?: string; // end of period for T_DURING
}
```

Update the `CqlNode` union to include `| CqlTemporal`.

**Step 4: Add temporal keywords to lexer**

In `lexer.ts`, add to KEYWORDS set:
```typescript
'T_BEFORE', 'T_AFTER', 'T_DURING'
```

**Step 5: Add temporal parsing**

In `parser.ts`, in `parsePrimary()`, after the IS NULL block and before the Comparison block, add:

```typescript
// Temporal predicates
if (this.peek().type === 'KEYWORD' && ['T_BEFORE', 'T_AFTER', 'T_DURING'].includes((this.peek() as { value: string }).value)) {
  const op = (this.advance() as { value: string }).value as 'T_BEFORE' | 'T_AFTER' | 'T_DURING';
  const value = (this.expect('STRING') as { type: 'STRING'; value: string }).value;
  if (op === 'T_DURING') {
    const value2 = (this.expect('STRING') as { type: 'STRING'; value: string }).value;
    return { type: 'temporal', operator: op, property, value, value2 };
  }
  return { type: 'temporal', operator: op, property, value };
}
```

**Step 6: Add temporal evaluation**

In `evaluator.ts`, add case in `evaluateFilter`:
```typescript
case 'temporal': {
  const val = getPropertyValue(feature, node.property);
  if (val === null || val === undefined) return false;
  const propDate = new Date(String(val)).getTime();
  if (isNaN(propDate)) return false;
  const targetDate = new Date(node.value).getTime();
  switch (node.operator) {
    case 'T_BEFORE': return propDate < targetDate;
    case 'T_AFTER': return propDate > targetDate;
    case 'T_DURING': {
      const endDate = new Date(node.value2!).getTime();
      return propDate >= targetDate && propDate <= endDate;
    }
    default: return false;
  }
}
```

**Step 7: Run tests to verify they pass**

Run: `npx vitest run src/engine/cql2/temporal.test.ts -w packages/proxy`
Expected: All PASS.

**Step 8: Run all unit tests**

Run: `npm run test:unit`
Expected: All pass.

**Step 9: Commit**

```bash
git add packages/proxy/src/engine/cql2/
git commit -m "feat: add CQL2 temporal predicates (T_BEFORE, T_AFTER, T_DURING)"
```

---

### Task 11: Remove PoC/POC Mentions

**Files:**
- Modify: `README.md`
- Modify: `evaluation.md`
- Modify: `evaluation-v2.md`
- Modify: any `docs/plans/*.md` files with PoC mentions

**Step 1: Update README title**

Change `# OGC Proxy Municipal (POC)` to `# OGC Proxy Municipal`

**Step 2: Update evaluation files**

In `evaluation.md` and `evaluation-v2.md`:
- Remove "(POC)" from titles
- Replace "Ce POC" with "Ce projet"
- Replace "ce PoC/POC" with "ce projet"
- Replace "un POC" with "un projet"

**Step 3: Update plan docs**

Search and replace PoC/POC mentions in `docs/plans/` files. Keep the repo directory name `ogc-proxy-poc` as-is (it's the git repo name).

**Step 4: Commit**

```bash
git add README.md evaluation.md evaluation-v2.md docs/plans/
git commit -m "chore: remove PoC/POC mentions from documentation"
```
