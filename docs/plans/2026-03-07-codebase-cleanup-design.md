# Codebase Cleanup Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix 8 code quality issues identified during codebase evaluation — no new features, pure cleanup.

**Architecture:** All changes are independent refactors within the existing structure. No new patterns or abstractions introduced. Tests updated to match changed signatures.

**Tech Stack:** TypeScript, Express, Vitest, Docker

---

### Task 1: Comment intentional `==` in CQL2 evaluator

**Files:**
- Modify: `packages/proxy/src/engine/cql2/evaluator.ts:27-28`

**Step 1: Add comment explaining loose equality**

In `evaluator.ts`, add a comment above lines 27-28 explaining the intentional use of `==`/`!=`:

```typescript
// Intentional loose equality (==) to handle string/number coercion.
// GeoJSON properties may store "42" (string) while CQL2 parses 42 (number).
// Strict === would break filters like: population=50000
case '=': return val == target;
case '<>': return val != target;
```

**Step 2: Run unit tests**

Run: `cd packages/proxy && npx vitest run src/engine/cql2/evaluator.test.ts`
Expected: All pass, no changes to behavior.

**Step 3: Commit**

```bash
git add packages/proxy/src/engine/cql2/evaluator.ts
git commit -m "docs: comment intentional loose equality in CQL2 evaluator"
```

---

### Task 2: Extract `getBaseUrl()` into shared utility

**Files:**
- Create: `packages/proxy/src/utils/base-url.ts`
- Modify: `packages/proxy/src/ogc/landing.ts`
- Modify: `packages/proxy/src/ogc/collections.ts`
- Modify: `packages/proxy/src/ogc/items.ts`
- Modify: `packages/proxy/src/ogc/queryables.ts`

**Step 1: Create the utility file**

Create `packages/proxy/src/utils/base-url.ts`:

```typescript
import type { Request } from 'express';

export function getBaseUrl(req: Request): string {
  return process.env.BASE_URL || `${req.protocol}://${req.get('host')}/ogc`;
}
```

**Step 2: Replace in `landing.ts`**

Remove the local `getBaseUrl` function (lines 3-5). Add import:

```typescript
import { getBaseUrl } from '../utils/base-url.js';
```

**Step 3: Replace in `collections.ts`**

Remove the local `getBaseUrl` function (lines 4-6). Add import:

```typescript
import { getBaseUrl } from '../utils/base-url.js';
```

**Step 4: Replace in `queryables.ts`**

Remove the local `getBaseUrl` function (lines 4-6). Add import:

```typescript
import { getBaseUrl } from '../utils/base-url.js';
```

**Step 5: Replace in `items.ts`**

Remove the local `getBaseUrl` function (lines 13-15). Add import:

```typescript
import { getBaseUrl } from '../utils/base-url.js';
```

**Step 6: Run all unit tests**

Run: `cd packages/proxy && npx vitest run`
Expected: All pass.

**Step 7: Commit**

```bash
git add packages/proxy/src/utils/base-url.ts packages/proxy/src/ogc/
git commit -m "refactor: extract getBaseUrl() into shared utility"
```

---

### Task 3: Validate `filter-lang` parameter

**Files:**
- Modify: `packages/proxy/src/ogc/items.ts`
- Create: `packages/conformance-tests/src/ogc/filter-lang.test.ts`

**Step 1: Write conformance test**

Create `packages/conformance-tests/src/ogc/filter-lang.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { fetchGeoJson } from '../helpers.js';

