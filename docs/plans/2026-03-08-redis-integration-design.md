# Redis Integration Design

**Date**: 2026-03-08
**Status**: Approved
**Approach**: Single shared ioredis client (Approach A)

## Goals

- Enable horizontal scaling by externalizing in-memory state to Redis
- Add response caching for upstream APIs to reduce latency and load
- Graceful degradation: everything works without Redis (falls back to current in-memory behavior)

## Architecture

Single `ioredis` client instantiated at startup, injected into components. Redis is optional — when `REDIS_URL` is not set or Redis becomes unavailable, all components fall back to in-memory behavior.

Key prefix: configurable via `REDIS_KEY_PREFIX` (default: `ogc:`).

### Components Using Redis

| Component | Key pattern | Purpose |
|-----------|------------|---------|
| Client rate limiting | `ogc:rl:client:*` | Shared request counters across instances |
| Upstream rate limiting | `ogc:rl:upstream:{collectionId}` | Distributed token bucket per collection |
| Response cache | `ogc:cache:{collectionId}:{hash}` | Cached upstream responses with TTL |

## 1. Redis Client and Connection

- Module: `src/redis.ts`
- Configured via `REDIS_URL` (e.g., `redis://localhost:6379`)
- If `REDIS_URL` is not set, client is `null` and all components use in-memory fallback
- If Redis becomes unavailable at runtime, log warning and continue without Redis
- `/ready` endpoint checks Redis connectivity when configured
- Graceful shutdown closes Redis connection
- Docker Compose adds a `redis:7-alpine` service

## 2. Client Rate Limiting (express-rate-limit)

- Uses `rate-limit-redis` as store when Redis is available
- Falls back to default in-memory store when Redis is `null`
- No changes to existing env vars (`RATE_LIMIT_WINDOW_MS`, `RATE_LIMIT_MAX`)
- Key prefix: `ogc:rl:client:`

## 3. Upstream Rate Limiting (Distributed Token Bucket)

- Replaces in-memory `Map<string, TokenBucket>` with Redis-backed token bucket
- Atomic Lua script handles refill + tryConsume in a single operation (EVALSHA)
  - Why Lua: without atomicity, concurrent instances can read the same token count and both grant a token when only one remains. Redis executes Lua scripts without interruption, eliminating race conditions. The Lua script performs the same calculation as the current `TokenBucket` class.
- Keys: `ogc:rl:upstream:{collectionId}` — stores remaining tokens and last refill timestamp
- Graceful degradation: falls back to existing in-memory `TokenBucket` class
- No config changes — `capacity` and `refillRate` remain per-collection in `collections.yaml`

## 4. Response Cache

- Module: `src/engine/cache.ts`
- Wraps upstream calls in `adapter.ts` (`fetchUpstreamItems` and `fetchUpstreamItem`)
- Cache key: `ogc:cache:{collectionId}:{hash}` where hash is MD5 of request params (offset, limit, bbox, upstreamParams, itemId)
- TTL configurable per collection in `collections.yaml`:
  ```yaml
  cache:
    ttlSeconds: 300
  ```
- No cache for collections without `cache` config
- Graceful degradation: if Redis unavailable, go directly to upstream

### Manual Invalidation

- Endpoint: `DELETE /admin/cache/:collectionId`
- Uses SCAN to delete all keys matching `ogc:cache:{collectionId}:*`
- Protected by existing JWT middleware

## 5. Configuration Changes

### New Zod schema

```typescript
export const cacheConfigSchema = z.object({
  ttlSeconds: z.number().positive(),
});
```

Added as optional `cache` field in `collectionConfigSchema`.

### New Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `REDIS_URL` | (none) | Redis connection URL. No Redis if absent. |
| `REDIS_KEY_PREFIX` | `ogc:` | Prefix for all Redis keys |

### Docker Compose

- New `redis` service: `redis:7-alpine`, port 6379
- `REDIS_URL=redis://redis:6379` injected into proxy service

## 6. Admin Route and Testability

- New router: `src/admin/router.ts` mounted on `/admin`, protected by JWT
- Redis client injected via `createApp()` rather than imported as singleton
- Passing `null` in unit tests triggers in-memory fallback; real Redis for integration tests
- Existing unit tests unchanged in behavior

### Test Plan

- Unit tests for cache (hit/miss/invalidation) with mocked Redis
- Unit tests for distributed token bucket with mocked Redis
- Integration test verifying rate limiting is shared between two app instances
