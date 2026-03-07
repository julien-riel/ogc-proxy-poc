# Conformance Tests Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Reorganize and expand conformance tests to cover OGC API Features (Core, Filtering, Sorting), WFS 1.1.0, and WFS 2.0, with documentation mapping each test to spec requirements.

**Architecture:** Restructure `packages/conformance-tests/src/` into `ogc-api-features/{core,filtering,sorting}` and `wfs/{wfs11,wfs20}`. Add minimal WFS 2.0 support in the proxy (version negotiation + capabilities 2.0). Create conformance docs in `docs/conformance/`.

**Tech Stack:** Vitest, TypeScript, Express (proxy modifications)

---

### Task 1: Restructure test directories

**Files:**
- Create: `packages/conformance-tests/src/ogc-api-features/core/` (directory)
- Create: `packages/conformance-tests/src/ogc-api-features/filtering/` (directory)
- Create: `packages/conformance-tests/src/ogc-api-features/sorting/` (directory)
- Create: `packages/conformance-tests/src/wfs/wfs11/` (directory)
- Create: `packages/conformance-tests/src/wfs/wfs20/` (directory)

**Step 1: Create directory structure**

Run: `mkdir -p packages/conformance-tests/src/ogc-api-features/{core,filtering,sorting} packages/conformance-tests/src/wfs/{wfs11,wfs20}`

**Step 2: Commit**

```bash
git add packages/conformance-tests/src/
git commit -m "chore: create new conformance test directory structure"
```

---

### Task 2: Migrate and expand Core — Landing page tests

**Files:**
- Create: `packages/conformance-tests/src/ogc-api-features/core/landing.test.ts`
- Delete: `packages/conformance-tests/src/ogc/landing.test.ts`

**Step 1: Write the test file**

```typescript
import { describe, it, expect } from 'vitest';
import { fetchJson } from '../../helpers.js';

describe('OGC API Features Core — Landing Page (/ogc/)', () => {
  // /req/core/root-op
  it('supports HTTP GET at root path', async () => {
    const { status } = await fetchJson('/ogc/');
    expect(status).toBe(200);
  });

  // /req/core/root-success
  it('returns a body with links array', async () => {
    const { body } = await fetchJson('/ogc/');
    expect(body.links).toBeDefined();
    expect(Array.isArray(body.links)).toBe(true);
    expect(body.links.length).toBeGreaterThan(0);
  });

  it('has title and description', async () => {
    const { body } = await fetchJson('/ogc/');
    expect(body.title).toBeDefined();
  });

  // /req/core/root-success — required links
  it('has a service-desc or service-doc link', async () => {
    const { body } = await fetchJson('/ogc/');
    const hasServiceDesc = body.links.some(
      (l: any) => l.rel === 'service-desc' || l.rel === 'service-doc'
    );
    expect(hasServiceDesc).toBe(true);
  });

  it('has a conformance link', async () => {
    const { body } = await fetchJson('/ogc/');
    const link = body.links.find((l: any) => l.rel === 'conformance');
    expect(link).toBeDefined();
    expect(link.href).toBeDefined();
    expect(link.type).toBeDefined();
  });

  it('has a data link pointing to collections', async () => {
    const { body } = await fetchJson('/ogc/');
    const link = body.links.find((l: any) => l.rel === 'data');
    expect(link).toBeDefined();
    expect(link.href).toContain('/collections');
    expect(link.type).toBeDefined();
  });

  // Every link has rel, type, and href
  it('every link has rel, type, and href', async () => {
    const { body } = await fetchJson('/ogc/');
    for (const link of body.links) {
      expect(link.rel).toBeDefined();
      expect(link.type).toBeDefined();
      expect(link.href).toBeDefined();
    }
  });

  // /rec/core/root-links — self link
  it('has a self link', async () => {
    const { body } = await fetchJson('/ogc/');
    const selfLink = body.links.find((l: any) => l.rel === 'self');
    expect(selfLink).toBeDefined();
  });
});
```

**Step 2: Run tests to verify they pass**

Run: `cd packages/conformance-tests && npx vitest run src/ogc-api-features/core/landing.test.ts`
Expected: All PASS

**Step 3: Delete old test**

Run: `rm packages/conformance-tests/src/ogc/landing.test.ts`

**Step 4: Commit**

```bash
git add -A packages/conformance-tests/src/ogc-api-features/core/landing.test.ts
git add -A packages/conformance-tests/src/ogc/landing.test.ts
git commit -m "test: migrate and expand landing page conformance tests"
```

---

### Task 3: Migrate and expand Core — Conformance tests

**Files:**
- Create: `packages/conformance-tests/src/ogc-api-features/core/conformance.test.ts`
- Delete: `packages/conformance-tests/src/ogc/conformance.test.ts`

**Step 1: Write the test file**

```typescript
import { describe, it, expect } from 'vitest';
import { fetchJson } from '../../helpers.js';

describe('OGC API Features Core — Conformance (/ogc/conformance)', () => {
  // /req/core/conformance-op
  it('supports HTTP GET at /conformance', async () => {
    const { status } = await fetchJson('/ogc/conformance');
    expect(status).toBe(200);
  });

  // /req/core/conformance-success
  it('returns conformsTo as an array', async () => {
    const { body } = await fetchJson('/ogc/conformance');
    expect(Array.isArray(body.conformsTo)).toBe(true);
    expect(body.conformsTo.length).toBeGreaterThan(0);
  });

  it('declares Core conformance class', async () => {
    const { body } = await fetchJson('/ogc/conformance');
    expect(body.conformsTo).toContain(
      'http://www.opengis.net/spec/ogcapi-features-1/1.0/conf/core'
    );
  });

  it('declares GeoJSON conformance class', async () => {
    const { body } = await fetchJson('/ogc/conformance');
    expect(body.conformsTo).toContain(
      'http://www.opengis.net/spec/ogcapi-features-1/1.0/conf/geojson'
    );
  });

  it('declares Filter conformance class', async () => {
    const { body } = await fetchJson('/ogc/conformance');
    expect(body.conformsTo).toContain(
      'http://www.opengis.net/spec/ogcapi-features-3/1.0/conf/filter'
    );
  });

  it('declares Features Filter conformance class', async () => {
    const { body } = await fetchJson('/ogc/conformance');
    expect(body.conformsTo).toContain(
      'http://www.opengis.net/spec/ogcapi-features-3/1.0/conf/features-filter'
    );
  });

  it('all conformsTo entries are valid URIs', async () => {
    const { body } = await fetchJson('/ogc/conformance');
    for (const uri of body.conformsTo) {
      expect(uri).toMatch(/^https?:\/\//);
    }
  });
});
```

**Step 2: Run tests**

Run: `cd packages/conformance-tests && npx vitest run src/ogc-api-features/core/conformance.test.ts`
Expected: All PASS

**Step 3: Delete old test and commit**

```bash
rm packages/conformance-tests/src/ogc/conformance.test.ts
git add -A packages/conformance-tests/
git commit -m "test: migrate and expand conformance endpoint tests"
```

---

### Task 4: Migrate and expand Core — Collections tests

**Files:**
- Create: `packages/conformance-tests/src/ogc-api-features/core/collections.test.ts`
- Delete: `packages/conformance-tests/src/ogc/collections.test.ts`

**Step 1: Write the test file**

```typescript
import { describe, it, expect } from 'vitest';
import { fetchJson } from '../../helpers.js';

describe('OGC API Features Core — Collections (/ogc/collections)', () => {
  // /req/core/collections-op
  it('supports HTTP GET at /collections', async () => {
    const { status } = await fetchJson('/ogc/collections');
    expect(status).toBe(200);
  });

  // /req/core/collections-success
  it('returns links and collections arrays', async () => {
    const { body } = await fetchJson('/ogc/collections');
    expect(Array.isArray(body.links)).toBe(true);
    expect(Array.isArray(body.collections)).toBe(true);
  });

  it('has a self link', async () => {
    const { body } = await fetchJson('/ogc/collections');
    const selfLink = body.links.find((l: any) => l.rel === 'self');
    expect(selfLink).toBeDefined();
    expect(selfLink.type).toBeDefined();
  });

  it('contains expected collections', async () => {
    const { body } = await fetchJson('/ogc/collections');
    const ids = body.collections.map((c: any) => c.id);
    expect(ids).toContain('bornes-fontaines');
    expect(ids).toContain('pistes-cyclables');
    expect(ids).toContain('arrondissements');
  });

  it('each collection has id, title, and links', async () => {
    const { body } = await fetchJson('/ogc/collections');
    for (const col of body.collections) {
      expect(col.id).toBeDefined();
      expect(col.title).toBeDefined();
      expect(Array.isArray(col.links)).toBe(true);
    }
  });

  it('each collection has an items link with geo+json type', async () => {
    const { body } = await fetchJson('/ogc/collections');
    for (const col of body.collections) {
      const itemsLink = col.links.find((l: any) => l.rel === 'items');
      expect(itemsLink).toBeDefined();
      expect(itemsLink.type).toBe('application/geo+json');
    }
  });

  it('each collection declares CRS84 as default CRS', async () => {
    const { body } = await fetchJson('/ogc/collections');
    for (const col of body.collections) {
      expect(col.crs).toContain('http://www.opengis.net/def/crs/OGC/1.3/CRS84');
    }
  });

  it('collections with extent include spatial bbox', async () => {
    const { body } = await fetchJson('/ogc/collections');
    for (const col of body.collections) {
      if (col.extent) {
        expect(col.extent.spatial).toBeDefined();
        expect(col.extent.spatial.bbox).toBeDefined();
        expect(col.extent.spatial.bbox[0]).toHaveLength(4);
      }
    }
  });
});

describe('OGC API Features Core — Single Collection (/ogc/collections/:id)', () => {
  // /req/core/collection-op
  it('supports HTTP GET for a single collection', async () => {
    const { status } = await fetchJson('/ogc/collections/bornes-fontaines');
    expect(status).toBe(200);
  });

  // /req/core/collection-success
  it('returns correct id and title', async () => {
    const { body } = await fetchJson('/ogc/collections/bornes-fontaines');
    expect(body.id).toBe('bornes-fontaines');
    expect(body.title).toBe('Bornes-fontaines');
  });

  it('has links array with items link', async () => {
    const { body } = await fetchJson('/ogc/collections/bornes-fontaines');
    expect(Array.isArray(body.links)).toBe(true);
    const itemsLink = body.links.find((l: any) => l.rel === 'items');
    expect(itemsLink).toBeDefined();
  });

  it('returns 404 for unknown collection', async () => {
    const { status } = await fetchJson('/ogc/collections/unknown');
    expect(status).toBe(404);
  });
});
```