describe('OGC API — filter-lang validation', () => {
  it('returns 400 for unsupported filter-lang', async () => {
    const filter = encodeURIComponent("etat='actif'");
    const { status, body } = await fetchGeoJson(
      `/ogc/collections/bornes-fontaines/items?filter=${filter}&filter-lang=cql-invalid`
    );
    expect(status).toBe(400);
    expect(body.code).toBe('InvalidFilterLang');
  });

  it('accepts cql2-text as filter-lang', async () => {
    const filter = encodeURIComponent("etat='actif'");
    const { status } = await fetchGeoJson(
      `/ogc/collections/bornes-fontaines/items?filter=${filter}&filter-lang=cql2-text`
    );
    expect(status).toBe(200);
  });

  it('defaults to cql2-text when filter-lang is omitted', async () => {
    const filter = encodeURIComponent("etat='actif'");
    const { status } = await fetchGeoJson(
      `/ogc/collections/bornes-fontaines/items?filter=${filter}`
    );
    expect(status).toBe(200);
  });
});
```

**Step 2: Add validation guard in `items.ts`**

In `getItems()`, add this block right after `const filterStr = ...` (after line 125):

```typescript
const filterLang = req.query['filter-lang'] as string | undefined;
if (filterStr && filterLang && filterLang !== 'cql2-text') {
  return res.status(400).json({
    code: 'InvalidFilterLang',
    description: `Unsupported filter language: '${filterLang}'. Only 'cql2-text' is supported.`,
  });
}
```

**Step 3: Run unit tests**

Run: `cd packages/proxy && npx vitest run`
Expected: All pass.

**Step 4: Run conformance tests**

Run: `npm run test:conformance`
Expected: All pass including new filter-lang tests.

**Step 5: Commit**

```bash
git add packages/proxy/src/ogc/items.ts packages/conformance-tests/src/ogc/filter-lang.test.ts
git commit -m "feat: validate filter-lang parameter, reject unsupported values"
```

---

### Task 4: Fix `buildFeatureCollection` to accept pre-built features

**Files:**
- Modify: `packages/proxy/src/engine/geojson-builder.ts:92-134`
- Modify: `packages/proxy/src/engine/geojson-builder.test.ts:64-123`
- Modify: `packages/proxy/src/ogc/items.ts` (call site)

**Step 1: Update `buildFeatureCollection` signature**

Change the function to accept `GeoJSON.Feature[]` instead of raw items. The function no longer calls `buildFeature` internally — the caller is responsible for building features first.

New signature in `geojson-builder.ts`:

```typescript
export function buildFeatureCollection(
  features: GeoJSON.Feature[],
  ctx: PaginationContext,
): OgcFeatureCollection {
  const itemsUrl = `${ctx.baseUrl}/collections/${ctx.collectionId}/items`;

  const links: Array<{ href: string; rel: string; type: string }> = [
    { href: `${itemsUrl}?offset=${ctx.offset}&limit=${ctx.limit}`, rel: 'self', type: 'application/geo+json' },
  ];

  if (ctx.total !== undefined && ctx.offset + ctx.limit < ctx.total) {
    links.push({
      href: `${itemsUrl}?offset=${ctx.offset + ctx.limit}&limit=${ctx.limit}`,
      rel: 'next',
      type: 'application/geo+json',
    });
  }

  if (ctx.offset > 0) {
    const prevOffset = Math.max(0, ctx.offset - ctx.limit);
    links.push({
      href: `${itemsUrl}?offset=${prevOffset}&limit=${ctx.limit}`,
      rel: 'prev',
      type: 'application/geo+json',
    });
  }

  const result: OgcFeatureCollection = {
    type: 'FeatureCollection',
    features,
    links,
    numberReturned: features.length,
    timeStamp: new Date().toISOString(),
  };

  if (ctx.total !== undefined) {
    result.numberMatched = ctx.total;
  }

  return result;
}
```

Remove the `config` parameter entirely. Remove the internal `items.map(item => buildFeature(item, config))` call.

**Step 2: Update tests in `geojson-builder.test.ts`**

Update tests to pass pre-built features instead of raw items:

```typescript
describe('buildFeatureCollection', () => {
  it('builds a FeatureCollection with links and counts', () => {
    const features = [
      buildFeature({ id: 1, x: -73.5, y: 45.5, etat: 'actif' }, pointConfig),
      buildFeature({ id: 2, x: -73.6, y: 45.6, etat: 'inactif' }, pointConfig),
    ];
    const fc = buildFeatureCollection(features, {
      baseUrl: 'http://localhost:3000/ogc',
      collectionId: 'test',
      offset: 0,
      limit: 10,
      total: 2,
    });
    expect(fc.type).toBe('FeatureCollection');
    expect(fc.features).toHaveLength(2);
    expect(fc.numberReturned).toBe(2);
    expect(fc.numberMatched).toBe(2);
  });

  it('includes next link when more items exist', () => {
    const features = [
      buildFeature({ id: 1, x: -73.5, y: 45.5, etat: 'actif' }, pointConfig),
    ];
    const fc = buildFeatureCollection(features, {
      baseUrl: 'http://localhost:3000/ogc',
      collectionId: 'test',
      offset: 0,
      limit: 1,
      total: 5,
    });
    const nextLink = fc.links.find((l: any) => l.rel === 'next');
    expect(nextLink).toBeDefined();
    expect(nextLink!.href).toContain('offset=1');
    expect(nextLink!.href).toContain('limit=1');
  });

  it('omits next link on last page', () => {
    const features = [
      buildFeature({ id: 1, x: -73.5, y: 45.5, etat: 'actif' }, pointConfig),
    ];
    const fc = buildFeatureCollection(features, {
      baseUrl: 'http://localhost:3000/ogc',
      collectionId: 'test',
      offset: 4,
      limit: 1,
      total: 5,
    });
    const nextLink = fc.links.find((l: any) => l.rel === 'next');
    expect(nextLink).toBeUndefined();
  });

  it('omits numberMatched when total is undefined', () => {
    const features = [
      buildFeature({ id: 1, x: -73.5, y: 45.5, etat: 'actif' }, pointConfig),
    ];
    const fc = buildFeatureCollection(features, {
      baseUrl: 'http://localhost:3000/ogc',
      collectionId: 'test',
      offset: 0,
      limit: 10,
      total: undefined,
    });
    expect(fc.numberMatched).toBeUndefined();
    expect(fc.numberReturned).toBe(1);
  });
});
```

**Step 3: Update call site in `items.ts`**

Replace the workaround block (around lines 226-231):

```typescript
// Before (workaround):
let fc = buildFeatureCollection([], config, { ... });
fc = { ...fc, features, numberReturned: features.length };

