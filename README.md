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

## Authentication (JWT)

Le proxy supporte la validation de tokens JWT via `@villedemontreal/jwt-validator`.

### Configuration

Dans `packages/proxy/src/config/collections.yaml` :

```yaml
security:
  jwt:
    enabled: true
    host: "${JWT_HOST}"
    endpoint: "${JWT_ENDPOINT}"
```

### Variables d'environnement

| Variable | Description |
|---|---|
| `JWT_HOST` | URL du serveur JWKS (ex: `https://auth.montreal.ca`) |
| `JWT_ENDPOINT` | Chemin de l'endpoint JWKS (optionnel) |

### Comportement

- **Desactive (defaut)** : Toutes les requetes passent sans verification.
- **Active** : Les requetes aux endpoints proteges doivent inclure un header `Authorization: Bearer <token>` valide.
  - `GetCapabilities` (WFS) et la page d'accueil (OGC API) restent publics.
  - Toutes les autres operations requierent un JWT valide.
- Un token invalide ou expire retourne `401 Unauthorized`.

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