**Step 2: Run, delete old, commit**

```bash
cd packages/conformance-tests && npx vitest run src/ogc-api-features/core/collections.test.ts
rm packages/conformance-tests/src/ogc/collections.test.ts
git add -A packages/conformance-tests/
git commit -m "test: migrate and expand collections conformance tests"
```

---

### Task 5: Migrate and expand Core — Items and Feature tests

**Files:**
- Create: `packages/conformance-tests/src/ogc-api-features/core/items.test.ts`
- Delete: `packages/conformance-tests/src/ogc/items.test.ts`
- Delete: `packages/conformance-tests/src/ogc/limits.test.ts`

This file merges existing items.test.ts and limits.test.ts, plus adds new tests for pagination prev link, timeStamp format, and single feature tests.

**Step 1: Write the test file**

```typescript
import { describe, it, expect } from 'vitest';
import { fetchGeoJson, fetchJson } from '../../helpers.js';

describe('OGC API Features Core — Items (/ogc/collections/:id/items)', () => {
  // /req/core/items-op
  it('supports HTTP GET at items path', async () => {
    const { status, body } = await fetchGeoJson('/ogc/collections/bornes-fontaines/items');
    expect(status).toBe(200);
    expect(body.type).toBe('FeatureCollection');
  });

  it('returns application/geo+json content type', async () => {
    const { contentType } = await fetchGeoJson('/ogc/collections/bornes-fontaines/items');
    expect(contentType).toContain('application/geo+json');
  });

  it('has features array with valid GeoJSON structure', async () => {
    const { body } = await fetchGeoJson('/ogc/collections/bornes-fontaines/items');
    expect(Array.isArray(body.features)).toBe(true);
    expect(body.features.length).toBeGreaterThan(0);
    for (const feature of body.features) {
      expect(feature.type).toBe('Feature');
      expect(feature.geometry).toBeDefined();
      expect(feature.geometry.type).toBeDefined();
      expect(feature.geometry.coordinates).toBeDefined();
      expect(feature.properties).toBeDefined();
      expect(feature.id).toBeDefined();
    }
  });

  it('has self link', async () => {
    const { body } = await fetchGeoJson('/ogc/collections/bornes-fontaines/items');
    const selfLink = body.links.find((l: any) => l.rel === 'self');
    expect(selfLink).toBeDefined();
    expect(selfLink.type).toBe('application/geo+json');
  });

  // /req/core/items-response-structure — numberReturned
  it('has numberReturned matching features count', async () => {
    const { body } = await fetchGeoJson('/ogc/collections/bornes-fontaines/items');
    expect(body.numberReturned).toBe(body.features.length);
  });

  // /req/core/items-response-structure — timeStamp
  it('has timeStamp in ISO 8601 format', async () => {
    const { body } = await fetchGeoJson('/ogc/collections/bornes-fontaines/items');
    expect(body.timeStamp).toBeDefined();
    expect(new Date(body.timeStamp).toISOString()).toBe(body.timeStamp);
  });

  // numberMatched when upstream provides total
  it('has numberMatched when upstream provides total', async () => {
    const { body } = await fetchGeoJson('/ogc/collections/bornes-fontaines/items');
    expect(body.numberMatched).toBeDefined();
    expect(body.numberMatched).toBe(15);
  });

  it('omits numberMatched when upstream has no total', async () => {
    const { body } = await fetchGeoJson('/ogc/collections/arrondissements/items');
    expect(body.numberMatched).toBeUndefined();
  });

  describe('Geometry types', () => {
    it('returns Point geometry for bornes-fontaines', async () => {
      const { body } = await fetchGeoJson('/ogc/collections/bornes-fontaines/items?limit=1');
      expect(body.features[0].geometry.type).toBe('Point');
      expect(body.features[0].geometry.coordinates).toHaveLength(2);
    });

    it('returns LineString geometry for pistes-cyclables', async () => {
      const { body } = await fetchGeoJson('/ogc/collections/pistes-cyclables/items?limit=1');
      expect(body.features[0].geometry.type).toBe('LineString');
      expect(body.features[0].geometry.coordinates.length).toBeGreaterThan(1);
    });

    it('returns Polygon geometry for arrondissements', async () => {
      const { body } = await fetchGeoJson('/ogc/collections/arrondissements/items?limit=1');
      expect(body.features[0].geometry.type).toBe('Polygon');
    });
  });

  describe('Pagination', () => {
    // /req/core/items-limit-param
    it('respects limit parameter', async () => {
      const { body } = await fetchGeoJson('/ogc/collections/bornes-fontaines/items?limit=3');
      expect(body.features).toHaveLength(3);
      expect(body.numberReturned).toBe(3);
    });

    it('includes next link when more items exist', async () => {
      const { body } = await fetchGeoJson('/ogc/collections/bornes-fontaines/items?limit=2');
      const nextLink = body.links.find((l: any) => l.rel === 'next');
      expect(nextLink).toBeDefined();
      expect(nextLink.type).toBe('application/geo+json');
    });

    it('next link returns valid FeatureCollection', async () => {
      const { body: page1 } = await fetchGeoJson('/ogc/collections/bornes-fontaines/items?limit=2');
      const nextLink = page1.links.find((l: any) => l.rel === 'next');
      expect(nextLink).toBeDefined();

      const nextUrl = new URL(nextLink.href);
      const res = await fetch(nextUrl.toString());
      const page2 = await res.json();
      expect(page2.type).toBe('FeatureCollection');
      expect(page2.features.length).toBeGreaterThan(0);
    });

    it('includes prev link when offset > 0', async () => {
      const { body } = await fetchGeoJson('/ogc/collections/bornes-fontaines/items?limit=2&offset=4');
      const prevLink = body.links.find((l: any) => l.rel === 'prev');
      expect(prevLink).toBeDefined();
      expect(prevLink.type).toBe('application/geo+json');
    });

    it('does not include prev link on first page', async () => {
      const { body } = await fetchGeoJson('/ogc/collections/bornes-fontaines/items?limit=2');
      const prevLink = body.links.find((l: any) => l.rel === 'prev');
      expect(prevLink).toBeUndefined();
    });

    it('no next link on last page', async () => {
      const { body } = await fetchGeoJson('/ogc/collections/bornes-fontaines/items?limit=100');
      // 15 items total, limit=100 means all fit on one page
      const nextLink = body.links.find((l: any) => l.rel === 'next');
      expect(nextLink).toBeUndefined();
    });

    it('pages contain different features', async () => {
      const { body: page1 } = await fetchGeoJson('/ogc/collections/bornes-fontaines/items?limit=3&offset=0');
      const { body: page2 } = await fetchGeoJson('/ogc/collections/bornes-fontaines/items?limit=3&offset=3');
      const ids1 = page1.features.map((f: any) => f.id);
      const ids2 = page2.features.map((f: any) => f.id);
      expect(ids1).not.toEqual(ids2);
    });

    // Limits enforcement
    it('caps limit to maxPageSize', async () => {
      const { body } = await fetchGeoJson('/ogc/collections/bornes-fontaines/items?limit=5000');
      expect(body.features.length).toBeLessThanOrEqual(1000);
    });
  });
});

describe('OGC API Features Core — Single Feature (/ogc/collections/:id/items/:fid)', () => {
  // /req/core/feature-op
  it('supports HTTP GET for a single feature', async () => {
    const { status, body } = await fetchGeoJson('/ogc/collections/bornes-fontaines/items/1');
    expect(status).toBe(200);
    expect(body.type).toBe('Feature');
  });

  // /req/core/feature-success
  it('has geometry and properties', async () => {
    const { body } = await fetchGeoJson('/ogc/collections/bornes-fontaines/items/1');
    expect(body.geometry).toBeDefined();
    expect(body.properties).toBeDefined();
  });

  it('has self link', async () => {
    const { body } = await fetchGeoJson('/ogc/collections/bornes-fontaines/items/1');
    const selfLink = body.links.find((l: any) => l.rel === 'self');
    expect(selfLink).toBeDefined();
    expect(selfLink.type).toBe('application/geo+json');
  });

  it('has collection link', async () => {
    const { body } = await fetchGeoJson('/ogc/collections/bornes-fontaines/items/1');
    const colLink = body.links.find((l: any) => l.rel === 'collection');
    expect(colLink).toBeDefined();
    expect(colLink.type).toBe('application/json');
  });

  it('returns 404 for unknown feature', async () => {
    const { status } = await fetchJson('/ogc/collections/bornes-fontaines/items/99999');
    expect(status).toBe(404);
  });

  it('returns 404 for unknown collection', async () => {
    const { status } = await fetchJson('/ogc/collections/unknown/items/1');
    expect(status).toBe(404);
  });
});
```