// After (clean):
let fc = buildFeatureCollection(features, { baseUrl: getBaseUrl(req), collectionId, offset, limit, total: upstream.total });
```

Remove the `config` argument from the `buildFeatureCollection` import usage. The `buildFeature` import stays since it's used earlier to build features.

**Step 4: Run all tests**

Run: `cd packages/proxy && npx vitest run`
Expected: All pass.

**Step 5: Commit**

```bash
git add packages/proxy/src/engine/geojson-builder.ts packages/proxy/src/engine/geojson-builder.test.ts packages/proxy/src/ogc/items.ts
git commit -m "refactor: buildFeatureCollection accepts pre-built features directly"
```

---

### Task 5: Decompose `getItems()` into helper functions

**Files:**
- Modify: `packages/proxy/src/ogc/items.ts`

This task extracts logical blocks from `getItems()` into named functions in the same file. No new files, no new exports.

**Step 1: Extract `parseItemsRequest` function**

Extract the parameter parsing block (limit, offset, bbox, filter, filter-lang, sortby, upstream params) into a helper:

```typescript
interface ParsedItemsRequest {
  limit: number;
  offset: number;
  bbox?: [number, number, number, number];
  cqlAst: CqlNode | null;
  filterStr?: string;
  filterLang?: string;
  sortbyStr?: string;
  upstreamParams: Record<string, string>;
  postFetchSimpleAst: CqlNode | null;
  queryParams: Record<string, string>;
  limits: LimitsResult;
}

