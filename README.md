# OGC Proxy Municipal

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
| `REDIS_URL` | Redis connection URL (optional) | (disabled) |
| `REDIS_KEY_PREFIX` | Prefix for all Redis keys | `ogc:` |
| `CONFIG_PATH` | Path to collections.yaml | (internal default) |
| `PLUGINS_DIR` | Directory for custom plugins | (disabled) |

## Deploy with Docker (multi-org)

The proxy is published as a generic Docker image on `ghcr.io`. Any organization can deploy it by providing its own configuration — no code changes required.

**Quick start:**

1. Copy the `examples/` directory
2. Edit `collections.yaml` to map your upstream APIs
3. Configure `.env` with your settings
4. `docker compose up -d`

See [`examples/README.md`](examples/README.md) for the full guide.

For Kubernetes deployments, see [`docs/kubernetes/README.md`](docs/kubernetes/README.md).

**Updating:** `docker compose pull && docker compose up -d`

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

## Redis (horizontal scaling)

Redis est optionnel. Sans `REDIS_URL`, tout fonctionne en memoire (comportement par defaut). Avec Redis, les fonctionnalites suivantes deviennent distribuees entre instances.

### Rate limiting client

Les compteurs de requetes (`express-rate-limit`) sont partages via `rate-limit-redis`. Sans Redis, chaque instance a ses propres compteurs.

### Rate limiting upstream (token bucket distribue)

Le rate limiting vers les APIs upstream utilise un algorithme token bucket. Avec Redis, l'etat du bucket est partage entre instances via un script Lua atomique.

**Pourquoi Lua ?** Sans atomicite, deux instances concurrentes peuvent lire le meme nombre de tokens et accorder chacune un token alors qu'il n'en restait qu'un. Redis execute les scripts Lua sans interruption, eliminant les race conditions. Le script effectue le meme calcul (refill + consume) que la classe `TokenBucket` en memoire.

### Cache des reponses upstream

Le cache est configurable par collection dans `collections.yaml` :

```yaml
collections:
  bornes-fontaines:
    cache:
      ttlSeconds: 300
```

Les reponses upstream (listes et items individuels) sont cachees dans Redis avec le TTL specifie. Les collections sans configuration `cache` ne sont pas cachees.

### Invalidation du cache

Endpoint admin protege par JWT :

```
DELETE /admin/cache/:collectionId
```

Retourne `{ "collection": "...", "keysDeleted": N }`.

### Docker Compose

Le `docker-compose.yml` inclut un service `redis:7-alpine`. Pour le dev local :

```
docker compose up redis
```

## Project Structure

```
ogc-proxy-municipal/
├── packages/
│   ├── proxy/src/
│   │   ├── admin/     — Admin endpoints (cache invalidation)
│   │   ├── engine/    — Core: registry, adapter, cache, geojson-builder, CQL2
│   │   ├── ogc/       — OGC API Features routes
│   │   ├── wfs/       — WFS routes
│   │   ├── plugins/   — Plugin system
│   │   └── auth/      — JWT middleware
│   ├── mock-api/       — Simulated upstream APIs
│   └── conformance-tests/ — OGC conformance suite
```

## Supported Standards

- OGC API Features Part 1 (Core)
- OGC API Features Part 3 (Filtering -- CQL2-text)
- WFS 1.1.0
- WFS 2.0.0