**Step 2: Run, delete old files, commit**

```bash
cd packages/conformance-tests && npx vitest run src/ogc-api-features/core/items.test.ts
rm packages/conformance-tests/src/ogc/items.test.ts packages/conformance-tests/src/ogc/limits.test.ts
git add -A packages/conformance-tests/
git commit -m "test: migrate and expand items/feature conformance tests"
```

---

### Task 6: Add Core — Error handling and HTTP tests

**Files:**
- Create: `packages/conformance-tests/src/ogc-api-features/core/error-handling.test.ts`
- Create: `packages/conformance-tests/src/ogc-api-features/core/http.test.ts`

**Step 1: Write error-handling.test.ts**

```typescript
import { describe, it, expect } from 'vitest';
import { fetchJson, fetchGeoJson, BASE_URL } from '../../helpers.js';

describe('OGC API Features Core — Error Handling', () => {
  // /req/core/query-param-invalid
  it('returns 400 for invalid limit value', async () => {
    const { status } = await fetchGeoJson('/ogc/collections/bornes-fontaines/items?limit=-1');
    expect(status).toBe(400);
  });

  it('returns 404 for non-existent collection', async () => {
    const { status } = await fetchJson('/ogc/collections/does-not-exist');
    expect(status).toBe(404);
  });

  it('returns 404 for non-existent feature', async () => {
    const { status } = await fetchJson('/ogc/collections/bornes-fontaines/items/99999');
    expect(status).toBe(404);
  });

  it('returns 404 for items of non-existent collection', async () => {
    const { status } = await fetchGeoJson('/ogc/collections/does-not-exist/items');
    expect(status).toBe(404);
  });

  it('returns 404 for queryables of non-existent collection', async () => {
    const { status } = await fetchJson('/ogc/collections/does-not-exist/queryables');
    expect(status).toBe(404);
  });

  it('returns 400 for invalid CQL2 filter', async () => {
    const filter = encodeURIComponent('INVALID SYNTAX !!!');
    const { status } = await fetchGeoJson(
      `/ogc/collections/bornes-fontaines/items?filter=${filter}&filter-lang=cql2-text`
    );
    expect(status).toBe(400);
  });

  it('returns 400 for unsupported filter-lang', async () => {
    const filter = encodeURIComponent("etat='actif'");
    const { status, body } = await fetchGeoJson(
      `/ogc/collections/bornes-fontaines/items?filter=${filter}&filter-lang=cql-invalid`
    );
    expect(status).toBe(400);
    expect(body.code).toBe('InvalidFilterLang');
  });

  it('returns 400 for non-sortable field', async () => {
    const { status } = await fetchGeoJson(
      '/ogc/collections/bornes-fontaines/items?sortby=etat'
    );
    expect(status).toBe(400);
  });
});
```

**Step 2: Write http.test.ts**

```typescript
import { describe, it, expect } from 'vitest';
import { BASE_URL } from '../../helpers.js';

describe('OGC API Features Core — HTTP', () => {
  // /rec/core/cross-origin
  it('includes CORS headers', async () => {
    const res = await fetch(`${BASE_URL}/ogc/`, {
      headers: { Origin: 'http://example.com' },
    });
    const acao = res.headers.get('access-control-allow-origin');
    expect(acao).toBeDefined();
  });

  // Content-Type on items
  it('items endpoint returns application/geo+json', async () => {
    const res = await fetch(`${BASE_URL}/ogc/collections/bornes-fontaines/items`);
    expect(res.headers.get('content-type')).toContain('application/geo+json');
  });

  // Content-Type on collection
  it('collection endpoint returns application/json', async () => {
    const res = await fetch(`${BASE_URL}/ogc/collections/bornes-fontaines`, {
      headers: { Accept: 'application/json' },
    });
    expect(res.headers.get('content-type')).toContain('application/json');
  });

  // Content-Type on landing page
  it('landing page returns application/json', async () => {
    const res = await fetch(`${BASE_URL}/ogc/`, {
      headers: { Accept: 'application/json' },
    });
    expect(res.headers.get('content-type')).toContain('application/json');
  });
});
```

**Step 3: Run tests**

Run: `cd packages/conformance-tests && npx vitest run src/ogc-api-features/core/error-handling.test.ts src/ogc-api-features/core/http.test.ts`
Expected: All PASS (some error-handling tests may need proxy adjustments — note which ones fail)

**Step 4: Commit**

```bash
git add packages/conformance-tests/src/ogc-api-features/core/error-handling.test.ts packages/conformance-tests/src/ogc-api-features/core/http.test.ts
git commit -m "test: add error handling and HTTP conformance tests"
```

---

### Task 7: Migrate and expand Filtering — Queryables tests

**Files:**
- Create: `packages/conformance-tests/src/ogc-api-features/filtering/queryables.test.ts`
- Delete: `packages/conformance-tests/src/ogc/queryables.test.ts`

**Step 1: Write the test file**

```typescript
import { describe, it, expect } from 'vitest';
import { fetchJson } from '../../helpers.js';

describe('OGC API Features Filtering — Queryables', () => {
  // /req/queryables/get-queryables-op
  it('supports HTTP GET at queryables path', async () => {
    const { status } = await fetchJson('/ogc/collections/bornes-fontaines/queryables');
    expect(status).toBe(200);
  });

  // /req/queryables/get-queryables-response — $schema
  it('returns JSON Schema with $schema property', async () => {
    const { body } = await fetchJson('/ogc/collections/bornes-fontaines/queryables');
    expect(body.$schema).toContain('json-schema.org');
  });

  // /req/queryables/get-queryables-response — type object
  it('has type: object', async () => {
    const { body } = await fetchJson('/ogc/collections/bornes-fontaines/queryables');
    expect(body.type).toBe('object');
  });

  // /req/queryables/get-queryables-response — properties
  it('lists filterable properties', async () => {
    const { body } = await fetchJson('/ogc/collections/bornes-fontaines/queryables');
    expect(body.properties).toBeDefined();
    expect(body.properties.etat).toBeDefined();
    expect(body.properties.arrondissement).toBeDefined();
  });

  // Geometry queryable with format
  it('includes geometry for spatial queries', async () => {
    const { body } = await fetchJson('/ogc/collections/bornes-fontaines/queryables');
    expect(body.properties.geometry).toBeDefined();
  });

  // Sortable annotation
  it('annotates sortable properties', async () => {
    const { body } = await fetchJson('/ogc/collections/arrondissements/queryables');
    expect(body.properties.population['x-ogc-sortable']).toBe(true);
  });

  // Different collections have different queryables
  it('returns different queryables per collection', async () => {
    const { body: bornes } = await fetchJson('/ogc/collections/bornes-fontaines/queryables');
    const { body: pistes } = await fetchJson('/ogc/collections/pistes-cyclables/queryables');
    expect(Object.keys(bornes.properties)).not.toEqual(Object.keys(pistes.properties));
  });

  it('returns 404 for unknown collection', async () => {
    const { status } = await fetchJson('/ogc/collections/unknown/queryables');
    expect(status).toBe(404);
  });
});
```

**Step 2: Run, delete old, commit**

```bash
cd packages/conformance-tests && npx vitest run src/ogc-api-features/filtering/queryables.test.ts
rm packages/conformance-tests/src/ogc/queryables.test.ts
git add -A packages/conformance-tests/
git commit -m "test: migrate and expand queryables conformance tests"
```

---

### Task 8: Migrate and expand Filtering — Query params and filter-lang tests

**Files:**
- Create: `packages/conformance-tests/src/ogc-api-features/filtering/query-params.test.ts`
- Create: `packages/conformance-tests/src/ogc-api-features/filtering/filter-lang.test.ts`
- Delete: `packages/conformance-tests/src/ogc/filters.test.ts`
- Delete: `packages/conformance-tests/src/ogc/filter-lang.test.ts`

**Step 1: Write query-params.test.ts**

```typescript
import { describe, it, expect } from 'vitest';
import { fetchGeoJson } from '../../helpers.js';

describe('OGC API Features Filtering — Query Parameter Filters', () => {
  // /req/queryables-query-parameters/parameters
  it('filters by single property', async () => {
    const { body } = await fetchGeoJson(
      '/ogc/collections/bornes-fontaines/items?etat=actif&limit=100'
    );
    expect(body.features.length).toBeGreaterThan(0);
    for (const f of body.features) {
      expect(f.properties.etat).toBe('actif');
    }
  });

  it('filters by different property', async () => {
    const { body } = await fetchGeoJson(
      '/ogc/collections/bornes-fontaines/items?arrondissement=Verdun&limit=100'
    );
    expect(body.features.length).toBeGreaterThan(0);
    for (const f of body.features) {
      expect(f.properties.arrondissement).toBe('Verdun');
    }
  });

  // /req/filter/mixing-expressions — combined filters
  it('combines two property filters with AND semantics', async () => {
    const { body } = await fetchGeoJson(
      '/ogc/collections/bornes-fontaines/items?etat=actif&arrondissement=Verdun&limit=100'
    );
    for (const f of body.features) {
      expect(f.properties.etat).toBe('actif');
      expect(f.properties.arrondissement).toBe('Verdun');
    }
  });

  it('returns fewer results when filter is applied', async () => {
    const { body: all } = await fetchGeoJson('/ogc/collections/bornes-fontaines/items?limit=100');
    const { body: filtered } = await fetchGeoJson(
      '/ogc/collections/bornes-fontaines/items?etat=actif&limit=100'
    );
    expect(filtered.features.length).toBeLessThan(all.features.length);
  });

  it('returns empty features for non-matching filter', async () => {
    const { body } = await fetchGeoJson(
      '/ogc/collections/bornes-fontaines/items?etat=nonexistent&limit=100'
    );
    expect(body.features).toHaveLength(0);
  });
});
```

