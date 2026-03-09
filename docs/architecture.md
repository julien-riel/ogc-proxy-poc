# Architecture

OGC API Features / WFS proxy for municipalities. Translates heterogeneous upstream APIs (REST, WFS) into a standards-compliant OGC API Features interface with optional WFS 1.1/2.0 compatibility endpoints.

## Request Flow

```mermaid
flowchart LR
    Client([Client])
    Express[Express]
    Security[Helmet / CORS / HTTPS Redirect]
    RL[Rate Limit]
    JWT[JWT Auth]
    OGC[OGC Router]
    WFS[WFS Router]
    Adapter[Adapter]
    CB[Circuit Breaker]
    Retry[Retry]
    Cache{Cache Check}
    Upstream[(Upstream API)]
    Store[Cache Store]
    Response([Response])

    Client --> Express --> Security --> RL --> JWT
    JWT --> OGC & WFS
    OGC --> Adapter
    WFS --> Adapter
    Adapter --> CB --> Retry --> Cache
    Cache -- hit --> Response
    Cache -- miss --> Upstream --> Store --> Response
```

## Component Diagram

```mermaid
flowchart TB
    subgraph Entry
        index[index.ts]
        app[app.ts]
        index --> app
    end

    subgraph Routers
        ogc[OGC Router<br/><small>landing, conformance,<br/>collections, items, queryables,<br/>openapi</small>]
        wfs[WFS Router<br/><small>capabilities, describe,<br/>get-feature</small>]
        admin[Admin Router<br/><small>cache management,<br/>status, dashboard</small>]
    end

    subgraph Middleware
        jwt[JWT Auth]
        corsm[CORS]
        helmetm[Helmet]
        rlm[Rate Limit]
        https[HTTPS Redirect]
        cacheHeaders[Cache Headers]
    end

    subgraph Engine
        adapter[Adapter]
        cache[Cache Service]
        registry[Registry]
        cb[Circuit Breaker]
        retry[Retry]
        health[Health Check]
        plugins[Plugin System]
        cql2[CQL2<br/><small>lexer, parser,<br/>evaluator, bbox</small>]
        geojson[GeoJSON Builder]
        limits[Limits]
        sorting[Sorting]
        upstreamRL[Upstream Rate Limit]
    end

    subgraph Observability
        metrics[Prometheus Metrics]
        logger[Structured Logger]
    end

    app --> Routers
    app --> Middleware
    ogc & wfs --> adapter
    adapter --> cache & cb & retry & upstreamRL
    adapter --> plugins
    ogc --> cql2 & geojson & limits & sorting
    registry --> plugins
    app --> metrics
    app --> health
```

## Deployment Diagram

```mermaid
flowchart TB
    Client([Clients])
    LB[Load Balancer<br/><small>nginx / cloud LB</small>]
    subgraph Proxy Instances
        P1[OGC Proxy 1]
        P2[OGC Proxy 2]
        Pn[OGC Proxy N]
    end
    Redis[(Redis<br/><small>shared cache +<br/>rate limiting</small>)]
    subgraph Upstreams
        API1[Municipal API A]
        API2[Municipal API B]
        WFS1[WFS Server]
    end
    subgraph Monitoring
        Prom[Prometheus]
        Grafana[Grafana]
    end

    Client --> LB --> P1 & P2 & Pn
    P1 & P2 & Pn --> Redis
    P1 & P2 & Pn --> API1 & API2 & WFS1
    P1 & P2 & Pn --> Prom --> Grafana
```

## Key Concepts

### Collection Configuration (YAML)

Collections are defined in a YAML file (`collections.yaml`) loaded by the registry at startup. Each collection declares its upstream source (URL, pagination strategy, response mapping), geometry type, property schema, and optional settings for caching, rate limiting, circuit breaking, and retry. Environment variables can be interpolated with `${VAR}` syntax. The configuration is validated at load time using Zod schemas.

### Plugin System

Plugins transform data at multiple points in the request lifecycle: incoming OGC request, outgoing upstream request, raw upstream response, individual features, and final OGC response. Plugins can be built-in (e.g., `wfs-upstream`), loaded from a `PLUGINS_DIR`, or referenced by file path. Each collection can specify a plugin by name in its YAML configuration.

### Caching

Responses are cached in Redis with a per-collection configurable TTL. Cache keys are derived from collection ID and hashed query parameters (offset, limit, bbox, upstream params). When Redis is unavailable, the proxy operates without caching -- there is no in-memory fallback. The admin router exposes endpoints for manual cache invalidation by collection or pattern.

### Rate Limiting

Two layers of rate limiting protect the system:

- **Client rate limit**: Express middleware using `express-rate-limit` with a Redis-backed store (shared across instances). Configurable window and max requests via environment variables.
- **Upstream rate limit**: Per-collection token bucket limiting requests to each upstream API. Configured per-collection in YAML (`rateLimit.capacity` and `rateLimit.refillRate`). Uses Redis for distributed state when available, falls back to in-memory buckets.
