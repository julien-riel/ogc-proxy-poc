# Adapter Refactor Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Refactor `adapter.ts` from a 415-line monolith into a Strategy + Facade architecture with zero `as` casts, no duplication, and a clean `AdapterDeps` signature.

**Architecture:** Extract pagination strategies into `engine/pagination/` with a type-safe factory. Extract HTTP fetch into `fetch-service.ts`. Collapse duplicated cross-cutting logic (cache, rate-limit, circuit-breaker, metrics, retry) into a single `executeWithMiddleware<T>()` generic. Callers switch from positional args to `AdapterDeps` object.

**Tech Stack:** TypeScript, Vitest, Zod discriminated unions

**Design doc:** `docs/plans/2026-03-09-adapter-refactor-design.md`

---

### Task 1: Create `fetch-service.ts` with tests

**Files:**
- Create: `packages/proxy/src/engine/fetch-service.ts`
- Create: `packages/proxy/src/engine/fetch-service.test.ts`

**Step 1: Write the failing tests**

Create `fetch-service.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../logger.js', () => ({
  logger: {
    adapter: () => ({ info: vi.fn(), warning: vi.fn(), error: vi.fn() }),
  },
}));

import { fetchJson, extractItems, extractTotal, UpstreamError, UpstreamTimeoutError } from './fetch-service.js';
import type { CollectionConfig } from './types.js';

const config: CollectionConfig = {
  title: 'Test',
  upstream: {
    baseUrl: 'http://mock:3001/api/test',
    method: 'GET',
    pagination: { type: 'offset-limit', offsetParam: 'offset', limitParam: 'limit' },
    responseMapping: { items: 'data', total: 'total', item: 'data' },
  },
  geometry: { type: 'Point', xField: 'x', yField: 'y' },
  idField: 'id',
  properties: [{ name: 'name', type: 'string' }],
};

describe('fetchJson', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('returns parsed JSON on success', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ data: [1] }),
    }));
    const result = await fetchJson('http://example.com/api');
    expect(result).toEqual({ data: [1] });
  });

  it('throws UpstreamError on non-ok response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
    }));
    await expect(fetchJson('http://example.com/api')).rejects.toThrow(UpstreamError);
  });

  it('throws UpstreamTimeoutError on abort', async () => {
    vi.stubGlobal('fetch', vi.fn((_url: string, init?: RequestInit) => {
      return new Promise((_resolve, reject) => {
        const onAbort = () => reject(new DOMException('aborted', 'AbortError'));
        if (init?.signal?.aborted) onAbort();
        else init?.signal?.addEventListener('abort', onAbort);
      });
    }));
    await expect(fetchJson('http://example.com/api', 50)).rejects.toThrow(UpstreamTimeoutError);
  });
});

describe('extractItems', () => {
  it('extracts items array from response body', () => {
    const body = { data: [{ id: 1 }, { id: 2 }] };
    expect(extractItems(body, config)).toEqual([{ id: 1 }, { id: 2 }]);
  });

  it('returns empty array when items path is not an array', () => {
    const body = { data: 'not-an-array' };
    expect(extractItems(body, config)).toEqual([]);
  });
});

describe('extractTotal', () => {
  it('extracts numeric total from response body', () => {
    const body = { total: 42 };
    expect(extractTotal(body, config)).toBe(42);
  });

  it('returns undefined when total is not a number', () => {
    const body = { total: 'bad' };
    expect(extractTotal(body, config)).toBeUndefined();
  });

  it('returns undefined when total path is null in config', () => {
    const noTotalConfig = {
      ...config,
      upstream: { ...config.upstream, responseMapping: { ...config.upstream.responseMapping, total: null } },
    };
    const body = { total: 42 };
    expect(extractTotal(body, noTotalConfig)).toBeUndefined();
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `cd packages/proxy && npx vitest run src/engine/fetch-service.test.ts`
Expected: FAIL — module `./fetch-service.js` not found

**Step 3: Write the implementation**

Create `fetch-service.ts`:

```typescript
import type { CollectionConfig } from './types.js';
import { getByPath } from './geojson-builder.js';
import { logger } from '../logger.js';

export class UpstreamError extends Error {
  constructor(public readonly statusCode: number) {
    super(`Upstream error: ${statusCode}`);
  }
}