**Step 2: Write filter-lang.test.ts**

```typescript
import { describe, it, expect } from 'vitest';
import { fetchGeoJson } from '../../helpers.js';

describe('OGC API Features Filtering — filter-lang Parameter', () => {
  // /req/filter/filter-lang-param
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

  it('returns 400 for unsupported filter-lang', async () => {
    const filter = encodeURIComponent("etat='actif'");
    const { status, body } = await fetchGeoJson(
      `/ogc/collections/bornes-fontaines/items?filter=${filter}&filter-lang=cql-invalid`
    );
    expect(status).toBe(400);
    expect(body.code).toBe('InvalidFilterLang');
  });
});
```

**Step 3: Run, delete old, commit**

```bash
cd packages/conformance-tests && npx vitest run src/ogc-api-features/filtering/query-params.test.ts src/ogc-api-features/filtering/filter-lang.test.ts
rm packages/conformance-tests/src/ogc/filters.test.ts packages/conformance-tests/src/ogc/filter-lang.test.ts
git add -A packages/conformance-tests/
git commit -m "test: migrate and expand query params and filter-lang tests"
```

---

### Task 9: Add Filtering — CQL2 Basic tests

**Files:**
- Create: `packages/conformance-tests/src/ogc-api-features/filtering/cql2-basic.test.ts`

**Step 1: Write the test file**

Tests cover conformance class `http://www.opengis.net/spec/cql2/1.0/conf/basic-cql2`.

```typescript
import { describe, it, expect } from 'vitest';
import { fetchGeoJson } from '../../helpers.js';

describe('OGC API Features Filtering — CQL2 Basic', () => {
  // Equality (=)
  it('filters with = operator', async () => {
    const filter = encodeURIComponent("etat='actif'");
    const { body } = await fetchGeoJson(
      `/ogc/collections/bornes-fontaines/items?filter=${filter}&filter-lang=cql2-text&limit=100`
    );
    expect(body.features.length).toBeGreaterThan(0);
    for (const f of body.features) {
      expect(f.properties.etat).toBe('actif');
    }
  });

  // Not equal (!=)
  it('filters with != operator', async () => {
    const filter = encodeURIComponent("etat!='actif'");
    const { body } = await fetchGeoJson(
      `/ogc/collections/bornes-fontaines/items?filter=${filter}&filter-lang=cql2-text&limit=100`
    );
    expect(body.features.length).toBeGreaterThan(0);
    for (const f of body.features) {
      expect(f.properties.etat).not.toBe('actif');
    }
  });

  // Greater than (>)
  it('filters with > operator', async () => {
    const filter = encodeURIComponent('population>100000');
    const { body } = await fetchGeoJson(
      `/ogc/collections/arrondissements/items?filter=${filter}&filter-lang=cql2-text&limit=100`
    );
    expect(body.features.length).toBeGreaterThan(0);
    for (const f of body.features) {
      expect(f.properties.population).toBeGreaterThan(100000);
    }
  });

  // Less than (<)
  it('filters with < operator', async () => {
    const filter = encodeURIComponent('population<100000');
    const { body } = await fetchGeoJson(
      `/ogc/collections/arrondissements/items?filter=${filter}&filter-lang=cql2-text&limit=100`
    );
    expect(body.features.length).toBeGreaterThan(0);
    for (const f of body.features) {
      expect(f.properties.population).toBeLessThan(100000);
    }
  });

  // Greater or equal (>=)
  it('filters with >= operator', async () => {
    const filter = encodeURIComponent('population>=100000');
    const { body } = await fetchGeoJson(
      `/ogc/collections/arrondissements/items?filter=${filter}&filter-lang=cql2-text&limit=100`
    );
    expect(body.features.length).toBeGreaterThan(0);
    for (const f of body.features) {
      expect(f.properties.population).toBeGreaterThanOrEqual(100000);
    }
  });

  // Less or equal (<=)
  it('filters with <= operator', async () => {
    const filter = encodeURIComponent('population<=100000');
    const { body } = await fetchGeoJson(
      `/ogc/collections/arrondissements/items?filter=${filter}&filter-lang=cql2-text&limit=100`
    );
    expect(body.features.length).toBeGreaterThan(0);
    for (const f of body.features) {
      expect(f.properties.population).toBeLessThanOrEqual(100000);
    }
  });

  // AND
  it('filters with AND operator', async () => {
    const filter = encodeURIComponent("etat='actif' AND arrondissement='Verdun'");
    const { body } = await fetchGeoJson(
      `/ogc/collections/bornes-fontaines/items?filter=${filter}&filter-lang=cql2-text&limit=100`
    );
    for (const f of body.features) {
      expect(f.properties.etat).toBe('actif');
      expect(f.properties.arrondissement).toBe('Verdun');
    }
  });

  // OR
  it('filters with OR operator', async () => {
    const filter = encodeURIComponent("arrondissement='Verdun' OR arrondissement='Le Plateau-Mont-Royal'");
    const { body } = await fetchGeoJson(
      `/ogc/collections/bornes-fontaines/items?filter=${filter}&filter-lang=cql2-text&limit=100`
    );
    expect(body.features.length).toBeGreaterThan(0);
    for (const f of body.features) {
      expect(['Verdun', 'Le Plateau-Mont-Royal']).toContain(f.properties.arrondissement);
    }
  });

  // NOT
  it('filters with NOT operator', async () => {
    const filter = encodeURIComponent("NOT etat='actif'");
    const { body } = await fetchGeoJson(
      `/ogc/collections/bornes-fontaines/items?filter=${filter}&filter-lang=cql2-text&limit=100`
    );
    expect(body.features.length).toBeGreaterThan(0);
    for (const f of body.features) {
      expect(f.properties.etat).not.toBe('actif');
    }
  });

  // Invalid CQL2
  it('returns 400 for invalid CQL2 syntax', async () => {
    const filter = encodeURIComponent('INVALID SYNTAX !!!');
    const { status } = await fetchGeoJson(
      `/ogc/collections/bornes-fontaines/items?filter=${filter}&filter-lang=cql2-text`
    );
    expect(status).toBe(400);
  });
});
```

**Step 2: Run tests**

Run: `cd packages/conformance-tests && npx vitest run src/ogc-api-features/filtering/cql2-basic.test.ts`
Expected: All PASS

**Step 3: Commit**

```bash
git add packages/conformance-tests/src/ogc-api-features/filtering/cql2-basic.test.ts
git commit -m "test: add CQL2 basic operators conformance tests"
```

---

### Task 10: Add Filtering — CQL2 Advanced tests

**Files:**
- Create: `packages/conformance-tests/src/ogc-api-features/filtering/cql2-advanced.test.ts`

Tests cover conformance class `http://www.opengis.net/spec/cql2/1.0/conf/advanced-comparison-operators`.

**Step 1: Write the test file**

```typescript
import { describe, it, expect } from 'vitest';
import { fetchGeoJson } from '../../helpers.js';

describe('OGC API Features Filtering — CQL2 Advanced Comparison', () => {
  // LIKE
  it('filters with LIKE operator', async () => {
    const filter = encodeURIComponent("arrondissement LIKE 'V%'");
    const { body } = await fetchGeoJson(
      `/ogc/collections/bornes-fontaines/items?filter=${filter}&filter-lang=cql2-text&limit=100`
    );
    expect(body.features.length).toBeGreaterThan(0);
    for (const f of body.features) {
      expect(f.properties.arrondissement).toMatch(/^V/);
    }
  });

  // IN
  it('filters with IN operator', async () => {
    const filter = encodeURIComponent("arrondissement IN ('Verdun','Ville-Marie')");
    const { body } = await fetchGeoJson(
      `/ogc/collections/bornes-fontaines/items?filter=${filter}&filter-lang=cql2-text&limit=100`
    );
    expect(body.features.length).toBeGreaterThan(0);
    for (const f of body.features) {
      expect(['Verdun', 'Ville-Marie']).toContain(f.properties.arrondissement);
    }
  });
});
```

**Step 2: Run tests**

Run: `cd packages/conformance-tests && npx vitest run src/ogc-api-features/filtering/cql2-advanced.test.ts`
Expected: All PASS

**Step 3: Commit**

```bash
git add packages/conformance-tests/src/ogc-api-features/filtering/cql2-advanced.test.ts
git commit -m "test: add CQL2 advanced comparison conformance tests"
```

---

### Task 11: Add Filtering — CQL2 Spatial and Bbox tests

**Files:**
- Create: `packages/conformance-tests/src/ogc-api-features/filtering/cql2-spatial.test.ts`
- Create: `packages/conformance-tests/src/ogc-api-features/filtering/bbox.test.ts`

**Step 1: Write cql2-spatial.test.ts**

