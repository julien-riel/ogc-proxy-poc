# OGC Proxy POC

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

### Environment Variables

| Variable | Description | Default |
|---|---|---|
| `UPSTREAM_HOST` | Base URL of upstream APIs | `http://localhost:3001` |
| `PORT` | Proxy listen port | `3000` |
| `JWT_HOST` | JWKS host for JWT validation | _(empty — JWT disabled)_ |
| `JWT_ENDPOINT` | JWKS endpoint path | _(empty)_ |

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

## Authentication

JWT authentication is supported via [`@villedemontreal/jwt-validator`](https://github.com/VilledeMontreal/node-core-libs/tree/main/packages/node-jwt-validator). It is **disabled by default** and configured in `packages/proxy/src/config/collections.yaml`:

```yaml
security:
  jwt:
    enabled: true
    host: "https://auth.example.com"
    endpoint: "/oauth/jwks"
```

Or via environment variables (`JWT_HOST`, `JWT_ENDPOINT`).

When enabled:
- **Protected endpoints:** `/ogc/collections/*`, `/wfs` (DescribeFeatureType, GetFeature)
- **Open endpoints:** `/health`, `/ogc/` (landing), `/ogc/api`, `/ogc/conformance`, WFS GetCapabilities

## Project Structure

```
packages/
  proxy/          # OGC proxy server (core)
    src/
      auth/       # JWT authentication middleware
      config/     # YAML collection registry
      engine/     # Mapping engine (adapter, CQL2, pagination, etc.)
      ogc/        # OGC API Features routes
      wfs/        # WFS facade routes
      plugins/    # Upstream plugins (e.g. WFS upstream)
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
- [JWT Auth Design](docs/plans/2026-03-07-jwt-authentication-design.md)
