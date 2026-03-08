# OGC Proxy Municipal (POC)

Proxy qui expose des APIs REST municipales sous forme de services OGC API Features (Part 1 & 3) et WFS 1.1.0/2.0.0.

## Architecture

Monorepo npm workspaces with 3 packages:

- `packages/proxy` -- Core proxy server (Express, TypeScript)
- `packages/mock-api` -- Mock upstream APIs for development
- `packages/conformance-tests` -- OGC conformance test suite

## Prerequisites

- Node.js 20+
- npm

## Setup

```
npm install
```

## Development

- `npm run dev:mock` -- Start mock upstream APIs (port 3001)
- `npm run dev:proxy` -- Start proxy server (port 3000)
- `npm run dev` -- Start both

## Testing

- `npm run test:unit` -- Unit tests (vitest)
- `npm run test:conformance` -- OGC conformance tests (requires mock-api + proxy running)
- `npm test` -- Both

## Environment Variables

| Variable | Description | Default |
|---|---|---|
| `PORT` | Proxy server port | `3000` |
| `UPSTREAM_HOST` | Base URL for upstream APIs | (required) |
| `BASE_URL` | Override public base URL | auto-detected |
| `JWT_HOST` | JWT validation host | (disabled) |
| `JWT_ENDPOINT` | JWT validation endpoint | -- |
| `CORS_ORIGIN` | Allowed CORS origins (comma-separated) | `*` (all) |
| `RATE_LIMIT_WINDOW_MS` | Rate limit window | `60000` |
| `RATE_LIMIT_MAX` | Max requests per window | `100` |
| `LOG_LEVEL` | Log level (info/debug) | `info` |

## Project Structure

```
ogc-proxy-poc/
├── packages/
│   ├── proxy/src/
│   │   ├── engine/     — Core: registry, adapter, geojson-builder, CQL2
│   │   ├── ogc/        — OGC API Features routes
│   │   ├── wfs/        — WFS routes
│   │   ├── plugins/    — Plugin system
│   │   └── auth/       — JWT middleware
│   ├── mock-api/       — Simulated upstream APIs
│   └── conformance-tests/ — OGC conformance suite
```

## Supported Standards

- OGC API Features Part 1 (Core)
- OGC API Features Part 3 (Filtering -- CQL2-text)
- WFS 1.1.0
- WFS 2.0.0