```typescript
import { describe, it, expect } from 'vitest';
import { fetchGeoJson } from '../../helpers.js';

describe('OGC API Features Filtering — CQL2 Spatial Functions', () => {
  // S_INTERSECTS — basic spatial function
  it('S_INTERSECTS filters points within polygon', async () => {
    const filter = encodeURIComponent(
      'S_INTERSECTS(geometry,POLYGON((-73.59 45.49,-73.55 45.49,-73.55 45.52,-73.59 45.52,-73.59 45.49)))'
    );
    const { body } = await fetchGeoJson(
      `/ogc/collections/bornes-fontaines/items?filter=${filter}&filter-lang=cql2-text&limit=100`
    );
    expect(body.features.length).toBeGreaterThan(0);
    for (const f of body.features) {
      const [lon, lat] = f.geometry.coordinates;
      expect(lon).toBeGreaterThanOrEqual(-73.59);
      expect(lon).toBeLessThanOrEqual(-73.55);
      expect(lat).toBeGreaterThanOrEqual(45.49);
      expect(lat).toBeLessThanOrEqual(45.52);
    }
  });

  // S_INTERSECTS with ENVELOPE
  it('S_INTERSECTS works with ENVELOPE syntax', async () => {
    const filter = encodeURIComponent(
      'S_INTERSECTS(geometry,ENVELOPE(-73.59,45.49,-73.55,45.52))'
    );
    const { body } = await fetchGeoJson(
      `/ogc/collections/bornes-fontaines/items?filter=${filter}&filter-lang=cql2-text&limit=100`
    );
    expect(body.features.length).toBeGreaterThan(0);
  });

  // S_DWITHIN
  it('S_DWITHIN filters points within distance', async () => {
    const filter = encodeURIComponent(
      'S_DWITHIN(geometry,POINT(-73.5673 45.5017),500,meters)'
    );
    const { body } = await fetchGeoJson(
      `/ogc/collections/bornes-fontaines/items?filter=${filter}&filter-lang=cql2-text&limit=100`
    );
    expect(body.features.length).toBeGreaterThan(0);
  });

  // S_WITHIN
  it('S_WITHIN filters points within polygon', async () => {
    const filter = encodeURIComponent(
      'S_WITHIN(geometry,POLYGON((-73.60 45.48,-73.54 45.48,-73.54 45.53,-73.60 45.53,-73.60 45.48)))'
    );
    const { body } = await fetchGeoJson(
      `/ogc/collections/bornes-fontaines/items?filter=${filter}&filter-lang=cql2-text&limit=100`
    );
    expect(body.features.length).toBeGreaterThan(0);
  });

  // Combining spatial + attribute filter
  it('combines spatial filter with attribute filter via AND', async () => {
    const filter = encodeURIComponent(
      "S_INTERSECTS(geometry,POLYGON((-73.59 45.49,-73.55 45.49,-73.55 45.52,-73.59 45.52,-73.59 45.49))) AND etat='actif'"
    );
    const { body } = await fetchGeoJson(
      `/ogc/collections/bornes-fontaines/items?filter=${filter}&filter-lang=cql2-text&limit=100`
    );
    for (const f of body.features) {
      expect(f.properties.etat).toBe('actif');
    }
  });
});
```

**Step 2: Write bbox.test.ts**

```typescript
import { describe, it, expect } from 'vitest';
import { fetchGeoJson } from '../../helpers.js';

describe('OGC API Features Filtering — bbox Parameter', () => {
  // /req/core/items-bbox-param
  it('filters features by bbox', async () => {
    const { body: all } = await fetchGeoJson('/ogc/collections/bornes-fontaines/items?limit=100');
    const { body: filtered } = await fetchGeoJson(
      '/ogc/collections/bornes-fontaines/items?limit=100&bbox=-73.59,45.49,-73.55,45.52'
    );
    expect(filtered.features.length).toBeLessThan(all.features.length);
    expect(filtered.features.length).toBeGreaterThan(0);
  });

  it('returned features are within bbox', async () => {
    const { body } = await fetchGeoJson(
      '/ogc/collections/bornes-fontaines/items?limit=100&bbox=-73.59,45.49,-73.55,45.52'
    );
    for (const f of body.features) {
      const [lon, lat] = f.geometry.coordinates;
      expect(lon).toBeGreaterThanOrEqual(-73.59);
      expect(lon).toBeLessThanOrEqual(-73.55);
      expect(lat).toBeGreaterThanOrEqual(45.49);
      expect(lat).toBeLessThanOrEqual(45.52);
    }
  });

  it('returns empty when bbox has no matching features', async () => {
    const { body } = await fetchGeoJson(
      '/ogc/collections/bornes-fontaines/items?limit=100&bbox=0,0,1,1'
    );
    expect(body.features).toHaveLength(0);
  });

  // /req/filter/mixing-expressions — bbox + filter combined
  it('combines bbox with CQL2 filter', async () => {
    const filter = encodeURIComponent("etat='actif'");
    const { body } = await fetchGeoJson(
      `/ogc/collections/bornes-fontaines/items?bbox=-73.59,45.49,-73.55,45.52&filter=${filter}&filter-lang=cql2-text&limit=100`
    );
    for (const f of body.features) {
      expect(f.properties.etat).toBe('actif');
      const [lon, lat] = f.geometry.coordinates;
      expect(lon).toBeGreaterThanOrEqual(-73.59);
      expect(lon).toBeLessThanOrEqual(-73.55);
    }
  });
});
```

**Step 3: Run, commit**

```bash
cd packages/conformance-tests && npx vitest run src/ogc-api-features/filtering/cql2-spatial.test.ts src/ogc-api-features/filtering/bbox.test.ts
git add packages/conformance-tests/src/ogc-api-features/filtering/cql2-spatial.test.ts packages/conformance-tests/src/ogc-api-features/filtering/bbox.test.ts
git commit -m "test: add CQL2 spatial and bbox conformance tests"
```

---

### Task 12: Migrate Sorting tests

**Files:**
- Create: `packages/conformance-tests/src/ogc-api-features/sorting/sortby.test.ts`
- Delete: `packages/conformance-tests/src/ogc/sorting.test.ts`

**Step 1: Write the test file**

```typescript
import { describe, it, expect } from 'vitest';
import { fetchGeoJson } from '../../helpers.js';

describe('OGC API Features Sorting — sortby', () => {
  it('sorts ascending by default', async () => {
    const { status, body } = await fetchGeoJson(
      '/ogc/collections/arrondissements/items?sortby=population&limit=100'
    );
    expect(status).toBe(200);
    const populations = body.features.map((f: any) => f.properties.population);
    for (let i = 1; i < populations.length; i++) {
      expect(populations[i]).toBeGreaterThanOrEqual(populations[i - 1]);
    }
  });

  it('sorts descending with - prefix', async () => {
    const { status, body } = await fetchGeoJson(
      '/ogc/collections/arrondissements/items?sortby=-population&limit=100'
    );
    expect(status).toBe(200);
    const populations = body.features.map((f: any) => f.properties.population);
    for (let i = 1; i < populations.length; i++) {
      expect(populations[i]).toBeLessThanOrEqual(populations[i - 1]);
    }
  });

  it('returns 400 for non-sortable field', async () => {
    const { status } = await fetchGeoJson(
      '/ogc/collections/bornes-fontaines/items?sortby=etat'
    );
    expect(status).toBe(400);
  });

  it('returns 400 for unknown field', async () => {
    const { status } = await fetchGeoJson(
      '/ogc/collections/arrondissements/items?sortby=nonexistent'
    );
    expect(status).toBe(400);
  });
});
```

**Step 2: Run, delete old, commit**

```bash
cd packages/conformance-tests && npx vitest run src/ogc-api-features/sorting/sortby.test.ts
rm packages/conformance-tests/src/ogc/sorting.test.ts
git add -A packages/conformance-tests/
git commit -m "test: migrate and expand sorting conformance tests"
```

---

### Task 13: Migrate WFS 1.1 tests

**Files:**
- Create: `packages/conformance-tests/src/wfs/wfs11/capabilities.test.ts`
- Create: `packages/conformance-tests/src/wfs/wfs11/describe.test.ts`
- Create: `packages/conformance-tests/src/wfs/wfs11/get-feature.test.ts`
- Delete: `packages/conformance-tests/src/wfs/capabilities.test.ts`
- Delete: `packages/conformance-tests/src/wfs/describe.test.ts`
- Delete: `packages/conformance-tests/src/wfs/get-feature.test.ts`

**Step 1: Write wfs11/capabilities.test.ts**