function parseItemsRequest(req: Request, config: CollectionConfig, defaults: DefaultsConfig): ParsedItemsRequest | { error: { status: number; body: Record<string, string> } } {
  const rawLimit = parseInt(req.query.limit as string) || 10;
  const rawOffset = parseInt(req.query.offset as string) || 0;
  const limits = applyLimits({ limit: rawLimit, offset: rawOffset }, config, defaults);

  if (limits.rejected) {
    return { error: { status: 400, body: { code: 'LimitExceeded', description: `Offset ${rawOffset} exceeds maxFeatures (${limits.maxFeatures})` } } };
  }

  const { limit, offset } = limits;

  const bboxStr = req.query.bbox as string | undefined;
  let bbox = bboxStr ? parseBbox(bboxStr) : undefined;

  const filterStr = req.query.filter as string | undefined;
  const filterLang = req.query['filter-lang'] as string | undefined;

  if (filterStr && filterLang && filterLang !== 'cql2-text') {
    return { error: { status: 400, body: { code: 'InvalidFilterLang', description: `Unsupported filter language: '${filterLang}'. Only 'cql2-text' is supported.` } } };
  }

  let cqlAst: CqlNode | null = null;
  if (filterStr) {
    try {
      cqlAst = parseCql2(filterStr);
      if (!bbox) {
        bbox = extractBboxFromAst(cqlAst) ?? undefined;
      }
    } catch (err) {
      return { error: { status: 400, body: { code: 'InvalidFilter', description: err instanceof Error ? err.message : 'Invalid CQL2 filter' } } };
    }
  }

  const queryParams: Record<string, string> = {};
  for (const [key, val] of Object.entries(req.query)) {
    if (typeof val === 'string') queryParams[key] = val;
  }
  const upstreamParams = buildUpstreamFilters(queryParams, config.properties);
  const postFetchSimpleAst = buildPostFetchSimpleFilters(queryParams, config.properties);

  const sortbyStr = req.query.sortby as string | undefined;
  if (sortbyStr) {
    const sortFields = parseSortby(sortbyStr);
    const sortError = validateSortable(sortFields, config.properties);
    if (sortError) {
      return { error: { status: 400, body: { code: 'InvalidSortby', description: sortError } } };
    }
    const sortParams = buildUpstreamSort(sortFields, config.properties);
    Object.assign(upstreamParams, sortParams);
  }

  return { limit, offset, bbox, cqlAst, filterStr, filterLang, sortbyStr, upstreamParams, postFetchSimpleAst, queryParams, limits };
}
```

**Step 2: Extract `applyPostFilters` function**

```typescript
function applyPostFilters(
  features: GeoJSON.Feature[],
  bbox: [number, number, number, number] | undefined,
  cqlAst: CqlNode | null,
  postFetchSimpleAst: CqlNode | null,
  isWfs: boolean,
): GeoJSON.Feature[] {
  let result = features;
  if (bbox && !isWfs) {
    result = result.filter(f => isInBbox(f, bbox));
  }
  if (cqlAst) {
    result = result.filter(f => evaluateFilter(cqlAst, f));
  }
  if (postFetchSimpleAst) {
    result = result.filter(f => evaluateFilter(postFetchSimpleAst, f));
  }
  return result;
}
```

**Step 3: Simplify `getItems` to use the helpers**

The main `getItems` function becomes a clean orchestrator:

```typescript
export async function getItems(req: Request, res: Response) {
  const collectionId = req.params.collectionId as string;
  const config = getCollection(collectionId);
  if (!config) {
    return res.status(404).json({ code: 'NotFound', description: `Collection '${collectionId}' not found` });
  }

  const registry = getRegistry();
  const parsed = parseItemsRequest(req, config, registry.defaults ?? {});
  if ('error' in parsed) {
    return res.status(parsed.error.status).json(parsed.error.body);
  }

  const { limit, offset, bbox, cqlAst, filterStr, upstreamParams, postFetchSimpleAst, queryParams, limits } = parsed;
  const plugin = await getCollectionPlugin(collectionId);

  try {
    let ogcReq = { collectionId, limit, offset, bbox, filter: filterStr, filterLang: parsed.filterLang, sortby: parsed.sortbyStr, queryParams };
    ogcReq = await runHook(plugin, 'transformRequest', ogcReq);

    const upstream = await fetchUpstreamItems(config, { offset: ogcReq.offset, limit: ogcReq.limit, bbox: ogcReq.bbox, upstreamParams });

    let rawItems = await runHook(plugin, 'transformUpstreamResponse', upstream.items);

    let features: GeoJSON.Feature[];
    if (plugin?.skipGeojsonBuilder) {
      features = rawItems as unknown as GeoJSON.Feature[];
    } else {
      features = (rawItems as Record<string, unknown>[]).map(item => buildFeature(item, config));
    }

    if (plugin?.transformFeatures) features = await plugin.transformFeatures(features);
    if (plugin?.transformFeature) features = await Promise.all(features.map(f => plugin.transformFeature!(f)));

    features = applyPostFilters(features, bbox, cqlAst, postFetchSimpleAst, config.upstream.type === 'wfs');

    let fc = buildFeatureCollection(features, { baseUrl: getBaseUrl(req), collectionId, offset, limit, total: upstream.total });

    if (limits.suppressNext) {
      fc = { ...fc, links: fc.links.filter(l => l.rel !== 'next') };
    }

    fc = await runHook(plugin, 'transformResponse', fc);

    if (limits.capped) res.set('OGC-maxPageSize', String(limits.maxPageSize));
    res.set('Content-Type', 'application/geo+json');
    res.json(fc);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(502).json({ code: 'UpstreamError', description: message });
  }
}
```

**Step 4: Run all tests**

Run: `cd packages/proxy && npx vitest run`
Then: `npm run test:conformance`
Expected: All pass — pure refactor, no behavior change.

**Step 5: Commit**

```bash
git add packages/proxy/src/ogc/items.ts
git commit -m "refactor: decompose getItems() into parseItemsRequest and applyPostFilters"
```

---

### Task 6: Add dynamic WFS bounding boxes from registry

**Files:**
- Modify: `packages/proxy/src/engine/types.ts`
- Modify: `packages/proxy/src/config/collections.yaml`
- Modify: `packages/proxy/src/wfs/capabilities.ts`

**Step 1: Add `extent` to `CollectionConfig` type**

In `types.ts`, add to `CollectionConfig`:

```typescript
export interface CollectionConfig {
  title: string;
  description?: string;
  plugin?: string;
  maxPageSize?: number;
  maxFeatures?: number;
  extent?: {
    spatial: [number, number, number, number]; // [minLon, minLat, maxLon, maxLat]
  };
  upstream: { /* ... existing ... */ };
  // ... rest unchanged
}
```

**Step 2: Add extents to `collections.yaml`**

Add `extent` to each collection:

```yaml
collections:
  bornes-fontaines:
    title: "Bornes-fontaines"
    extent:
      spatial: [-73.98, 45.41, -73.47, 45.70]
    # ... rest unchanged

  pistes-cyclables:
    title: "Pistes cyclables"
    extent:
      spatial: [-73.98, 45.41, -73.47, 45.70]
    # ... rest unchanged

  arrondissements:
    title: "Arrondissements"
    extent:
      spatial: [-73.98, 45.41, -73.47, 45.70]
    # ... rest unchanged

  mrc-quebec:
    title: "MRC du Quebec"
    extent:
      spatial: [-79.76, 44.99, -56.93, 62.59]
    # ... rest unchanged
