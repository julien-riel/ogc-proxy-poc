# Adapter Refactor — Strategy + Facade

## Problem

`adapter.ts` (415 lines) has several issues:

1. **Massive duplication** — `fetchUpstreamItems` and `fetchUpstreamItem` share ~80% identical code (cache, rate-limit, circuit-breaker, metrics, retry)
2. **`fetchWfsUpstream` duplicates `fetchJson`** — The HTTP fetch with timeout/abort/logging is rewritten instead of reusing `fetchJson`
3. **Overloaded signature** — 6 params, 3 optional infrastructure concerns passed individually
4. **`as` casts on pagination** — Loses the type-safety that Zod's discriminated union provides

## Approach: Strategy + Facade

### File structure

```
engine/
  pagination/
    types.ts          # PaginationStrategy<P> interface, Fetcher type
    offset-limit.ts   # offsetLimitStrategy
    page-based.ts     # pageBasedStrategy
    cursor.ts         # cursorStrategy (encapsulates iteration)
    wfs.ts            # wfsStrategy
    index.ts          # fetchWithStrategy() factory with type narrowing
  fetch-service.ts    # fetchJson, extractItems, extractTotal
  adapter.ts          # Simplified facade (~80-100 lines)
```

### Core interface

```typescript
// pagination/types.ts
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

Each strategy receives its pagination config already narrowed by TypeScript — zero casts.

### Type-safe factory

```typescript
// pagination/index.ts
export function fetchWithStrategy(
  config: CollectionConfig,
  params: FetchParams,
  fetcher: Fetcher,
): Promise<UpstreamPage> {
  if (config.upstream.type === 'wfs') {
    return wfsStrategy.fetch(config, {
      typeName: config.upstream.typeName!,
      version: config.upstream.version ?? '1.1.0',
    }, params, fetcher);
  }
  const p = config.upstream.pagination;
  switch (p.type) {
    case 'offset-limit':  return offsetLimitStrategy.fetch(config, p, params, fetcher);
    case 'page-pageSize': return pageBasedStrategy.fetch(config, p, params, fetcher);
    case 'cursor':        return cursorStrategy.fetch(config, p, params, fetcher);
  }
}
```

The `switch` on the discriminated union provides automatic narrowing — TypeScript knows `p` is `OffsetLimitPagination` in the first case.

### Simplified adapter facade

Dependencies bundled into a single object:

```typescript
export interface AdapterDeps {
  cache?: CacheService | null;
  redis?: Redis | null;
  keyPrefix?: string;
}
```

Cross-cutting concerns extracted into a shared function:

```typescript
async function executeWithMiddleware<T>(
  collectionId: string,
  config: CollectionConfig,
  cacheKey: Record<string, unknown>,
  doFetch: () => Promise<T>,
  deps: AdapterDeps,
): Promise<T> {
  // 1. Cache check → early return if hit
  // 2. Rate limit check → throw 429 if exceeded
  // 3. Circuit breaker check → throw 503 if open
  // 4. Wrap doFetch with retry if configured
  // 5. Execute with timing
  // 6. Record metrics (success or error)
  // 7. Record circuit breaker outcome
  // 8. Cache store on success
  // 9. Return result
}
```

Public functions become thin wrappers:

```typescript
export async function fetchUpstreamItems(
  collectionId: string,
  config: CollectionConfig,
  params: FetchParams,
  deps: AdapterDeps = {},
): Promise<UpstreamPage> {
  const doFetch = () => fetchWithStrategy(config, params, fetchJson);
  const cacheKey = { offset: params.offset, limit: params.limit, bbox: params.bbox, upstreamParams: params.upstreamParams };
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

### fetch-service.ts

Unified HTTP fetch extracted from current `fetchJson` + `fetchWfsUpstream`:

- `fetchJson(url, timeoutMs?)` — timeout via AbortController, structured logging, UpstreamError/UpstreamTimeoutError
- `extractItems(body, config)` — get items array from response via path mapping
- `extractTotal(body, config)` — get total count from response via path mapping
- `redactUrl(url)` — strip query params for logging

### WFS strategy

`fetchWfsUpstream` is eliminated. The `wfsStrategy` builds the URL via `buildWfsGetFeatureUrl` and calls the shared `fetcher` (which is `fetchJson`). No more duplicated timeout/abort/logging code.

### Testing strategy

- Each pagination strategy gets its own test file — focused, small
- `fetch-service.test.ts` — timeout, error handling, extraction
- `adapter.test.ts` — integration: middleware pipeline (cache, rate-limit, circuit-breaker, retry, metrics)
- Existing test scenarios preserved, reorganized by responsibility

### Breaking changes

- `fetchUpstreamItems` and `fetchUpstreamItem` signatures change: `(redis?, keyPrefix?, cache?)` becomes `(deps: AdapterDeps = {})`
- Callers (`items.ts`, `get-feature.ts`) need to update to `{ cache, redis, keyPrefix }` object syntax
- All exports remain the same names — no import path changes for consumers outside engine/