export class UpstreamTimeoutError extends Error {
  public readonly timeoutMs: number;
  constructor(url: string, timeoutMs: number) {
    super(`Upstream timeout after ${timeoutMs}ms`);
    this.timeoutMs = timeoutMs;
  }
}

const DEFAULT_TIMEOUT_MS = 15_000;

export function redactUrl(url: string): string {
  try {
    const u = new URL(url);
    return `${u.origin}${u.pathname}`;
  } catch {
    return url;
  }
}

export async function fetchJson(url: string, timeoutMs?: number): Promise<Record<string, unknown>> {
  const log = logger.adapter();
  const start = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs ?? DEFAULT_TIMEOUT_MS);

  try {
    const response = await fetch(url, { signal: controller.signal });
    const durationMs = Date.now() - start;
    log.info(
      { url: redactUrl(url), status: response.status, durationMs },
      `upstream ${response.status} in ${durationMs}ms`,
    );
    if (!response.ok) {
      throw new UpstreamError(response.status);
    }
    return response.json() as Promise<Record<string, unknown>>;
  } catch (err) {
    if (err instanceof UpstreamError) throw err;
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

export function extractItems(body: Record<string, unknown>, config: CollectionConfig): Record<string, unknown>[] {
  const raw = getByPath(body, config.upstream.responseMapping.items);
  if (!Array.isArray(raw)) {
    const log = logger.adapter();
    log.warning({ path: config.upstream.responseMapping.items }, 'upstream items field is not an array');
    return [];
  }
  return raw as Record<string, unknown>[];
}

export function extractTotal(body: Record<string, unknown>, config: CollectionConfig): number | undefined {
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

**Step 4: Run tests to verify they pass**

Run: `cd packages/proxy && npx vitest run src/engine/fetch-service.test.ts`
Expected: PASS (all 6 tests)

**Step 5: Commit**

```bash
git add packages/proxy/src/engine/fetch-service.ts packages/proxy/src/engine/fetch-service.test.ts
git commit -m "refactor: extract fetch-service from adapter with tests"
```

---

### Task 2: Create pagination strategy types and helpers

**Files:**
- Create: `packages/proxy/src/engine/pagination/types.ts`

**Step 1: Write the types file**

```typescript
import type { CollectionConfig } from '../types.js';

export interface FetchParams {
  offset: number;
  limit: number;
  bbox?: [number, number, number, number];
  upstreamParams?: Record<string, string>;
}

export interface UpstreamPage {
  items: Record<string, unknown>[];
  total?: number;
}

export type Fetcher = (url: string, timeoutMs?: number) => Promise<Record<string, unknown>>;

export interface PaginationStrategy<P = unknown> {
  fetch(
    config: CollectionConfig,
    pagination: P,
    params: FetchParams,
    fetcher: Fetcher,
  ): Promise<UpstreamPage>;
}
```

No test needed — this is pure type definitions.

**Step 2: Write the `applyExtraParams` helper**

Add to the same file:

```typescript
export function applyExtraParams(url: URL, params: FetchParams): void {
  if (params.bbox) {
    url.searchParams.set('bbox', params.bbox.join(','));
  }
  if (params.upstreamParams) {
    for (const [key, value] of Object.entries(params.upstreamParams)) {
      url.searchParams.set(key, value);
    }
  }
}
```

**Step 3: Commit**

```bash
git add packages/proxy/src/engine/pagination/types.ts
git commit -m "refactor: add pagination strategy types and helpers"
```

---

### Task 3: Create offset-limit strategy with tests

**Files:**
- Create: `packages/proxy/src/engine/pagination/offset-limit.ts`
- Create: `packages/proxy/src/engine/pagination/offset-limit.test.ts`

**Step 1: Write the failing test**

```typescript
import { describe, it, expect, vi } from 'vitest';
import { offsetLimitStrategy } from './offset-limit.js';
import type { CollectionConfig } from '../types.js';
import type { OffsetLimitPagination } from '../types.js';

const config: CollectionConfig = {
  title: 'Test',
  upstream: {
    baseUrl: 'http://mock:3001/api/test',
    method: 'GET',
    pagination: { type: 'offset-limit', offsetParam: 'offset', limitParam: 'limit' },
    responseMapping: { items: 'data', total: 'total', item: 'data' },
  },
  geometry: { type: 'Point', xField: 'x', yField: 'y' },
  idField: 'id',
  properties: [{ name: 'name', type: 'string' }],
};

const pagination: OffsetLimitPagination = { type: 'offset-limit', offsetParam: 'offset', limitParam: 'limit' };

describe('offsetLimitStrategy', () => {
  it('passes offset and limit to upstream URL', async () => {
    const fetcher = vi.fn().mockResolvedValue({ data: [{ id: 1 }], total: 10 });
    const result = await offsetLimitStrategy.fetch(config, pagination, { offset: 5, limit: 3 }, fetcher);

    const url = new URL(fetcher.mock.calls[0][0]);
    expect(url.searchParams.get('offset')).toBe('5');
    expect(url.searchParams.get('limit')).toBe('3');
    expect(result.items).toEqual([{ id: 1 }]);
    expect(result.total).toBe(10);
  });

  it('applies bbox and upstream params', async () => {
    const fetcher = vi.fn().mockResolvedValue({ data: [], total: 0 });
    await offsetLimitStrategy.fetch(
      config, pagination,
      { offset: 0, limit: 10, bbox: [-74, 45, -73, 46], upstreamParams: { status: 'active' } },
      fetcher,
    );

    const url = new URL(fetcher.mock.calls[0][0]);
    expect(url.searchParams.get('bbox')).toBe('-74,45,-73,46');
    expect(url.searchParams.get('status')).toBe('active');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd packages/proxy && npx vitest run src/engine/pagination/offset-limit.test.ts`
Expected: FAIL

**Step 3: Write the implementation**

```typescript
import type { PaginationStrategy, FetchParams, UpstreamPage, Fetcher } from './types.js';
import type { CollectionConfig, OffsetLimitPagination } from '../types.js';
import { extractItems, extractTotal } from '../fetch-service.js';
import { applyExtraParams } from './types.js';

export const offsetLimitStrategy: PaginationStrategy<OffsetLimitPagination> = {
  async fetch(
    config: CollectionConfig,
    pagination: OffsetLimitPagination,
    params: FetchParams,
    fetcher: Fetcher,
  ): Promise<UpstreamPage> {
    const url = new URL(config.upstream.baseUrl);
    url.searchParams.set(pagination.offsetParam, String(params.offset));
    url.searchParams.set(pagination.limitParam, String(params.limit));
    applyExtraParams(url, params);

    const body = await fetcher(url.toString(), config.timeout);
    return { items: extractItems(body, config), total: extractTotal(body, config) };
  },
};
```

**Step 4: Run test to verify it passes**

Run: `cd packages/proxy && npx vitest run src/engine/pagination/offset-limit.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/proxy/src/engine/pagination/offset-limit.ts packages/proxy/src/engine/pagination/offset-limit.test.ts
git commit -m "refactor: extract offset-limit pagination strategy"
```

---

### Task 4: Create page-based strategy with tests

**Files:**
- Create: `packages/proxy/src/engine/pagination/page-based.ts`
- Create: `packages/proxy/src/engine/pagination/page-based.test.ts`

**Step 1: Write the failing test**

```typescript
import { describe, it, expect, vi } from 'vitest';
import { pageBasedStrategy } from './page-based.js';
import type { CollectionConfig, PagePagination } from '../types.js';

const config: CollectionConfig = {
  title: 'Test',
  upstream: {
    baseUrl: 'http://mock:3001/api/pistes',
    method: 'GET',
    pagination: { type: 'page-pageSize', pageParam: 'page', pageSizeParam: 'pageSize' },
    responseMapping: { items: 'results', total: 'count', item: 'result' },
  },
  geometry: { type: 'LineString', coordsField: 'geometry.coords' },
  idField: 'id',
  properties: [{ name: 'nom', type: 'string' }],
};

const pagination: PagePagination = { type: 'page-pageSize', pageParam: 'page', pageSizeParam: 'pageSize' };

describe('pageBasedStrategy', () => {
  it('converts offset/limit to page/pageSize', async () => {
    const fetcher = vi.fn().mockResolvedValue({ results: [{ id: 1 }], count: 8 });
    const result = await pageBasedStrategy.fetch(config, pagination, { offset: 6, limit: 3 }, fetcher);

    const url = new URL(fetcher.mock.calls[0][0]);
    expect(url.searchParams.get('page')).toBe('3');
    expect(url.searchParams.get('pageSize')).toBe('3');
    expect(result.items).toEqual([{ id: 1 }]);
    expect(result.total).toBe(8);
  });

  it('uses page 1 when offset is 0', async () => {
    const fetcher = vi.fn().mockResolvedValue({ results: [], count: 0 });
    await pageBasedStrategy.fetch(config, pagination, { offset: 0, limit: 5 }, fetcher);

    const url = new URL(fetcher.mock.calls[0][0]);
    expect(url.searchParams.get('page')).toBe('1');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd packages/proxy && npx vitest run src/engine/pagination/page-based.test.ts`
Expected: FAIL

**Step 3: Write the implementation**

```typescript
import type { PaginationStrategy, FetchParams, UpstreamPage, Fetcher } from './types.js';
import type { CollectionConfig, PagePagination } from '../types.js';
import { extractItems, extractTotal } from '../fetch-service.js';
import { applyExtraParams } from './types.js';

export const pageBasedStrategy: PaginationStrategy<PagePagination> = {
  async fetch(
    config: CollectionConfig,
    pagination: PagePagination,
    params: FetchParams,
    fetcher: Fetcher,
  ): Promise<UpstreamPage> {
    const page = Math.floor(params.offset / params.limit) + 1;
    const url = new URL(config.upstream.baseUrl);
    url.searchParams.set(pagination.pageParam, String(page));
    url.searchParams.set(pagination.pageSizeParam, String(params.limit));
    applyExtraParams(url, params);

    const body = await fetcher(url.toString(), config.timeout);
    return { items: extractItems(body, config), total: extractTotal(body, config) };
  },
};
```

**Step 4: Run test to verify it passes**

Run: `cd packages/proxy && npx vitest run src/engine/pagination/page-based.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/proxy/src/engine/pagination/page-based.ts packages/proxy/src/engine/pagination/page-based.test.ts
git commit -m "refactor: extract page-based pagination strategy"
```

---

### Task 5: Create cursor strategy with tests

**Files:**
- Create: `packages/proxy/src/engine/pagination/cursor.ts`
- Create: `packages/proxy/src/engine/pagination/cursor.test.ts`

**Step 1: Write the failing test**

```typescript
import { describe, it, expect, vi } from 'vitest';
import { cursorStrategy } from './cursor.js';
import type { CollectionConfig, CursorPagination } from '../types.js';

const config: CollectionConfig = {
  title: 'Test',
  upstream: {
    baseUrl: 'http://mock:3001/api/arr',
    method: 'GET',
    pagination: { type: 'cursor', cursorParam: 'cursor', limitParam: 'limit', nextCursorField: 'nextCursor' },
    responseMapping: { items: 'items', total: null, item: 'item' },
  },
  geometry: { type: 'Polygon', wktField: 'wkt' },
  idField: 'code',
  properties: [{ name: 'nom', type: 'string' }],
};

const pagination: CursorPagination = { type: 'cursor', cursorParam: 'cursor', limitParam: 'limit', nextCursorField: 'nextCursor' };

describe('cursorStrategy', () => {
  it('fetches first page when offset is 0', async () => {
    const fetcher = vi.fn().mockResolvedValue({ items: [{ code: 'A' }, { code: 'B' }], nextCursor: 'B' });
    const result = await cursorStrategy.fetch(config, pagination, { offset: 0, limit: 2 }, fetcher);

    const url = new URL(fetcher.mock.calls[0][0]);
    expect(url.searchParams.has('cursor')).toBe(false);
    expect(result.items).toEqual([{ code: 'A' }, { code: 'B' }]);
    expect(result.total).toBeUndefined();
  });

  it('iterates pages to reach offset', async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce({ items: [{ code: 'A' }, { code: 'B' }], nextCursor: 'B' })
      .mockResolvedValueOnce({ items: [{ code: 'C' }, { code: 'D' }], nextCursor: 'D' });

    const result = await cursorStrategy.fetch(config, pagination, { offset: 2, limit: 2 }, fetcher);

    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(result.items).toEqual([{ code: 'C' }, { code: 'D' }]);
  });

  it('stops when no nextCursor is returned', async () => {
    const fetcher = vi.fn().mockResolvedValue({ items: [{ code: 'A' }], nextCursor: null });
    const result = await cursorStrategy.fetch(config, pagination, { offset: 0, limit: 10 }, fetcher);

    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(result.items).toEqual([{ code: 'A' }]);
  });

  it('stops when empty items returned', async () => {
    const fetcher = vi.fn().mockResolvedValue({ items: [], nextCursor: 'X' });
    const result = await cursorStrategy.fetch(config, pagination, { offset: 0, limit: 10 }, fetcher);

    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(result.items).toEqual([]);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd packages/proxy && npx vitest run src/engine/pagination/cursor.test.ts`
Expected: FAIL

**Step 3: Write the implementation**

```typescript
import type { PaginationStrategy, FetchParams, UpstreamPage, Fetcher } from './types.js';
import type { CollectionConfig, CursorPagination } from '../types.js';
import { extractItems } from '../fetch-service.js';
import { getByPath } from '../geojson-builder.js';
import { applyExtraParams } from './types.js';

export const cursorStrategy: PaginationStrategy<CursorPagination> = {
  async fetch(
    config: CollectionConfig,
    pagination: CursorPagination,
    params: FetchParams,
    fetcher: Fetcher,
  ): Promise<UpstreamPage> {
    let cursor: string | undefined;
    const collected: Record<string, unknown>[] = [];

    while (collected.length < params.offset + params.limit) {
      const url = new URL(config.upstream.baseUrl);
      url.searchParams.set(pagination.limitParam, String(params.limit));
      if (cursor) {
        url.searchParams.set(pagination.cursorParam, cursor);
      }
      applyExtraParams(url, params);

      const body = await fetcher(url.toString(), config.timeout);
      const items = extractItems(body, config);
      collected.push(...items);

      const nextCursor = getByPath(body, pagination.nextCursorField) as string | null;
      if (!nextCursor || items.length === 0) break;
      cursor = nextCursor;
    }

    return {
      items: collected.slice(params.offset, params.offset + params.limit),
      total: undefined,
    };
  },
};
```

**Step 4: Run test to verify it passes**

Run: `cd packages/proxy && npx vitest run src/engine/pagination/cursor.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/proxy/src/engine/pagination/cursor.ts packages/proxy/src/engine/pagination/cursor.test.ts
git commit -m "refactor: extract cursor pagination strategy"
```

---

### Task 6: Create WFS strategy with tests

**Files:**
- Create: `packages/proxy/src/engine/pagination/wfs.ts`
- Create: `packages/proxy/src/engine/pagination/wfs.test.ts`

**Step 1: Write the failing test**

```typescript
import { describe, it, expect, vi } from 'vitest';
import { wfsStrategy } from './wfs.js';
import type { CollectionConfig } from '../types.js';
import type { WfsPaginationParams } from './wfs.js';

const config: CollectionConfig = {
  title: 'WFS Test',
  upstream: {
    type: 'wfs',
    baseUrl: 'http://mock:3001/wfs',
    method: 'GET',
    pagination: { type: 'offset-limit', offsetParam: 'startIndex', limitParam: 'maxFeatures' },
    responseMapping: { items: 'features', total: 'totalFeatures', item: 'features.0' },
    typeName: 'parks',
    version: '1.1.0',
  },
  geometry: { type: 'Point', xField: 'x', yField: 'y' },
  idField: 'id',
  properties: [{ name: 'name', type: 'string' }],
};

const pagination: WfsPaginationParams = { typeName: 'parks', version: '1.1.0' };

describe('wfsStrategy', () => {
  it('builds WFS GetFeature URL and parses response', async () => {
    const fetcher = vi.fn().mockResolvedValue({
      features: [{ id: 1, properties: { name: 'Park A' } }],
      totalFeatures: 5,
    });

    const result = await wfsStrategy.fetch(config, pagination, { offset: 0, limit: 10 }, fetcher);

    const url = new URL(fetcher.mock.calls[0][0]);
    expect(url.searchParams.get('service')).toBe('WFS');
    expect(url.searchParams.get('request')).toBe('GetFeature');
    expect(url.searchParams.get('typeName')).toBe('parks');
    expect(url.searchParams.get('startIndex')).toBe('0');
    expect(url.searchParams.get('maxFeatures')).toBe('10');
    expect(result.items).toEqual([{ id: 1, properties: { name: 'Park A' } }]);
    expect(result.total).toBe(5);
  });

  it('passes bbox to WFS URL', async () => {
    const fetcher = vi.fn().mockResolvedValue({ features: [], totalFeatures: 0 });
    await wfsStrategy.fetch(config, pagination, { offset: 0, limit: 10, bbox: [-74, 45, -73, 46] }, fetcher);

    const url = new URL(fetcher.mock.calls[0][0]);
    expect(url.searchParams.get('BBOX')).toBe('-74,45,-73,46');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd packages/proxy && npx vitest run src/engine/pagination/wfs.test.ts`
Expected: FAIL

**Step 3: Write the implementation**

```typescript
import type { PaginationStrategy, FetchParams, UpstreamPage, Fetcher } from './types.js';
import type { CollectionConfig } from '../types.js';
import { buildWfsGetFeatureUrl } from '../../plugins/wfs-upstream.js';

export interface WfsPaginationParams {
  typeName: string;
  version: string;
}

export const wfsStrategy: PaginationStrategy<WfsPaginationParams> = {
  async fetch(
    config: CollectionConfig,
    pagination: WfsPaginationParams,
    params: FetchParams,
    fetcher: Fetcher,
  ): Promise<UpstreamPage> {
    const url = buildWfsGetFeatureUrl(config.upstream.baseUrl, pagination.typeName, {
      startIndex: params.offset,
      count: params.limit,
      version: pagination.version,
      bbox: params.bbox,
    });

    const body = await fetcher(url, config.timeout);
    const features = (body.features ?? []) as Record<string, unknown>[];
    const total = body.totalFeatures as number | undefined;

    return { items: features, total };
  },
};
```

**Step 4: Run test to verify it passes**

Run: `cd packages/proxy && npx vitest run src/engine/pagination/wfs.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/proxy/src/engine/pagination/wfs.ts packages/proxy/src/engine/pagination/wfs.test.ts
git commit -m "refactor: extract WFS pagination strategy"
```

---

### Task 7: Create pagination factory (`index.ts`) with tests

**Files:**
- Create: `packages/proxy/src/engine/pagination/index.ts`
- Create: `packages/proxy/src/engine/pagination/index.test.ts`

**Step 1: Write the failing test**

```typescript
import { describe, it, expect, vi } from 'vitest';
import { fetchWithStrategy } from './index.js';
import type { CollectionConfig } from '../types.js';

const baseFetcher = vi.fn().mockResolvedValue({ data: [{ id: 1 }], total: 5 });

const makeConfig = (overrides: Partial<CollectionConfig['upstream']>): CollectionConfig => ({
  title: 'Test',
  upstream: {
    baseUrl: 'http://mock:3001/api/test',
    method: 'GET',
    pagination: { type: 'offset-limit', offsetParam: 'offset', limitParam: 'limit' },
    responseMapping: { items: 'data', total: 'total', item: 'data' },
    ...overrides,
  },
  geometry: { type: 'Point', xField: 'x', yField: 'y' },
  idField: 'id',
  properties: [{ name: 'name', type: 'string' }],
});

describe('fetchWithStrategy', () => {
  it('dispatches to offset-limit strategy', async () => {
    const config = makeConfig({ pagination: { type: 'offset-limit', offsetParam: 'offset', limitParam: 'limit' } });
    const result = await fetchWithStrategy(config, { offset: 0, limit: 10 }, baseFetcher);
    expect(result.items).toEqual([{ id: 1 }]);
  });

  it('dispatches to page-based strategy', async () => {
    const fetcher = vi.fn().mockResolvedValue({ results: [{ id: 2 }], count: 3 });
    const config = makeConfig({
      pagination: { type: 'page-pageSize', pageParam: 'page', pageSizeParam: 'pageSize' },
      responseMapping: { items: 'results', total: 'count', item: 'result' },
    });
    const result = await fetchWithStrategy(config, { offset: 0, limit: 10 }, fetcher);
    expect(result.items).toEqual([{ id: 2 }]);
  });

  it('dispatches to WFS strategy', async () => {
    const fetcher = vi.fn().mockResolvedValue({ features: [{ id: 3 }], totalFeatures: 1 });
    const config = makeConfig({ type: 'wfs', typeName: 'parks', version: '2.0.0' });
    const result = await fetchWithStrategy(config, { offset: 0, limit: 10 }, fetcher);
    expect(result.items).toEqual([{ id: 3 }]);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd packages/proxy && npx vitest run src/engine/pagination/index.test.ts`
Expected: FAIL

**Step 3: Write the implementation**

```typescript
import type { CollectionConfig } from '../types.js';
import type { FetchParams, UpstreamPage, Fetcher } from './types.js';
import { offsetLimitStrategy } from './offset-limit.js';
import { pageBasedStrategy } from './page-based.js';
import { cursorStrategy } from './cursor.js';
import { wfsStrategy } from './wfs.js';

export type { FetchParams, UpstreamPage, Fetcher } from './types.js';
export { applyExtraParams } from './types.js';

export function fetchWithStrategy(
  config: CollectionConfig,
  params: FetchParams,
  fetcher: Fetcher,
): Promise<UpstreamPage> {
  if (config.upstream.type === 'wfs') {
    return wfsStrategy.fetch(
      config,
      { typeName: config.upstream.typeName!, version: config.upstream.version ?? '1.1.0' },
      params,
      fetcher,
    );
  }
  const p = config.upstream.pagination;
  switch (p.type) {
    case 'offset-limit':
      return offsetLimitStrategy.fetch(config, p, params, fetcher);
    case 'page-pageSize':
      return pageBasedStrategy.fetch(config, p, params, fetcher);
    case 'cursor':
      return cursorStrategy.fetch(config, p, params, fetcher);
  }
}
```

**Step 4: Run test to verify it passes**

Run: `cd packages/proxy && npx vitest run src/engine/pagination/index.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/proxy/src/engine/pagination/index.ts packages/proxy/src/engine/pagination/index.test.ts
git commit -m "refactor: add pagination factory with type-safe dispatch"
```

---

### Task 8: Rewrite `adapter.ts` as simplified facade

**Files:**
- Modify: `packages/proxy/src/engine/adapter.ts` (complete rewrite)
- Modify: `packages/proxy/src/engine/adapter.test.ts` (update imports and signatures)

**Step 1: Rewrite `adapter.ts`**

Replace entire file with:

```typescript
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
  const cacheKey = { offset: params.offset, limit: params.limit, bbox: params.bbox, upstreamParams: params.upstreamParams };
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
```

**Step 2: Update `adapter.test.ts`**

Update the import and all call sites to use `AdapterDeps` object instead of positional args:

- Change: `fetchUpstreamItems('id', config, params, null, undefined, mockCache)` → `fetchUpstreamItems('id', config, params, { cache: mockCache })`
- Change: `fetchUpstreamItem('id', config, '1', redis, keyPrefix, cache)` → `fetchUpstreamItem('id', config, '1', { redis, keyPrefix, cache })`
- Remove the `vi.mock('../plugins/wfs-upstream.js')` if present (no longer imported by adapter)
- Remove the import of `buildWfsGetFeatureUrl` from adapter tests (moved to pagination/wfs)

All existing test scenarios remain: offset/limit, page/pageSize, cursor, single item, error handling, validation, timeout, cache, rate limiting, circuit breaker, bbox, extra params. The tests just use the new signature.

**Step 3: Run all tests**

Run: `cd packages/proxy && npx vitest run src/engine/adapter.test.ts`
Expected: PASS (all existing tests pass with updated signatures)

**Step 4: Commit**

```bash
git add packages/proxy/src/engine/adapter.ts packages/proxy/src/engine/adapter.test.ts
git commit -m "refactor: rewrite adapter as simplified facade with executeWithMiddleware"
```

---

### Task 9: Update callers to use `AdapterDeps`

**Files:**
- Modify: `packages/proxy/src/ogc/items.ts` (lines 314-326 and 426)
- Modify: `packages/proxy/src/wfs/get-feature.ts` (lines 138-143, 150-157, 177-187)

**Step 1: Update `items.ts`**

Replace import:
```typescript
// Before
import { fetchUpstreamItems, fetchUpstreamItem, UpstreamError, UpstreamTimeoutError } from '../engine/adapter.js';
// After (same — exports are re-exported from adapter)
import { fetchUpstreamItems, fetchUpstreamItem, UpstreamError, UpstreamTimeoutError } from '../engine/adapter.js';
```

Update `getItems` call site (~line 311-326):
```typescript
// Before
const redis = req.app.get('redis') as Redis | null;
const keyPrefix = req.app.get('redisKeyPrefix') as string | undefined;
const cache = req.app.get('cache') as CacheService | null;
const upstream = await fetchUpstreamItems(
  collectionId, config,
  { offset: ogcReq.offset, limit: fetchLimit, bbox: ogcReq.bbox, upstreamParams },
  redis, keyPrefix, cache,
);

// After
const deps = {
  redis: req.app.get('redis') as Redis | null,
  keyPrefix: req.app.get('redisKeyPrefix') as string | undefined,
  cache: req.app.get('cache') as CacheService | null,
};
const upstream = await fetchUpstreamItems(
  collectionId, config,
  { offset: ogcReq.offset, limit: fetchLimit, bbox: ogcReq.bbox, upstreamParams },
  deps,
);
```

Update `getItem` call site (~line 423-426):
```typescript
// Before
const redis = req.app.get('redis') as Redis | null;
const keyPrefix = req.app.get('redisKeyPrefix') as string | undefined;
const cache = req.app.get('cache') as CacheService | null;
const raw = await fetchUpstreamItem(collectionId, config, featureId, redis, keyPrefix, cache);

// After
const deps = {
  redis: req.app.get('redis') as Redis | null,
  keyPrefix: req.app.get('redisKeyPrefix') as string | undefined,
  cache: req.app.get('cache') as CacheService | null,
};
const raw = await fetchUpstreamItem(collectionId, config, featureId, deps);
```

Remove unused `import type { Redis } from 'ioredis'` and `import type { CacheService }` if no longer referenced directly. Keep them if still used for the `req.app.get` casts.

**Step 2: Update `get-feature.ts`**

Update `executeGetFeature` signature and call sites:
```typescript
// Before
export async function executeGetFeature(
  params: WfsGetFeatureParams,
  redis?: Redis | null,
  keyPrefix?: string,
  cache?: CacheService | null,
) {

// After
import type { AdapterDeps } from '../engine/adapter.js';

export async function executeGetFeature(
  params: WfsGetFeatureParams,
  deps: AdapterDeps = {},
) {
```

Replace all `fetchUpstreamItems(... redis, keyPrefix, cache)` calls with `fetchUpstreamItems(... deps)`.

**Step 3: Update WFS router caller**

Check `packages/proxy/src/wfs/router.ts` or wherever `executeGetFeature` is called — update to pass `{ redis, keyPrefix, cache }` as deps object.

**Step 4: Run full test suite**

Run: `cd packages/proxy && npx vitest run`
Expected: ALL PASS

**Step 5: Commit**

```bash
git add packages/proxy/src/ogc/items.ts packages/proxy/src/wfs/get-feature.ts packages/proxy/src/wfs/router.ts
git commit -m "refactor: update callers to use AdapterDeps object"
```

---

### Task 10: Clean up and verify

**Step 1: Run TypeScript compilation**

Run: `cd packages/proxy && npx tsc --noEmit`
Expected: No errors

**Step 2: Run full test suite with coverage**

Run: `cd packages/proxy && npx vitest run --coverage`
Expected: ALL PASS, coverage >= 80%

**Step 3: Run lint**

Run: `npm run lint`
Expected: No errors

**Step 4: Verify adapter line count**

Run: `wc -l packages/proxy/src/engine/adapter.ts`
Expected: ~100 lines (down from 415)

**Step 5: Commit any final fixes**

```bash
git add -A
git commit -m "refactor: adapter refactor cleanup and verification"
```