```typescript
import { describe, it, expect } from 'vitest';
import { BASE_URL } from '../../helpers.js';

describe('WFS 1.1.0 — GetCapabilities', () => {
  const capUrl = `${BASE_URL}/wfs?service=WFS&version=1.1.0&request=GetCapabilities`;

  it('returns XML with 200', async () => {
    const res = await fetch(capUrl);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('application/xml');
  });

  it('contains WFS_Capabilities root element with version 1.1.0', async () => {
    const res = await fetch(capUrl);
    const xml = await res.text();
    expect(xml).toContain('wfs:WFS_Capabilities');
    expect(xml).toContain('version="1.1.0"');
  });

  it('declares required XML namespaces', async () => {
    const res = await fetch(capUrl);
    const xml = await res.text();
    expect(xml).toContain('xmlns:wfs="http://www.opengis.net/wfs"');
    expect(xml).toContain('xmlns:ows="http://www.opengis.net/ows"');
    expect(xml).toContain('xmlns:ogc="http://www.opengis.net/ogc"');
  });

  it('has ServiceIdentification with WFS type', async () => {
    const res = await fetch(capUrl);
    const xml = await res.text();
    expect(xml).toContain('ows:ServiceIdentification');
    expect(xml).toContain('<ows:ServiceType>WFS</ows:ServiceType>');
    expect(xml).toContain('<ows:ServiceTypeVersion>1.1.0</ows:ServiceTypeVersion>');
  });

  it('lists all feature types', async () => {
    const res = await fetch(capUrl);
    const xml = await res.text();
    expect(xml).toContain('FeatureTypeList');
    expect(xml).toContain('<Name>bornes-fontaines</Name>');
    expect(xml).toContain('<Name>pistes-cyclables</Name>');
    expect(xml).toContain('<Name>arrondissements</Name>');
  });

  it('each feature type has WGS84BoundingBox', async () => {
    const res = await fetch(capUrl);
    const xml = await res.text();
    expect(xml).toContain('ows:WGS84BoundingBox');
    expect(xml).toContain('ows:LowerCorner');
    expect(xml).toContain('ows:UpperCorner');
  });

  it('declares supported output formats', async () => {
    const res = await fetch(capUrl);
    const xml = await res.text();
    expect(xml).toContain('application/json');
  });

  it('includes OperationsMetadata with required operations', async () => {
    const res = await fetch(capUrl);
    const xml = await res.text();
    expect(xml).toContain('ows:OperationsMetadata');
    expect(xml).toContain('GetCapabilities');
    expect(xml).toContain('DescribeFeatureType');
    expect(xml).toContain('GetFeature');
  });

  it('declares DefaultSRS and OtherSRS', async () => {
    const res = await fetch(capUrl);
    const xml = await res.text();
    expect(xml).toContain('<DefaultSRS>urn:ogc:def:crs:OGC:1.3:CRS84</DefaultSRS>');
    expect(xml).toContain('<OtherSRS>urn:ogc:def:crs:EPSG::3857</OtherSRS>');
  });

  it('has Filter_Capabilities section', async () => {
    const res = await fetch(capUrl);
    const xml = await res.text();
    expect(xml).toContain('ogc:Filter_Capabilities');
    expect(xml).toContain('ogc:Spatial_Capabilities');
    expect(xml).toContain('ogc:Scalar_Capabilities');
  });
});
```

**Step 2: Write wfs11/describe.test.ts**

```typescript
import { describe, it, expect } from 'vitest';
import { BASE_URL } from '../../helpers.js';

describe('WFS 1.1.0 — DescribeFeatureType', () => {
  it('returns JSON with featureTypes', async () => {
    const res = await fetch(
      `${BASE_URL}/wfs?service=WFS&request=DescribeFeatureType&typeName=bornes-fontaines&outputFormat=application/json`
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.featureTypes).toBeDefined();
    expect(body.featureTypes).toHaveLength(1);
  });

  it('includes geometry property with gml type', async () => {
    const res = await fetch(
      `${BASE_URL}/wfs?service=WFS&request=DescribeFeatureType&typeName=bornes-fontaines&outputFormat=application/json`
    );
    const body = await res.json();
    const geomProp = body.featureTypes[0].properties.find((p: any) => p.name === 'geometry');
    expect(geomProp).toBeDefined();
    expect(geomProp.type).toBe('gml:Point');
    expect(geomProp.localType).toBe('Point');
  });

  it('includes attribute properties with xsd types', async () => {
    const res = await fetch(
      `${BASE_URL}/wfs?service=WFS&request=DescribeFeatureType&typeName=bornes-fontaines&outputFormat=application/json`
    );
    const body = await res.json();
    const props = body.featureTypes[0].properties;
    const etat = props.find((p: any) => p.name === 'etat');
    expect(etat).toBeDefined();
    expect(etat.type).toBe('xsd:string');
  });

  it('describes LineString geometry for pistes-cyclables', async () => {
    const res = await fetch(
      `${BASE_URL}/wfs?service=WFS&request=DescribeFeatureType&typeName=pistes-cyclables&outputFormat=application/json`
    );
    const body = await res.json();
    const geomProp = body.featureTypes[0].properties.find((p: any) => p.name === 'geometry');
    expect(geomProp.localType).toBe('LineString');
  });

  it('describes Polygon geometry for arrondissements', async () => {
    const res = await fetch(
      `${BASE_URL}/wfs?service=WFS&request=DescribeFeatureType&typeName=arrondissements&outputFormat=application/json`
    );
    const body = await res.json();
    const geomProp = body.featureTypes[0].properties.find((p: any) => p.name === 'geometry');
    expect(geomProp.localType).toBe('Polygon');
  });

  it('returns 404 for unknown type', async () => {
    const res = await fetch(
      `${BASE_URL}/wfs?service=WFS&request=DescribeFeatureType&typeName=unknown&outputFormat=application/json`
    );
    expect(res.status).toBe(404);
  });
});
```

**Step 3: Write wfs11/get-feature.test.ts**

