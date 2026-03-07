# Production Readiness Design (P0 + P1)

Date: 2026-03-07
Scope: 9 items (P0 x5 + P1 x4, CI/CD excluded)

## Items

### P0-1: Structured Logging

Use `@villedemontreal/logger` (already installed). Add request logging middleware
in `app.ts`, upstream call logging in `adapter.ts`, error context in `items.ts`
and `wfs/router.ts`. Wire up `@villedemontreal/correlation-id` for per-request
correlation IDs. JSON format by default.

### P0-2: Upstream Timeouts

Add `AbortController` with configurable timeout (default 15s) to all `fetch()`
calls in `adapter.ts`. Add `timeout` field to `CollectionConfig`. Return 504 on
timeout. Log timeout with upstream URL.

### P0-3: Post-Fetch Limit

Add `maxPostFetchItems` to config (default 5000). Cap fetch in
`get-feature.ts:153` and `items.ts:315`. Add warning in response when cap is hit
and requested count is not satisfied.

### P0-4: Request Size Limits

- `express.text({ limit: '100kb' })` in WFS router
- `express.json({ limit: '100kb' })` in app
- Max filter length: 4096 chars
- AST depth limit: 20 levels in CQL2 parser
- Verify `processEntities: false` in fast-xml-parser

### P0-5: Graceful Shutdown

SIGTERM/SIGINT handlers in `index.ts`. Call `server.close()`, drain existing
connections with 30s timeout, then `process.exit()`. Log shutdown sequence.

### P1-6: Config Validation (Zod)

Zod schema for `RegistryConfig` in `types.ts`. Replace existing interfaces with
zod-inferred types. Validate at load in `registry.ts`. Fail fast on invalid
config. Check that env vars referenced in strings actually exist.

### P1-7: Runtime Upstream Validation

Validate `items` is an array and `total` is a number in `adapter.ts`. Skip
malformed features with a warning log in `geojson-builder.ts`. Never crash on
bad upstream data.

### P1-8: Rate Limiting

`express-rate-limit` middleware in `app.ts`. Global limit configurable via env
vars (`RATE_LIMIT_WINDOW_MS`, `RATE_LIMIT_MAX`). Standard headers
(`X-RateLimit-*`) and 429 response.

### P1-9: Security Headers

`helmet` middleware in `app.ts`. Remove `X-Powered-By`. Sanitize error messages
in WFS router and items handler: never expose upstream URLs, stack traces, or
internal file paths to clients. Full details logged server-side only.

## Key Decisions

- No new source files. All changes in existing files.
- Zod schemas colocated in `types.ts`, replacing existing interfaces.
- Logger initialized once, imported everywhere.
- Error sanitization: client-facing errors are generic; full context in logs.
- New npm dependencies: `zod`, `helmet`, `express-rate-limit`

## Out of Scope

- CI/CD pipeline
- P2 items (cache, connection pooling, advanced health checks, integration
  tests, Docker multi-stage)
- Existing test modifications (unless types change)
