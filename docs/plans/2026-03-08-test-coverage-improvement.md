# Test Coverage Improvement Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Raise unit test coverage from 73% to 80%+ lines and from 78% to 85%+ functions, and update vitest thresholds accordingly.

**Architecture:** Add unit tests for 8 under-covered modules. Each task is independent (no shared state), so tasks can be parallelized. All tests follow existing codebase patterns: vitest, vi.mock for logger, vi.stubGlobal for fetch, vi.stubEnv for env vars.

**Tech Stack:** vitest, vi.fn/vi.mock/vi.stubGlobal, @turf/* for spatial assertions

---

### Task 1: Test ogc/queryables.ts (0% → ~95%)

**Files:**
- Create: `packages/proxy/src/ogc/queryables.test.ts`
- Source: `packages/proxy/src/ogc/queryables.ts`

**Step 1: Write the tests**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../engine/registry.js', () => ({
  getCollection: vi.fn(),
}));

vi.mock('../utils/base-url.js', () => ({
  getBaseUrl: vi.fn().mockReturnValue('http://localhost:3000/ogc'),
}));

import { getQueryables } from './queryables.js';
import { getCollection } from '../engine/registry.js';

function mockReqRes(collectionId: string) {
  const req = { params: { collectionId } } as any;
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  } as any;
  return { req, res };
}

describe('getQueryables', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('returns 404 when collection not found', () => {
    vi.mocked(getCollection).mockReturnValue(undefined);
    const { req, res } = mockReqRes('nonexistent');

    getQueryables(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'NotFound' }),
    );
  });

  it('returns queryable properties for a valid collection', () => {
    vi.mocked(getCollection).mockReturnValue({
      title: 'Bornes-fontaines',
      upstream: {} as any,
      geometry: { type: 'Point', xField: 'x', yField: 'y' },
      idField: 'id',
      properties: [
        { name: 'etat', type: 'string', filterable: true, sortable: true },
        { name: 'arrondissement', type: 'string', filterable: true },
        { name: 'internal_id', type: 'int', filterable: false },
      ],
    } as any);
    const { req, res } = mockReqRes('bornes-fontaines');

    getQueryables(req, res);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        $schema: 'https://json-schema.org/draft/2020-12/schema',
        type: 'object',
        title: 'Bornes-fontaines',
        properties: expect.objectContaining({
          etat: { type: 'string', 'x-ogc-sortable': true },
          arrondissement: { type: 'string' },
          geometry: { $ref: 'https://geojson.org/schema/Point.json' },
        }),
      }),
    );
    // internal_id not filterable, should NOT be in properties
    const calledProps = res.json.mock.calls[0][0].properties;
    expect(calledProps.internal_id).toBeUndefined();
  });

  it('maps property types correctly', () => {
    vi.mocked(getCollection).mockReturnValue({
      title: 'Test',
      upstream: {} as any,
      geometry: { type: 'Polygon', wktField: 'wkt' },
      idField: 'id',
      properties: [
        { name: 'count', type: 'int', filterable: true },
        { name: 'value', type: 'double', filterable: true },
        { name: 'active', type: 'boolean', filterable: true },
        { name: 'unknown_type', type: 'custom', filterable: true },
      ],
    } as any);
    const { req, res } = mockReqRes('test');

    getQueryables(req, res);

    const props = res.json.mock.calls[0][0].properties;
    expect(props.count.type).toBe('integer');
    expect(props.value.type).toBe('number');
    expect(props.active.type).toBe('boolean');
    expect(props.unknown_type.type).toBe('string'); // fallback
    expect(props.geometry.$ref).toBe('https://geojson.org/schema/Polygon.json');
  });

  it('uses LineString geometry ref', () => {
    vi.mocked(getCollection).mockReturnValue({
      title: 'Test',
      upstream: {} as any,
      geometry: { type: 'LineString', coordsField: 'coords' },
      idField: 'id',
      properties: [],
    } as any);
    const { req, res } = mockReqRes('test');

    getQueryables(req, res);

    const props = res.json.mock.calls[0][0].properties;
    expect(props.geometry.$ref).toBe('https://geojson.org/schema/LineString.json');
  });
});
```

**Step 2: Run tests**

Run: `npm test -w packages/proxy -- --reporter=verbose src/ogc/queryables.test.ts`
Expected: All 4 tests PASS

**Step 3: Commit**

```bash
git add packages/proxy/src/ogc/queryables.test.ts
git commit -m "test: add unit tests for ogc/queryables endpoint"
```

---

### Task 2: Test ogc/openapi.ts (0% → ~95%)

**Files:**
- Create: `packages/proxy/src/ogc/openapi.test.ts`
- Source: `packages/proxy/src/ogc/openapi.ts`

**Step 1: Write the tests**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../engine/registry.js', () => ({
  getRegistry: vi.fn(),
}));

import { buildOpenApiSpec } from './openapi.js';
import { getRegistry } from '../engine/registry.js';

describe('buildOpenApiSpec', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('returns valid OpenAPI 3.0 structure', () => {
    vi.mocked(getRegistry).mockReturnValue({
      collections: {
        'bornes-fontaines': { title: 'Bornes' } as any,
      },
    } as any);

    const spec = buildOpenApiSpec('http://localhost:3000');

    expect(spec.openapi).toBe('3.0.0');
    expect(spec.info).toEqual(
      expect.objectContaining({ title: 'OGC Proxy Municipal', version: '0.1.0' }),
    );
    expect(spec.servers).toEqual([{ url: 'http://localhost:3000' }]);
  });

  it('generates paths for each collection', () => {
    vi.mocked(getRegistry).mockReturnValue({
      collections: {
        'bornes-fontaines': { title: 'Bornes' } as any,
        'pistes-cyclables': { title: 'Pistes' } as any,
      },
    } as any);

    const spec = buildOpenApiSpec('http://localhost:3000');
    const paths = spec.paths as Record<string, unknown>;

    expect(paths['/collections/bornes-fontaines/items']).toBeDefined();
    expect(paths['/collections/bornes-fontaines/items/{featureId}']).toBeDefined();
    expect(paths['/collections/pistes-cyclables/items']).toBeDefined();
    expect(paths['/collections/pistes-cyclables/items/{featureId}']).toBeDefined();
  });

  it('includes static endpoints', () => {
    vi.mocked(getRegistry).mockReturnValue({ collections: {} } as any);

    const spec = buildOpenApiSpec('http://localhost:3000');
    const paths = spec.paths as Record<string, unknown>;

    expect(paths['/']).toBeDefined();
    expect(paths['/conformance']).toBeDefined();
    expect(paths['/collections']).toBeDefined();
  });

  it('handles empty collections', () => {
    vi.mocked(getRegistry).mockReturnValue({ collections: {} } as any);

    const spec = buildOpenApiSpec('http://localhost:3000');
    const paths = spec.paths as Record<string, unknown>;

    // Only static paths (/, /conformance, /collections)
    expect(Object.keys(paths)).toHaveLength(3);
  });
});
```

**Step 2: Run tests**

Run: `npm test -w packages/proxy -- --reporter=verbose src/ogc/openapi.test.ts`
Expected: All 4 tests PASS

**Step 3: Commit**

```bash
git add packages/proxy/src/ogc/openapi.test.ts
git commit -m "test: add unit tests for ogc/openapi spec builder"
```

---

### Task 3: Test plugins/wfs-upstream.ts transform methods (69% → ~95%)

**Files:**
- Modify: `packages/proxy/src/plugins/wfs-upstream.test.ts`
- Source: `packages/proxy/src/plugins/wfs-upstream.ts`

**Step 1: Add tests for plugin transform methods**

Append to the existing test file, inside the top-level describe block:

```typescript
// Add these imports at top if not present:
// import { wfsUpstreamPlugin } from './wfs-upstream.js';

describe('wfsUpstreamPlugin', () => {
  it('has skipGeojsonBuilder set to true', () => {
    expect(wfsUpstreamPlugin.skipGeojsonBuilder).toBe(true);
  });

  describe('transformRequest', () => {
    it('returns the request unchanged', async () => {
      const req = { collectionId: 'test', limit: 10, offset: 0 } as any;
      const result = await wfsUpstreamPlugin.transformRequest!(req);
      expect(result).toEqual(req);
    });
  });

  describe('transformUpstreamResponse', () => {
    it('returns array input as-is', async () => {
      const input = [{ id: 1 }, { id: 2 }];
      const result = await wfsUpstreamPlugin.transformUpstreamResponse!(input);
      expect(result).toEqual(input);
    });

    it('extracts features array from object', async () => {
      const input = { type: 'FeatureCollection', features: [{ id: 1 }, { id: 2 }] };
      const result = await wfsUpstreamPlugin.transformUpstreamResponse!(input);
      expect(result).toEqual([{ id: 1 }, { id: 2 }]);
    });

    it('returns raw input when no features property', async () => {
      const input = { data: 'something' };
      const result = await wfsUpstreamPlugin.transformUpstreamResponse!(input);
      expect(result).toEqual(input);
    });
  });
});
```

**Step 2: Run tests**

Run: `npm test -w packages/proxy -- --reporter=verbose src/plugins/wfs-upstream.test.ts`
Expected: All tests PASS (existing + 4 new)

**Step 3: Commit**

```bash
git add packages/proxy/src/plugins/wfs-upstream.test.ts
git commit -m "test: add tests for wfs-upstream plugin transforms"
```

---

### Task 4: Test redis.ts client creation (35% → ~80%)

**Files:**
- Modify: `packages/proxy/src/redis.test.ts`
- Source: `packages/proxy/src/redis.ts`

**Step 1: Add tests for Redis client creation and status**

The existing redis.test.ts already has basic tests. We need to add tests for the `REDIS_URL` set path using vi.mock on ioredis. Append these tests:

```typescript
// Add vi.mock at the TOP of the file (before imports):
const mockOn = vi.fn();
const mockRedisInstance = { on: mockOn, status: 'ready' };

vi.mock('ioredis', () => ({
  Redis: vi.fn(() => mockRedisInstance),
}));

// Then add these test cases inside the describe block:

describe('createRedisClient with REDIS_URL', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockOn.mockClear();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('creates Redis client when REDIS_URL is set', () => {
    vi.stubEnv('REDIS_URL', 'redis://localhost:6379');
    // Need to re-import to get fresh module with mocked ioredis
    const client = createRedisClient();
    expect(client).not.toBeNull();
  });

  it('registers error and connect event handlers', () => {
    vi.stubEnv('REDIS_URL', 'redis://localhost:6379');
    createRedisClient();
    expect(mockOn).toHaveBeenCalledWith('error', expect.any(Function));
    expect(mockOn).toHaveBeenCalledWith('connect', expect.any(Function));
  });

  it('getRedisStatus returns client status when connected', () => {
    const status = getRedisStatus({ status: 'ready' } as any);
    expect(status).toBe('ready');
  });
});
```

Note: The mock setup may need adjustment depending on how the existing test file is structured. The key is to mock `ioredis` at the top level before any imports.

**Step 2: Run tests**

Run: `npm test -w packages/proxy -- --reporter=verbose src/redis.test.ts`
Expected: All tests PASS

**Step 3: Commit**

```bash
git add packages/proxy/src/redis.test.ts
git commit -m "test: add tests for Redis client creation and event handlers"
```

---

### Task 5: Test cql2/evaluator.ts spatial operators (61% → ~90%)

**Files:**
- Modify: `packages/proxy/src/engine/cql2/evaluator.test.ts`
- Source: `packages/proxy/src/engine/cql2/evaluator.ts`

**Step 1: Add spatial operator tests**

Append inside the top-level describe block:

```typescript
describe('Spatial — S_WITHIN', () => {
  it('matches point within polygon', () => {
    const ast = parseCql2('S_WITHIN(geometry,POLYGON((-74 45,-73 45,-73 46,-74 46,-74 45)))');
    expect(evaluateFilter(ast, makePoint(-73.5, 45.5))).toBe(true);
  });

  it('rejects point outside polygon', () => {
    const ast = parseCql2('S_WITHIN(geometry,POLYGON((-74 45,-73 45,-73 46,-74 46,-74 45)))');
    expect(evaluateFilter(ast, makePoint(-75, 45.5))).toBe(false);
  });
});

describe('Spatial — S_CONTAINS', () => {
  it('polygon contains a point (via feature with polygon geometry)', () => {
    const polygon: Feature = {
      type: 'Feature',
      geometry: {
        type: 'Polygon',
        coordinates: [[[-74, 45], [-73, 45], [-73, 46], [-74, 46], [-74, 45]]],
      },
      properties: {},
    };
    const ast = parseCql2('S_CONTAINS(geometry,POINT(-73.5 45.5))');
    expect(evaluateFilter(ast, polygon)).toBe(true);
  });
});

describe('Spatial — S_DISJOINT', () => {
  it('matches disjoint geometries', () => {
    const ast = parseCql2('S_DISJOINT(geometry,POLYGON((-74 45,-73 45,-73 46,-74 46,-74 45)))');
    // Point far outside polygon
    expect(evaluateFilter(ast, makePoint(-80, 50))).toBe(true);
  });

  it('rejects overlapping geometries', () => {
    const ast = parseCql2('S_DISJOINT(geometry,POLYGON((-74 45,-73 45,-73 46,-74 46,-74 45)))');
    expect(evaluateFilter(ast, makePoint(-73.5, 45.5))).toBe(false);
  });
});

describe('Spatial — S_TOUCHES', () => {
  it('matches point on polygon boundary', () => {
    const ast = parseCql2('S_TOUCHES(geometry,POLYGON((-74 45,-73 45,-73 46,-74 46,-74 45)))');
    // Point exactly on the boundary
    expect(evaluateFilter(ast, makePoint(-74, 45.5))).toBe(true);
  });
});

describe('Spatial — S_EQUALS', () => {
  it('matches identical point geometries', () => {
    const ast = parseCql2('S_EQUALS(geometry,POINT(-73.5 45.5))');
    expect(evaluateFilter(ast, makePoint(-73.5, 45.5))).toBe(true);
  });

  it('rejects different point geometries', () => {
    const ast = parseCql2('S_EQUALS(geometry,POINT(-73.5 45.5))');
    expect(evaluateFilter(ast, makePoint(-73.6, 45.5))).toBe(false);
  });
});

describe('Spatial — null geometry', () => {
  it('returns false when feature has no geometry', () => {
    const ast = parseCql2('S_INTERSECTS(geometry,POLYGON((-74 45,-73 45,-73 46,-74 46,-74 45)))');
    const noGeom: Feature = { type: 'Feature', geometry: null as any, properties: {} };
    expect(evaluateFilter(ast, noGeom)).toBe(false);
  });
});

describe('IN operator', () => {
  it('matches value in list', () => {
    const ast = parseCql2("etat IN ('actif','maintenance')");
    expect(evaluateFilter(ast, makePoint(0, 0, { etat: 'actif' }))).toBe(true);
    expect(evaluateFilter(ast, makePoint(0, 0, { etat: 'maintenance' }))).toBe(true);
  });

  it('rejects value not in list', () => {
    const ast = parseCql2("etat IN ('actif','maintenance')");
    expect(evaluateFilter(ast, makePoint(0, 0, { etat: 'inactif' }))).toBe(false);
  });
});

describe('BETWEEN operator', () => {
  it('matches value in range', () => {
    const ast = parseCql2('population BETWEEN 10000 AND 50000');
    expect(evaluateFilter(ast, makePoint(0, 0, { population: 25000 }))).toBe(true);
  });

  it('rejects value outside range', () => {
    const ast = parseCql2('population BETWEEN 10000 AND 50000');
    expect(evaluateFilter(ast, makePoint(0, 0, { population: 5000 }))).toBe(false);
  });

  it('includes boundary values', () => {
    const ast = parseCql2('population BETWEEN 10000 AND 50000');
    expect(evaluateFilter(ast, makePoint(0, 0, { population: 10000 }))).toBe(true);
    expect(evaluateFilter(ast, makePoint(0, 0, { population: 50000 }))).toBe(true);
  });
});

describe('IS NULL / IS NOT NULL', () => {
  it('matches null property', () => {
    const ast = parseCql2('etat IS NULL');
    expect(evaluateFilter(ast, makePoint(0, 0, { etat: null }))).toBe(true);
    expect(evaluateFilter(ast, makePoint(0, 0, {}))).toBe(true);
  });

  it('rejects non-null for IS NULL', () => {
    const ast = parseCql2('etat IS NULL');
    expect(evaluateFilter(ast, makePoint(0, 0, { etat: 'actif' }))).toBe(false);
  });

  it('matches non-null for IS NOT NULL', () => {
    const ast = parseCql2('etat IS NOT NULL');
    expect(evaluateFilter(ast, makePoint(0, 0, { etat: 'actif' }))).toBe(true);
  });

  it('rejects null for IS NOT NULL', () => {
    const ast = parseCql2('etat IS NOT NULL');
    expect(evaluateFilter(ast, makePoint(0, 0, { etat: null }))).toBe(false);
  });
});

describe('Temporal operators', () => {
  it('T_BEFORE matches earlier date', () => {
    const ast = parseCql2("date_inspection T_BEFORE '2024-01-01'");
    expect(evaluateFilter(ast, makePoint(0, 0, { date_inspection: '2023-06-15' }))).toBe(true);
    expect(evaluateFilter(ast, makePoint(0, 0, { date_inspection: '2024-06-15' }))).toBe(false);
  });

  it('T_AFTER matches later date', () => {
    const ast = parseCql2("date_inspection T_AFTER '2024-01-01'");
    expect(evaluateFilter(ast, makePoint(0, 0, { date_inspection: '2024-06-15' }))).toBe(true);
    expect(evaluateFilter(ast, makePoint(0, 0, { date_inspection: '2023-06-15' }))).toBe(false);
  });

  it('T_DURING matches date within range', () => {
    const ast = parseCql2("date_inspection T_DURING '2024-01-01' '2024-12-31'");
    expect(evaluateFilter(ast, makePoint(0, 0, { date_inspection: '2024-06-15' }))).toBe(true);
    expect(evaluateFilter(ast, makePoint(0, 0, { date_inspection: '2023-06-15' }))).toBe(false);
  });

  it('returns false for null temporal property', () => {
    const ast = parseCql2("date_inspection T_BEFORE '2024-01-01'");
    expect(evaluateFilter(ast, makePoint(0, 0, {}))).toBe(false);
  });

  it('returns false for invalid date in property', () => {
    const ast = parseCql2("date_inspection T_BEFORE '2024-01-01'");
    expect(evaluateFilter(ast, makePoint(0, 0, { date_inspection: 'not-a-date' }))).toBe(false);
  });
});

describe('S_DWITHIN edge cases', () => {
  it('returns false when distance is missing', () => {
    // Build AST manually since parser always adds distance for S_DWITHIN
    const ast: CqlNode = {
      type: 'spatial',
      operator: 'S_DWITHIN',
      property: 'geometry',
      geometry: { type: 'Point', coordinates: [-73.5, 45.5] },
    } as any;
    expect(evaluateFilter(ast, makePoint(-73.5, 45.5))).toBe(false);
  });

  it('converts kilometers correctly', () => {
    const ast = parseCql2('S_DWITHIN(geometry,POINT(-73.5 45.5),50,kilometers)');
    expect(evaluateFilter(ast, makePoint(-73.55, 45.52))).toBe(true);
  });

  it('returns false for non-point feature geometry', () => {
    const ast = parseCql2('S_DWITHIN(geometry,POINT(-73.5 45.5),50000,meters)');
    const polygon: Feature = {
      type: 'Feature',
      geometry: {
        type: 'Polygon',
        coordinates: [[[-74, 45], [-73, 45], [-73, 46], [-74, 46], [-74, 45]]],
      },
      properties: {},
    };
    expect(evaluateFilter(ast, polygon)).toBe(false);
  });
});
```

Note: You'll need to add `import type { CqlNode } from './types.js';` and `import type { Feature } from 'geojson';` at the top of the test file.

**Step 2: Run tests**

Run: `npm test -w packages/proxy -- --reporter=verbose src/engine/cql2/evaluator.test.ts`
Expected: All tests PASS

**Step 3: Commit**

```bash
git add packages/proxy/src/engine/cql2/evaluator.test.ts
git commit -m "test: add spatial, temporal, IN, BETWEEN, IS NULL evaluator tests"
```

---

### Task 6: Test cql2/parser.ts missing operators (72% → ~90%)

**Files:**
- Modify: `packages/proxy/src/engine/cql2/parser.test.ts`
- Source: `packages/proxy/src/engine/cql2/parser.ts`

**Step 1: Read the existing parser test file and add missing tests**

Check the existing test file first, then append these tests for IN, BETWEEN, IS NULL, temporal, and geometry parsing:

```typescript
describe('IN operator', () => {
  it('parses single value', () => {
    const ast = parseCql2("etat IN ('actif')");
    expect(ast).toEqual({
      type: 'in',
      property: 'etat',
      values: ['actif'],
    });
  });

  it('parses multiple string values', () => {
    const ast = parseCql2("etat IN ('actif','maintenance','inactif')");
    expect(ast).toEqual({
      type: 'in',
      property: 'etat',
      values: ['actif', 'maintenance', 'inactif'],
    });
  });

  it('parses numeric values', () => {
    const ast = parseCql2('code IN (1,2,3)');
    expect(ast).toEqual({
      type: 'in',
      property: 'code',
      values: [1, 2, 3],
    });
  });
});

describe('BETWEEN operator', () => {
  it('parses numeric range', () => {
    const ast = parseCql2('population BETWEEN 10000 AND 50000');
    expect(ast).toEqual({
      type: 'between',
      property: 'population',
      low: 10000,
      high: 50000,
    });
  });
});

describe('IS NULL / IS NOT NULL', () => {
  it('parses IS NULL', () => {
    const ast = parseCql2('etat IS NULL');
    expect(ast).toEqual({
      type: 'isNull',
      property: 'etat',
      negated: false,
    });
  });

  it('parses IS NOT NULL', () => {
    const ast = parseCql2('etat IS NOT NULL');
    expect(ast).toEqual({
      type: 'isNull',
      property: 'etat',
      negated: true,
    });
  });
});

describe('Temporal predicates', () => {
  it('parses T_BEFORE', () => {
    const ast = parseCql2("date_inspection T_BEFORE '2024-01-01'");
    expect(ast).toEqual({
      type: 'temporal',
      operator: 'T_BEFORE',
      property: 'date_inspection',
      value: '2024-01-01',
    });
  });

  it('parses T_AFTER', () => {
    const ast = parseCql2("date_inspection T_AFTER '2024-01-01'");
    expect(ast).toEqual({
      type: 'temporal',
      operator: 'T_AFTER',
      property: 'date_inspection',
      value: '2024-01-01',
    });
  });

  it('parses T_DURING with two timestamps', () => {
    const ast = parseCql2("date_inspection T_DURING '2024-01-01' '2024-12-31'");
    expect(ast).toEqual({
      type: 'temporal',
      operator: 'T_DURING',
      property: 'date_inspection',
      value: '2024-01-01',
      value2: '2024-12-31',
    });
  });
});

describe('LINESTRING geometry', () => {
  it('parses S_INTERSECTS with LINESTRING', () => {
    const ast = parseCql2('S_INTERSECTS(geometry,LINESTRING(-74 45,-73 46,-72 45))');
    expect(ast).toEqual(
      expect.objectContaining({
        type: 'spatial',
        operator: 'S_INTERSECTS',
        geometry: {
          type: 'LineString',
          coordinates: [[-74, 45], [-73, 46], [-72, 45]],
        },
      }),
    );
  });
});

describe('Error handling', () => {
  it('throws on unsupported geometry type', () => {
    expect(() => parseCql2('S_INTERSECTS(geometry,MULTIPOINT(0 0))')).toThrow('Unsupported geometry type');
  });

  it('throws on unexpected token', () => {
    expect(() => parseCql2("42='value'")).toThrow('Unexpected token');
  });
});
```

**Step 2: Run tests**

Run: `npm test -w packages/proxy -- --reporter=verbose src/engine/cql2/parser.test.ts`
Expected: All tests PASS

**Step 3: Commit**

```bash
git add packages/proxy/src/engine/cql2/parser.test.ts
git commit -m "test: add IN, BETWEEN, IS NULL, temporal, LINESTRING parser tests"
```

---

### Task 7: Test wfs/get-feature.ts (43% → ~80%)

**Files:**
- Create: `packages/proxy/src/wfs/get-feature.test.ts`
- Source: `packages/proxy/src/wfs/get-feature.ts`

**Step 1: Write the tests**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../engine/registry.js', () => ({
  getCollection: vi.fn(),
}));

vi.mock('../engine/adapter.js', () => ({
  fetchUpstreamItems: vi.fn(),
}));

vi.mock('../engine/geojson-builder.js', () => ({
  buildFeatureSafe: vi.fn(),
}));

vi.mock('../engine/cql2/evaluator.js', () => ({
  evaluateFilter: vi.fn(),
}));

import { parseGetFeatureGet, parseGetFeaturePost, executeGetFeature } from './get-feature.js';
import { getCollection } from '../engine/registry.js';
import { fetchUpstreamItems } from '../engine/adapter.js';
import { buildFeatureSafe } from '../engine/geojson-builder.js';

describe('WFS GetFeature', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('parseGetFeatureGet', () => {
    it('parses basic query parameters', () => {
      const params = parseGetFeatureGet({
        typename: 'bornes-fontaines',
        maxfeatures: '50',
        startindex: '10',
        outputformat: 'application/json',
        resulttype: 'results',
        srsname: 'EPSG:4326',
      });

      expect(params.typeName).toBe('bornes-fontaines');
      expect(params.maxFeatures).toBe(50);
      expect(params.startIndex).toBe(10);
      expect(params.outputFormat).toBe('application/json');
      expect(params.resultType).toBe('results');
      expect(params.srsName).toBe('EPSG:4326');
    });

    it('uses defaults for missing parameters', () => {
      const params = parseGetFeatureGet({});

      expect(params.typeName).toBe('');
      expect(params.maxFeatures).toBe(10);
      expect(params.startIndex).toBe(0);
      expect(params.resultType).toBe('results');
    });

    it('accepts typenames (WFS 2.0 parameter)', () => {
      const params = parseGetFeatureGet({ typenames: 'my-type' });
      expect(params.typeName).toBe('my-type');
    });

    it('accepts count (WFS 2.0) over maxfeatures', () => {
      const params = parseGetFeatureGet({ count: '25' });
      expect(params.maxFeatures).toBe(25);
    });

    it('parses cql_filter into filterNode', () => {
      const params = parseGetFeatureGet({ cql_filter: "etat='actif'" });
      expect(params.cqlFilter).toBe("etat='actif'");
      expect(params.filterNode).toBeDefined();
      expect(params.filterNode!.type).toBe('comparison');
    });

    it('throws on CQL filter exceeding max length', () => {
      const longFilter = 'x'.repeat(4097);
      expect(() => parseGetFeatureGet({ cql_filter: longFilter })).toThrow('exceeds maximum length');
    });
  });

  describe('parseGetFeaturePost', () => {
    it('parses basic WFS GetFeature XML', () => {
      const xml = `
        <GetFeature maxFeatures="50" startIndex="10" outputFormat="application/json" resultType="results">
          <Query typeName="bornes-fontaines" srsName="EPSG:4326"/>
        </GetFeature>
      `;
      const params = parseGetFeaturePost(xml);

      expect(params.typeName).toBe('bornes-fontaines');
      expect(params.maxFeatures).toBe(50);
      expect(params.startIndex).toBe(10);
      expect(params.srsName).toBe('EPSG:4326');
    });

    it('extracts BBOX from Filter', () => {
      const xml = `
        <GetFeature maxFeatures="10">
          <Query typeName="test">
            <Filter>
              <BBOX>
                <Envelope>
                  <lowerCorner>-74 45</lowerCorner>
                  <upperCorner>-73 46</upperCorner>
                </Envelope>
              </BBOX>
            </Filter>
          </Query>
        </GetFeature>
      `;
      const params = parseGetFeaturePost(xml);

      expect(params.bbox).toEqual([-74, 45, -73, 46]);
    });

    it('uses defaults when attributes are missing', () => {
      const xml = '<GetFeature><Query/></GetFeature>';
      const params = parseGetFeaturePost(xml);

      expect(params.typeName).toBe('');
      expect(params.maxFeatures).toBe(10);
      expect(params.startIndex).toBe(0);
      expect(params.resultType).toBe('results');
    });
  });

  describe('executeGetFeature', () => {
    it('returns null when collection not found', async () => {
      vi.mocked(getCollection).mockReturnValue(undefined);
      const result = await executeGetFeature({
        typeName: 'nonexistent',
        maxFeatures: 10,
        startIndex: 0,
        outputFormat: 'application/json',
        resultType: 'results',
        srsName: '',
      });
      expect(result).toBeNull();
    });

    it('returns hits-only response for resultType=hits', async () => {
      vi.mocked(getCollection).mockReturnValue({ title: 'Test' } as any);
      vi.mocked(fetchUpstreamItems).mockResolvedValue({ items: [{ id: 1 }], total: 42 });

      const result = await executeGetFeature({
        typeName: 'test',
        maxFeatures: 10,
        startIndex: 0,
        outputFormat: 'application/json',
        resultType: 'hits',
        srsName: '',
      });

      expect(result).toMatchObject({
        type: 'FeatureCollection',
        totalFeatures: 42,
        numberMatched: 42,
        numberReturned: 0,
        features: [],
      });
    });

    it('returns features for resultType=results', async () => {
      vi.mocked(getCollection).mockReturnValue({ title: 'Test' } as any);
      vi.mocked(fetchUpstreamItems).mockResolvedValue({
        items: [{ id: 1, x: -73.5, y: 45.5, name: 'A' }],
        total: 1,
      });
      vi.mocked(buildFeatureSafe).mockReturnValue({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [-73.5, 45.5] },
        properties: { name: 'A' },
      } as any);

      const result = await executeGetFeature({
        typeName: 'test',
        maxFeatures: 10,
        startIndex: 0,
        outputFormat: 'application/json',
        resultType: 'results',
        srsName: '',
      });

      expect(result!.type).toBe('FeatureCollection');
      expect(result!.features).toHaveLength(1);
      expect(result!.numberReturned).toBe(1);
    });

    it('reprojects to EPSG:3857 when requested', async () => {
      vi.mocked(getCollection).mockReturnValue({ title: 'Test' } as any);
      vi.mocked(fetchUpstreamItems).mockResolvedValue({
        items: [{ id: 1 }],
        total: 1,
      });
      vi.mocked(buildFeatureSafe).mockReturnValue({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [0, 0] },
        properties: {},
      } as any);

      const result = await executeGetFeature({
        typeName: 'test',
        maxFeatures: 10,
        startIndex: 0,
        outputFormat: 'application/json',
        resultType: 'results',
        srsName: 'EPSG:3857',
      });

      // Coordinates should be reprojected (0,0 in 4326 → 0,0 in 3857)
      const coords = (result!.features[0] as any).geometry.coordinates;
      expect(coords[0]).toBeCloseTo(0, 1);
      expect(coords[1]).toBeCloseTo(0, 1);
      expect(result!.crs.properties.name).toBe('urn:ogc:def:crs:EPSG::3857');
    });

    it('uses CRS84 URN by default', async () => {
      vi.mocked(getCollection).mockReturnValue({ title: 'Test' } as any);
      vi.mocked(fetchUpstreamItems).mockResolvedValue({ items: [], total: 0 });

      const result = await executeGetFeature({
        typeName: 'test',
        maxFeatures: 10,
        startIndex: 0,
        outputFormat: 'application/json',
        resultType: 'results',
        srsName: '',
      });

      expect(result!.crs.properties.name).toBe('urn:ogc:def:crs:OGC:1.3:CRS84');
    });
  });
});
```

**Step 2: Run tests**

Run: `npm test -w packages/proxy -- --reporter=verbose src/wfs/get-feature.test.ts`
Expected: All tests PASS

**Step 3: Commit**

```bash
git add packages/proxy/src/wfs/get-feature.test.ts
git commit -m "test: add unit tests for WFS GetFeature parsing and execution"
```

---

### Task 8: Test engine/adapter.ts resilience paths (57% → ~75%)

**Files:**
- Modify: `packages/proxy/src/engine/adapter.test.ts`
- Source: `packages/proxy/src/engine/adapter.ts`

**Step 1: Add tests for cache, rate limit, and circuit breaker**

Append inside the top-level describe block. These tests need additional mocks:

```typescript
// Add these vi.mock calls at the TOP of the file (before imports):
vi.mock('./cache.js', () => ({
  CacheService: vi.fn(),
}));

vi.mock('./upstream-rate-limit.js', () => ({
  getUpstreamBucket: vi.fn().mockReturnValue({ tryConsume: () => true }),
  TokenBucket: class TokenBucket { tryConsume() { return true; } },
}));

vi.mock('./circuit-breaker.js', () => ({
  getCircuitBreaker: vi.fn().mockReturnValue(null),
  CircuitState: { Closed: 0, Open: 1, HalfOpen: 2 },
}));

vi.mock('./retry.js', () => ({
  withRetry: vi.fn(async (fn: () => Promise<any>) => fn()),
}));

vi.mock('../metrics.js', () => ({
  upstreamRequestDuration: { observe: vi.fn() },
  upstreamErrorsTotal: { inc: vi.fn() },
  rateLimitRejectionsTotal: { inc: vi.fn() },
  circuitBreakerState: { set: vi.fn() },
  retryAttemptsTotal: { inc: vi.fn() },
  safeMetric: (fn: () => void) => fn(),
}));

// Then add these test cases:

describe('cache integration', () => {
  it('returns cached result when available', async () => {
    const cachedData = { items: [{ id: 'cached' }], total: 1 };
    const mockCache = {
      get: vi.fn().mockResolvedValue(cachedData),
      set: vi.fn(),
    };
    const configWithCache = {
      ...offsetLimitConfig,
      cache: { ttlSeconds: 300 },
    };

    vi.stubGlobal('fetch', vi.fn());

    const result = await fetchUpstreamItems(
      'test-cache', configWithCache, { offset: 0, limit: 10 },
      null, undefined, mockCache as any,
    );

    expect(result).toEqual(cachedData);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('stores result in cache after fetch', async () => {
    const mockCache = {
      get: vi.fn().mockResolvedValue(null),
      set: vi.fn(),
    };
    const configWithCache = {
      ...offsetLimitConfig,
      cache: { ttlSeconds: 300 },
    };

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ data: [{ id: 1 }], total: 1 }),
      }),
    );

    await fetchUpstreamItems(
      'test-cache', configWithCache, { offset: 0, limit: 10 },
      null, undefined, mockCache as any,
    );

    expect(mockCache.set).toHaveBeenCalledWith(
      'test-cache',
      expect.objectContaining({ offset: 0, limit: 10 }),
      expect.objectContaining({ items: [{ id: 1 }] }),
      300,
    );
  });
});

describe('rate limiting', () => {
  it('throws 429 when rate limit exceeded', async () => {
    const { getUpstreamBucket } = await import('./upstream-rate-limit.js');
    vi.mocked(getUpstreamBucket).mockReturnValue({
      tryConsume: () => false,
    } as any);

    const configWithRate = {
      ...offsetLimitConfig,
      rateLimit: { capacity: 10, refillRate: 1 },
    };

    await expect(
      fetchUpstreamItems('test-rate', configWithRate, { offset: 0, limit: 10 }),
    ).rejects.toThrow('Upstream error: 429');

    // Restore default mock
    vi.mocked(getUpstreamBucket).mockReturnValue({ tryConsume: () => true } as any);
  });
});

describe('circuit breaker', () => {
  it('throws 503 when circuit breaker is open', async () => {
    const { getCircuitBreaker } = await import('./circuit-breaker.js');
    vi.mocked(getCircuitBreaker).mockReturnValue({
      canExecute: () => false,
      state: 1, // Open
      recordFailure: vi.fn(),
      recordSuccess: vi.fn(),
    } as any);

    const configWithBreaker = {
      ...offsetLimitConfig,
      circuitBreaker: { failureThreshold: 3, resetTimeoutMs: 5000, halfOpenRequests: 1 },
    };

    await expect(
      fetchUpstreamItems('test-cb', configWithBreaker, { offset: 0, limit: 10 }),
    ).rejects.toThrow('Upstream error: 503');

    // Restore default mock
    vi.mocked(getCircuitBreaker).mockReturnValue(null);
  });
});

describe('bbox and extra params', () => {
  it('passes bbox to upstream URL', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ data: [], total: 0 }),
      }),
    );

    await fetchUpstreamItems('test-bbox', offsetLimitConfig, {
      offset: 0,
      limit: 10,
      bbox: [-74, 45, -73, 46],
    });

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('bbox=-74%2C45%2C-73%2C46'),
      expect.any(Object),
    );
  });

  it('passes upstream params to URL', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ data: [], total: 0 }),
      }),
    );

    await fetchUpstreamItems('test-params', offsetLimitConfig, {
      offset: 0,
      limit: 10,
      upstreamParams: { status: 'active' },
    });

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('status=active'),
      expect.any(Object),
    );
  });
});
```

Note: The mocks for `upstream-rate-limit`, `circuit-breaker`, `retry`, and `metrics` need to be placed at the **top** of the file, before any imports. This may require restructuring the existing test file. Keep the existing tests working.

**Step 2: Run tests**

Run: `npm test -w packages/proxy -- --reporter=verbose src/engine/adapter.test.ts`
Expected: All tests PASS (existing + new)

**Step 3: Commit**

```bash
git add packages/proxy/src/engine/adapter.test.ts
git commit -m "test: add cache, rate limit, circuit breaker, and param tests for adapter"
```

---

### Task 9: Raise coverage thresholds

**Files:**
- Modify: `packages/proxy/vitest.config.ts`

**Step 1: Run coverage to verify new levels**

Run: `npm run test:coverage -w packages/proxy`
Expected: Coverage should be above 80% lines, 85% functions

**Step 2: Update thresholds**

```typescript
thresholds: {
  lines: 80,
  functions: 85,
},
```

**Step 3: Run coverage again to confirm thresholds pass**

Run: `npm run test:coverage -w packages/proxy`
Expected: PASS with new thresholds

**Step 4: Commit**

```bash
git add packages/proxy/vitest.config.ts
git commit -m "chore: raise test coverage thresholds to 80% lines, 85% functions"
```

---

## Task Dependency Graph

```
Tasks 1-8 (parallel, independent test files)
    ↓
Task 9 (raise thresholds — depends on all tests passing)
```

Tasks 1-8 can all be executed in parallel since they modify independent files.