```

**Step 3: Update `capabilities.ts` to use extent from config**

Replace the hardcoded bounding box (lines 22-25) with config-driven values:

```typescript
const defaultExtent = [-73.98, 45.41, -73.47, 45.70];

const featureTypes = Object.entries(registry.collections).map(([id, config]) => {
  const [minLon, minLat, maxLon, maxLat] = config.extent?.spatial ?? defaultExtent;
  return `
    <FeatureType>
      <Name>${id}</Name>
      <Title>${config.title}</Title>
      <Abstract>${config.description || ''}</Abstract>
      <DefaultSRS>urn:ogc:def:crs:OGC:1.3:CRS84</DefaultSRS>
      <OtherSRS>urn:ogc:def:crs:EPSG::3857</OtherSRS>
      <ows:WGS84BoundingBox>
        <ows:LowerCorner>${minLon} ${minLat}</ows:LowerCorner>
        <ows:UpperCorner>${maxLon} ${maxLat}</ows:UpperCorner>
      </ows:WGS84BoundingBox>
    </FeatureType>`;
}).join('\n');
```

**Step 4: Run all tests**

Run: `npm run test:unit && npm run test:conformance`
Expected: All pass.

**Step 5: Commit**

```bash
git add packages/proxy/src/engine/types.ts packages/proxy/src/config/collections.yaml packages/proxy/src/wfs/capabilities.ts
git commit -m "feat: dynamic WFS bounding boxes from registry extent config"
```

---

### Task 7: Add Docker Compose and Dockerfiles

**Files:**
- Create: `packages/mock-api/Dockerfile`
- Create: `packages/proxy/Dockerfile`
- Create: `docker-compose.yml`

**Step 1: Create mock-api Dockerfile**

Create `packages/mock-api/Dockerfile`:

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package.json ./
RUN npm install --production
COPY dist/ ./dist/
EXPOSE 3001
CMD ["node", "dist/index.js"]
```

**Step 2: Create proxy Dockerfile**

