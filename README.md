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