```typescript
import { describe, it, expect } from 'vitest';
import { BASE_URL } from '../../helpers.js';

describe('WFS 1.1.0 — GetFeature', () => {
  describe('GET', () => {
    it('returns GeoJSON FeatureCollection', async () => {
      const res = await fetch(
        `${BASE_URL}/wfs?service=WFS&request=GetFeature&typeName=bornes-fontaines&maxFeatures=5&outputFormat=application/json`
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.type).toBe('FeatureCollection');
      expect(body.features).toHaveLength(5);
    });

    it('includes totalFeatures and numberReturned', async () => {
      const res = await fetch(
        `${BASE_URL}/wfs?service=WFS&request=GetFeature&typeName=bornes-fontaines&maxFeatures=5&outputFormat=application/json`
      );
      const body = await res.json();
      expect(body.totalFeatures).toBeDefined();
      expect(body.numberReturned).toBe(5);
    });

    it('includes CRS info', async () => {
      const res = await fetch(
        `${BASE_URL}/wfs?service=WFS&request=GetFeature&typeName=bornes-fontaines&maxFeatures=1&outputFormat=application/json`
      );
      const body = await res.json();
      expect(body.crs).toBeDefined();
      expect(body.crs.properties.name).toMatch(/CRS84/);
    });

    it('supports startIndex for pagination', async () => {
      const res1 = await fetch(
        `${BASE_URL}/wfs?service=WFS&request=GetFeature&typeName=bornes-fontaines&maxFeatures=2&startIndex=0&outputFormat=application/json`
      );
      const body1 = await res1.json();
      const res2 = await fetch(
        `${BASE_URL}/wfs?service=WFS&request=GetFeature&typeName=bornes-fontaines&maxFeatures=2&startIndex=2&outputFormat=application/json`
      );
      const body2 = await res2.json();
      expect(body1.features[0].id).not.toBe(body2.features[0].id);
    });

    it('supports resultType=hits', async () => {
      const res = await fetch(
        `${BASE_URL}/wfs?service=WFS&request=GetFeature&typeName=bornes-fontaines&resultType=hits&outputFormat=application/json`
      );
      const body = await res.json();
      expect(body.features).toHaveLength(0);
      expect(body.numberMatched).toBeGreaterThan(0);
      expect(body.numberReturned).toBe(0);
    });

    it('reprojects to EPSG:3857 when requested', async () => {
      const res84 = await fetch(
        `${BASE_URL}/wfs?service=WFS&request=GetFeature&typeName=bornes-fontaines&maxFeatures=1&outputFormat=application/json`
      );
      const body84 = await res84.json();

      const res3857 = await fetch(
        `${BASE_URL}/wfs?service=WFS&request=GetFeature&typeName=bornes-fontaines&maxFeatures=1&outputFormat=application/json&srsName=EPSG:3857`
      );
      const body3857 = await res3857.json();

      expect(body3857.crs.properties.name).toContain('3857');
      // EPSG:3857 coordinates are much larger than CRS84
      const [x3857] = body3857.features[0].geometry.coordinates;
      const [lon84] = body84.features[0].geometry.coordinates;
      expect(Math.abs(x3857)).toBeGreaterThan(Math.abs(lon84) * 1000);
    });

    it('returns features for all geometry types', async () => {
      for (const typeName of ['bornes-fontaines', 'pistes-cyclables', 'arrondissements']) {
        const res = await fetch(
          `${BASE_URL}/wfs?service=WFS&request=GetFeature&typeName=${typeName}&maxFeatures=1&outputFormat=application/json`
        );
        const body = await res.json();
        expect(body.type).toBe('FeatureCollection');
        expect(body.features.length).toBeGreaterThan(0);
        expect(body.features[0].geometry).toBeDefined();
      }
    });

    it('returns 404 for unknown typeName', async () => {
      const res = await fetch(
        `${BASE_URL}/wfs?service=WFS&request=GetFeature&typeName=unknown&outputFormat=application/json`
      );
      expect(res.status).toBe(404);
    });
  });

  describe('POST (XML body)', () => {
    it('accepts XML body and returns GeoJSON', async () => {
      const xmlBody = `<wfs:GetFeature service="WFS" version="1.1.0" outputFormat="application/json"
        maxFeatures="3" startIndex="0"
        xmlns:wfs="http://www.opengis.net/wfs">
        <wfs:Query typeName="bornes-fontaines"/>
      </wfs:GetFeature>`;

      const res = await fetch(`${BASE_URL}/wfs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/xml' },
        body: xmlBody,
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.type).toBe('FeatureCollection');
      expect(body.features).toHaveLength(3);
    });

    it('works with all geometry types via POST', async () => {
      for (const typeName of ['bornes-fontaines', 'pistes-cyclables', 'arrondissements']) {
        const xmlBody = `<wfs:GetFeature service="WFS" version="1.1.0" outputFormat="application/json"
          maxFeatures="1" xmlns:wfs="http://www.opengis.net/wfs">
          <wfs:Query typeName="${typeName}"/>
        </wfs:GetFeature>`;

        const res = await fetch(`${BASE_URL}/wfs`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/xml' },
          body: xmlBody,
        });
        const body = await res.json();
        expect(body.type).toBe('FeatureCollection');
        expect(body.features.length).toBeGreaterThan(0);
      }
    });

    it('supports resultType=hits via POST', async () => {
      const xmlBody = `<wfs:GetFeature service="WFS" version="1.1.0" outputFormat="application/json"
        resultType="hits" xmlns:wfs="http://www.opengis.net/wfs">
        <wfs:Query typeName="bornes-fontaines"/>
      </wfs:GetFeature>`;

      const res = await fetch(`${BASE_URL}/wfs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/xml' },
        body: xmlBody,
      });
      const body = await res.json();
      expect(body.features).toHaveLength(0);
      expect(body.numberMatched).toBeGreaterThan(0);
    });
  });
});
```

**Step 4: Run, delete old, commit**

```bash
cd packages/conformance-tests && npx vitest run src/wfs/wfs11/
rm packages/conformance-tests/src/wfs/capabilities.test.ts packages/conformance-tests/src/wfs/describe.test.ts packages/conformance-tests/src/wfs/get-feature.test.ts
git add -A packages/conformance-tests/
git commit -m "test: migrate and expand WFS 1.1.0 conformance tests"
```

---

### Task 14: Add WFS 2.0 support in proxy

**Files:**
- Modify: `packages/proxy/src/wfs/capabilities.ts`
- Modify: `packages/proxy/src/wfs/router.ts`

The proxy already supports `count` as alias in `get-feature.ts:72` (`query.maxfeatures || query.count`). We need:
1. Version negotiation in the router
2. A WFS 2.0 capabilities response

**Step 1: Write failing test for WFS 2.0 capabilities**

Create `packages/conformance-tests/src/wfs/wfs20/capabilities.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { BASE_URL } from '../../helpers.js';

describe('WFS 2.0 — GetCapabilities', () => {
  it('returns capabilities with version 2.0.0 when requested', async () => {
    const res = await fetch(
      `${BASE_URL}/wfs?service=WFS&version=2.0.0&request=GetCapabilities`
    );
    expect(res.status).toBe(200);
    const xml = await res.text();
    expect(xml).toContain('version="2.0.0"');
  });

  it('uses WFS 2.0 namespace', async () => {
    const res = await fetch(
      `${BASE_URL}/wfs?service=WFS&version=2.0.0&request=GetCapabilities`
    );
    const xml = await res.text();
    expect(xml).toContain('http://www.opengis.net/wfs/2.0');
  });

  it('lists all feature types', async () => {
    const res = await fetch(
      `${BASE_URL}/wfs?service=WFS&version=2.0.0&request=GetCapabilities`
    );
    const xml = await res.text();
    expect(xml).toContain('<Name>bornes-fontaines</Name>');
    expect(xml).toContain('<Name>pistes-cyclables</Name>');
    expect(xml).toContain('<Name>arrondissements</Name>');
  });

  it('includes OperationsMetadata', async () => {
    const res = await fetch(
      `${BASE_URL}/wfs?service=WFS&version=2.0.0&request=GetCapabilities`
    );
    const xml = await res.text();
    expect(xml).toContain('ows:OperationsMetadata');
    expect(xml).toContain('GetCapabilities');
    expect(xml).toContain('GetFeature');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd packages/conformance-tests && npx vitest run src/wfs/wfs20/capabilities.test.ts`
Expected: FAIL (version="1.1.0" returned instead of 2.0.0)

**Step 3: Modify capabilities.ts to support version parameter**

In `packages/proxy/src/wfs/capabilities.ts`, update the function signature and add a WFS 2.0 template:

```typescript
// Add after the existing buildCapabilitiesXml function
export function buildCapabilities20Xml(req: Request): string {
  const registry = getRegistry();
  const serviceUrl = getServiceUrl(req);
  const defaultExtent: [number, number, number, number] = [-73.98, 45.41, -73.47, 45.70];

  const featureTypes = Object.entries(registry.collections).map(([id, config]) => {
    const [minLon, minLat, maxLon, maxLat] = config.extent?.spatial ?? defaultExtent;
    return `
    <FeatureType>
      <Name>${id}</Name>
      <Title>${config.title}</Title>
      <Abstract>${config.description || ''}</Abstract>
      <DefaultCRS>urn:ogc:def:crs:OGC:1.3:CRS84</DefaultCRS>
      <OtherCRS>urn:ogc:def:crs:EPSG::3857</OtherCRS>
      <ows:WGS84BoundingBox>
        <ows:LowerCorner>${minLon} ${minLat}</ows:LowerCorner>
        <ows:UpperCorner>${maxLon} ${maxLat}</ows:UpperCorner>
      </ows:WGS84BoundingBox>
    </FeatureType>`;
  }).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<wfs:WFS_Capabilities
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xmlns:wfs="http://www.opengis.net/wfs/2.0"
  xmlns:ows="http://www.opengis.net/ows/1.1"
  xmlns:fes="http://www.opengis.net/fes/2.0"
  xmlns:gml="http://www.opengis.net/gml/3.2"
  xmlns:xlink="http://www.w3.org/1999/xlink"
  version="2.0.0"
  xsi:schemaLocation="http://www.opengis.net/wfs/2.0 http://schemas.opengis.net/wfs/2.0/wfs.xsd">

  <ows:ServiceIdentification>
    <ows:Title>OGC Proxy Municipal - WFS</ows:Title>
    <ows:Abstract>Interface GIS commune aux APIs maison</ows:Abstract>
    <ows:ServiceType>WFS</ows:ServiceType>
    <ows:ServiceTypeVersion>2.0.0</ows:ServiceTypeVersion>
  </ows:ServiceIdentification>

  <ows:OperationsMetadata>
    <ows:Operation name="GetCapabilities">
      <ows:DCP><ows:HTTP>
        <ows:Get xlink:href="${serviceUrl}"/>
        <ows:Post xlink:href="${serviceUrl}"/>
      </ows:HTTP></ows:DCP>
    </ows:Operation>
    <ows:Operation name="DescribeFeatureType">
      <ows:DCP><ows:HTTP>
        <ows:Get xlink:href="${serviceUrl}"/>
        <ows:Post xlink:href="${serviceUrl}"/>
      </ows:HTTP></ows:DCP>
      <ows:Parameter name="outputFormat">
        <ows:AllowedValues>
          <ows:Value>application/gml+xml; version=3.2</ows:Value>
          <ows:Value>application/json</ows:Value>
        </ows:AllowedValues>
      </ows:Parameter>
    </ows:Operation>
    <ows:Operation name="GetFeature">
      <ows:DCP><ows:HTTP>
        <ows:Get xlink:href="${serviceUrl}"/>
        <ows:Post xlink:href="${serviceUrl}"/>
      </ows:HTTP></ows:DCP>
      <ows:Parameter name="resultType">
        <ows:AllowedValues>
          <ows:Value>results</ows:Value>
          <ows:Value>hits</ows:Value>
        </ows:AllowedValues>
      </ows:Parameter>
      <ows:Parameter name="outputFormat">
        <ows:AllowedValues>
          <ows:Value>application/gml+xml; version=3.2</ows:Value>
          <ows:Value>application/json</ows:Value>
        </ows:AllowedValues>
      </ows:Parameter>
    </ows:Operation>
  </ows:OperationsMetadata>

  <FeatureTypeList>
    ${featureTypes}
  </FeatureTypeList>

  <fes:Filter_Capabilities>
    <fes:Conformance>
      <fes:Constraint name="ImplementsQuery"><ows:NoValues/><ows:DefaultValue>TRUE</ows:DefaultValue></fes:Constraint>
      <fes:Constraint name="ImplementsAdHocQuery"><ows:NoValues/><ows:DefaultValue>FALSE</ows:DefaultValue></fes:Constraint>
    </fes:Conformance>
    <fes:Spatial_Capabilities>
      <fes:GeometryOperands>
        <fes:GeometryOperand name="gml:Envelope"/>
        <fes:GeometryOperand name="gml:Point"/>
        <fes:GeometryOperand name="gml:Polygon"/>
      </fes:GeometryOperands>
      <fes:SpatialOperators>
        <fes:SpatialOperator name="BBOX"/>
        <fes:SpatialOperator name="Intersects"/>
        <fes:SpatialOperator name="Within"/>
      </fes:SpatialOperators>
    </fes:Spatial_Capabilities>
    <fes:Scalar_Capabilities>
      <fes:LogicalOperators/>
      <fes:ComparisonOperators>
        <fes:ComparisonOperator name="PropertyIsEqualTo"/>
        <fes:ComparisonOperator name="PropertyIsNotEqualTo"/>
        <fes:ComparisonOperator name="PropertyIsLessThan"/>
        <fes:ComparisonOperator name="PropertyIsGreaterThan"/>
        <fes:ComparisonOperator name="PropertyIsLessThanOrEqualTo"/>
        <fes:ComparisonOperator name="PropertyIsGreaterThanOrEqualTo"/>
        <fes:ComparisonOperator name="PropertyIsLike"/>
      </fes:ComparisonOperators>
    </fes:Scalar_Capabilities>
  </fes:Filter_Capabilities>
</wfs:WFS_Capabilities>`;
}
```

**Step 4: Update router to dispatch by version**

In `packages/proxy/src/wfs/router.ts`, update the GetCapabilities handler:

```typescript
// Change the import line to:
import { buildCapabilitiesXml, buildCapabilities20Xml } from './capabilities.js';

// Change the GetCapabilities handler to:
if (request === 'getcapabilities') {
  res.set('Content-Type', 'application/xml');
  const version = query.version || '1.1.0';
  if (version.startsWith('2.')) {
    return res.send(buildCapabilities20Xml(req));
  }
  return res.send(buildCapabilitiesXml(req));
}
```

**Step 5: Run test to verify it passes**

Run: `cd packages/conformance-tests && npx vitest run src/wfs/wfs20/capabilities.test.ts`
Expected: All PASS

**Step 6: Commit**

```bash
git add packages/proxy/src/wfs/capabilities.ts packages/proxy/src/wfs/router.ts packages/conformance-tests/src/wfs/wfs20/capabilities.test.ts
git commit -m "feat: add WFS 2.0 GetCapabilities support and tests"
```

---

### Task 15: Add WFS 2.0 GetFeature and version negotiation tests

**Files:**
- Create: `packages/conformance-tests/src/wfs/wfs20/get-feature.test.ts`
- Create: `packages/conformance-tests/src/wfs/wfs20/version-negotiation.test.ts`

**Step 1: Write get-feature.test.ts**

The proxy already supports `count` as alias for `maxFeatures` (see `get-feature.ts:72`).

```typescript
import { describe, it, expect } from 'vitest';
import { BASE_URL } from '../../helpers.js';

describe('WFS 2.0 — GetFeature', () => {
  // WFS 2.0 uses 'count' instead of 'maxFeatures'
  it('supports count parameter (WFS 2.0 replacement for maxFeatures)', async () => {
    const res = await fetch(
      `${BASE_URL}/wfs?service=WFS&version=2.0.0&request=GetFeature&typeName=bornes-fontaines&count=3&outputFormat=application/json`
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.type).toBe('FeatureCollection');
    expect(body.features).toHaveLength(3);
  });

  // WFS 2.0 uses 'typeNames' (plural) instead of 'typeName'
  it('supports typeNames parameter (WFS 2.0 plural form)', async () => {
    const res = await fetch(
      `${BASE_URL}/wfs?service=WFS&version=2.0.0&request=GetFeature&typeNames=bornes-fontaines&count=2&outputFormat=application/json`
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.features).toHaveLength(2);
  });

  it('includes numberMatched and numberReturned', async () => {
    const res = await fetch(
      `${BASE_URL}/wfs?service=WFS&version=2.0.0&request=GetFeature&typeName=bornes-fontaines&count=5&outputFormat=application/json`
    );
    const body = await res.json();
    expect(body.numberMatched).toBeDefined();
    expect(body.numberReturned).toBe(5);
  });

  it('supports startIndex pagination', async () => {
    const res1 = await fetch(
      `${BASE_URL}/wfs?service=WFS&version=2.0.0&request=GetFeature&typeName=bornes-fontaines&count=2&startIndex=0&outputFormat=application/json`
    );
    const body1 = await res1.json();
    const res2 = await fetch(
      `${BASE_URL}/wfs?service=WFS&version=2.0.0&request=GetFeature&typeName=bornes-fontaines&count=2&startIndex=2&outputFormat=application/json`
    );
    const body2 = await res2.json();
    expect(body1.features[0].id).not.toBe(body2.features[0].id);
  });

  it('supports resultType=hits', async () => {
    const res = await fetch(
      `${BASE_URL}/wfs?service=WFS&version=2.0.0&request=GetFeature&typeName=bornes-fontaines&resultType=hits&outputFormat=application/json`
    );
    const body = await res.json();
    expect(body.features).toHaveLength(0);
    expect(body.numberMatched).toBeGreaterThan(0);
    expect(body.numberReturned).toBe(0);
  });

  it('supports count in POST XML body', async () => {
    const xmlBody = `<wfs:GetFeature service="WFS" version="2.0.0" outputFormat="application/json"
      count="3" xmlns:wfs="http://www.opengis.net/wfs/2.0">
      <wfs:Query typeNames="bornes-fontaines"/>
    </wfs:GetFeature>`;

    const res = await fetch(`${BASE_URL}/wfs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/xml' },
      body: xmlBody,
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.features).toHaveLength(3);
  });
});
```

**Step 2: Write version-negotiation.test.ts**

```typescript
import { describe, it, expect } from 'vitest';
import { BASE_URL } from '../../helpers.js';

describe('WFS — Version Negotiation', () => {
  it('defaults to 1.1.0 when no version specified', async () => {
    const res = await fetch(
      `${BASE_URL}/wfs?service=WFS&request=GetCapabilities`
    );
    expect(res.status).toBe(200);
    const xml = await res.text();
    expect(xml).toContain('version="1.1.0"');
  });

  it('returns 1.1.0 when version=1.1.0', async () => {
    const res = await fetch(
      `${BASE_URL}/wfs?service=WFS&version=1.1.0&request=GetCapabilities`
    );
    const xml = await res.text();
    expect(xml).toContain('version="1.1.0"');
  });

  it('returns 2.0.0 when version=2.0.0', async () => {
    const res = await fetch(
      `${BASE_URL}/wfs?service=WFS&version=2.0.0&request=GetCapabilities`
    );
    const xml = await res.text();
    expect(xml).toContain('version="2.0.0"');
  });

  it('GetFeature works regardless of version parameter', async () => {
    for (const version of ['1.1.0', '2.0.0']) {
      const res = await fetch(
        `${BASE_URL}/wfs?service=WFS&version=${version}&request=GetFeature&typeName=bornes-fontaines&maxFeatures=1&outputFormat=application/json`
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.type).toBe('FeatureCollection');
    }
  });
});
```

**Step 3: Run tests**

Run: `cd packages/conformance-tests && npx vitest run src/wfs/wfs20/`
Expected: All PASS

**Step 4: Commit**

```bash
git add packages/conformance-tests/src/wfs/wfs20/
git commit -m "test: add WFS 2.0 GetFeature and version negotiation tests"
```

---

### Task 16: Clean up old test directories and migrate WFS upstream test

**Files:**
- Move: `packages/conformance-tests/src/ogc/wfs-upstream.test.ts` remains as-is or migrated
- Delete: `packages/conformance-tests/src/ogc/` directory (should be empty after migrations)

**Step 1: Check what's left in ogc/**

Run: `ls packages/conformance-tests/src/ogc/`

If only `wfs-upstream.test.ts` remains, move it to core:

```bash
mv packages/conformance-tests/src/ogc/wfs-upstream.test.ts packages/conformance-tests/src/ogc-api-features/core/wfs-upstream.test.ts
```

Update the import path in the moved file from `'../helpers.js'` to `'../../helpers.js'`.

**Step 2: Delete old directory**

Run: `rm -rf packages/conformance-tests/src/ogc`

**Step 3: Run all tests to verify nothing is broken**

Run: `cd packages/conformance-tests && npx vitest run`
Expected: All PASS

**Step 4: Commit**

```bash
git add -A packages/conformance-tests/
git commit -m "chore: clean up old test directory, migrate wfs-upstream test"
```

---

### Task 17: Write conformance documentation — OGC API Features

**Files:**
- Create: `docs/conformance/ogc-api-features.md`

**Step 1: Write the documentation**

This file maps each OGC requirement to its implementation status and test. See design doc for the full structure. Key sections:

1. **OGC API Features Part 1 — Core** (`/conf/core`)
2. **OGC API Features Part 1 — GeoJSON** (`/conf/geojson`)
3. **OGC API Features Part 3 — Filter** (`/conf/filter`)
4. **OGC API Features Part 3 — Features Filter** (`/conf/features-filter`)
5. **OGC API Features Part 3 — Queryables** (`/conf/queryables`)
6. **CQL2 — Basic** (`/conf/basic-cql2`)
7. **CQL2 — Advanced Comparison** (`/conf/advanced-comparison-operators`)
8. **CQL2 — Basic Spatial** (`/conf/basic-spatial-functions`)
9. **CQL2 — CQL2 Text** (`/conf/cql2-text`)
10. **Sorting** (OGC API Records)

Each section has a requirement table with columns: Requirement | Description | Status | Test(s)

**Step 2: Commit**

```bash
git add docs/conformance/ogc-api-features.md
git commit -m "docs: add OGC API Features conformance documentation"
```

---

### Task 18: Write conformance documentation — WFS

**Files:**
- Create: `docs/conformance/wfs.md`

**Step 1: Write the documentation**

Sections:
1. **WFS 1.1.0** — GetCapabilities, DescribeFeatureType, GetFeature requirements
2. **WFS 2.0** — Supported operations, key differences, limitations

Each with requirement tables mapping to tests.

**Step 2: Commit**

```bash
git add docs/conformance/wfs.md
git commit -m "docs: add WFS conformance documentation"
```

---

### Task 19: Write conformance README

**Files:**
- Create: `docs/conformance/README.md`

**Step 1: Write the summary**

Include:
- Overall coverage summary table
- Legend for status icons
- Links to detailed docs
- How tests demonstrate conformance
- Instructions to run tests

**Step 2: Commit**

```bash
git add docs/conformance/README.md
git commit -m "docs: add conformance documentation summary"
```

---

### Task 20: Final verification

**Step 1: Run all conformance tests**

Run: `cd packages/conformance-tests && npx vitest run`
Expected: All PASS

**Step 2: Run proxy unit tests**

Run: `cd packages/proxy && npx vitest run`
Expected: All PASS

**Step 3: Count test coverage**

Run: `cd packages/conformance-tests && npx vitest run 2>&1 | tail -5`
Report: total test count, pass/fail

**Step 4: Commit any remaining changes**

```bash
git add -A
git commit -m "test: finalize conformance test suite"
```