Create `packages/proxy/Dockerfile`:

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package.json ./
RUN npm install --production
COPY dist/ ./dist/
COPY src/config/ ./dist/config/
EXPOSE 3000
CMD ["node", "dist/index.js"]
```

Note: `src/config/collections.yaml` is copied to `dist/config/` because the registry resolves the config path relative to `__dirname`.

**Step 3: Create `docker-compose.yml`**

Create `docker-compose.yml` at root:

```yaml
services:
  mock-api:
    build:
      context: ./packages/mock-api
    ports:
      - "3001:3001"
    environment:
      PORT: "3001"

  proxy:
    build:
      context: ./packages/proxy
    ports:
      - "3000:3000"
    depends_on:
      - mock-api
    environment:
      PORT: "3000"
      UPSTREAM_HOST: "http://mock-api:3001"

  mapstore:
    image: geosolutionsit/mapstore2
    ports:
      - "8080:8080"
    depends_on:
      - proxy
```

**Step 4: Verify build works**

Run: `npm run build`
Expected: Both packages compile to `dist/`.

**Step 5: Commit**

```bash
git add packages/mock-api/Dockerfile packages/proxy/Dockerfile docker-compose.yml
git commit -m "feat: add Docker Compose and Dockerfiles for local deployment"
```

---

### Task 8: Add README.md

**Files:**
- Create: `README.md`

**Step 1: Create README.md**

Create `README.md` at root:

```markdown
# OGC Proxy Municipal

Proxy that exposes heterogeneous internal REST APIs as OGC API Features and WFS services. Enables consumption by QGIS, MapStore, and web applications (Angular, React) without custom integration per API.

See [PRD](prd.md) for the full product vision and roadmap.

## Quick Start

### Local development

```bash
npm install
npm run dev
```

This starts:
- **Mock API** on `http://localhost:3001` — simulates 3 municipal REST APIs
- **Proxy** on `http://localhost:3000` — exposes OGC API Features (`/ogc/*`) and WFS (`/wfs`)

The proxy requires the `UPSTREAM_HOST` environment variable. In dev mode it defaults to `http://localhost:3001`.

### Docker Compose

```bash
npm run build
docker compose up
```

Starts mock-api, proxy, and MapStore (`http://localhost:8080`).

## Testing

```bash
npm test              # unit + conformance tests
npm run test:unit     # unit tests only (proxy engine)
npm run test:conformance  # end-to-end conformance tests
```

## Collections

The proxy serves 4 collections configured in `packages/proxy/src/config/collections.yaml`:

| Collection | Source | Geometry | Pagination |
|---|---|---|---|
| bornes-fontaines | Mock API | Point | offset/limit |
| pistes-cyclables | Mock API | LineString | page/pageSize |
| arrondissements | Mock API | Polygon | cursor |
| mrc-quebec | PAVICS Ouranos WFS | Polygon | WFS native |

## Project Structure

```
packages/
  proxy/          # OGC proxy server (core)
  mock-api/       # Simulated municipal REST APIs
  conformance-tests/  # OGC API Features conformance tests
docs/
  qgis-setup.md       # QGIS connection guide
  mapstore-setup.md   # MapStore connection guide
  testing-filters-sorting-pagination.md  # curl test recipes
```

## Endpoints

### OGC API Features (`/ogc`)

- `GET /ogc/` — Landing page
- `GET /ogc/conformance` — Conformance classes
- `GET /ogc/collections` — List collections
- `GET /ogc/collections/{id}` — Collection detail
- `GET /ogc/collections/{id}/queryables` — Filterable properties (Part 3)
- `GET /ogc/collections/{id}/items` — Features (GeoJSON)
- `GET /ogc/collections/{id}/items/{fid}` — Single feature

Supports: `limit`, `offset`, `bbox`, `filter` (CQL2), `sortby`, simple query string filters.

### WFS (`/wfs`)

- `GetCapabilities` — XML capabilities document
- `DescribeFeatureType` — JSON schema per type
- `GetFeature` — GeoJSON features (GET and POST)

## Documentation

- [PRD](prd.md) — Product requirements
- [QGIS Setup](docs/qgis-setup.md)
- [MapStore Setup](docs/mapstore-setup.md)
- [Testing Guide](docs/testing-filters-sorting-pagination.md)
```

**Step 2: Commit**

```bash
git add README.md
git commit -m "docs: add README with quick start, structure, and endpoint reference"
```
