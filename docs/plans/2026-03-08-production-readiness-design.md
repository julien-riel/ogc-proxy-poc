# Design : Production Readiness OGC Proxy

**Date** : 2026-03-08
**Objectif** : Rendre le proxy OGC production-ready pour usage municipal

---

## Section 1 — Résilience

### Circuit Breaker (maison, dans `engine/adapter.ts`)
- 3 états : `closed` → `open` → `half-open`
- Configurable par collection : `circuitBreaker: { failureThreshold: 5, resetTimeout: 30000, halfOpenRequests: 1 }`
- Quand ouvert : erreur 503 immédiate avec header `Retry-After`
- Métriques : `ogc_proxy_circuit_breaker_state`, `ogc_proxy_circuit_breaker_transitions_total`

### Retry (dans l'adapter, avant le circuit breaker)
- Retry uniquement sur erreurs transitoires (5xx, timeout, ECONNRESET)
- Config par collection : `retry: { maxAttempts: 3, backoffMs: 200, backoffMultiplier: 2 }`
- Pas de retry sur 4xx

### Health Checks upstream (`engine/health-check.ts`)
- Ping périodique configurable (défaut : 30s)
- Expose le status via `/health` enrichi
- Collections avec upstream down marquées `degraded` dans `/ready`

---

## Section 2 — Tests

### Tests unitaires OGC/WFS (objectif 70%+)
- `ogc/items.test.ts` : enrichir (filtrage CQL2, pagination, bbox, erreurs, timeout)
- `ogc/collections.test.ts` : nouveau (listing, single, inexistante)
- `ogc/landing.test.ts` : nouveau (réponse de conformité)
- `wfs/router.test.ts` : nouveau (GetCapabilities, DescribeFeatureType, GetFeature, versions 1.1/2.0)
- `wfs/describe.test.ts` : nouveau (génération schema XSD)
- Approche : supertest + registry mocké

### Tests de charge (k6)
- Dossier `packages/load-tests/`
- Scénarios : smoke (1 VU), load (50 VU), stress (200 VU), spike
- Endpoints : `/ogc/collections/{id}/items`, `/ogc/collections`, `/wfs`
- Seuils : p95 < 500ms, erreurs < 1%
- Export JSON pour Grafana

---

## Section 3 — Cache & Headers HTTP

### Invalidation de cache intelligente
- Invalidation par pattern : `DELETE /admin/cache?pattern=collections-*`
- Mode `stale-while-revalidate` : sert le cache expiré pendant re-fetch en arrière-plan
- Event emitter pour métriques hits/miss/stale

### Headers HTTP Cache-Control
- `Cache-Control: public, max-age={ttl}, stale-while-revalidate={ttl/2}`
- `ETag` via hash MD5 du contenu
- Support `If-None-Match` → 304 Not Modified
- Configurable : `cacheHeaders: { enabled: true }` (défaut: activé)

---

## Section 4 — Monitoring & Alerting

### Métriques Prometheus enrichies
- `ogc_proxy_upstream_health_status` (gauge)
- `ogc_proxy_circuit_breaker_state` (gauge)
- `ogc_proxy_cache_hits_total`, `cache_misses_total`, `cache_stale_total` (counters)
- `ogc_proxy_retry_attempts_total` (counter)
- `ogc_proxy_response_size_bytes` (histogram)

### Règles d'alerting (`deploy/prometheus/alerts.yml`)
- `ProxyUpstreamDown` — upstream fail > 2 min → warning
- `ProxyHighErrorRate` — 5xx > 5% sur 5 min → critical
- `ProxyHighLatency` — p95 > 2s sur 5 min → warning
- `ProxyCircuitBreakerOpen` — ouvert > 5 min → critical
- `ProxyCacheHitRateLow` — hit < 50% sur 15 min → warning
- `ProxyRateLimitExceeded` — > 100/min → warning

### Dashboard Grafana (`deploy/grafana/dashboard.json`)
- Vue d'ensemble : req/s, latence p50/p95/p99, taux d'erreur
- Upstream : santé, circuit breakers, retry
- Cache : hit ratio, évictions, stale
- Rate Limiting : requêtes limitées par client

---

## Section 5 — Dashboard admin & Sécurité

### Dashboard admin intégré (`/admin/dashboard`)
- Page HTML unique, CSS inline, zéro dépendance frontend
- Données via `/admin/status` (nouveau : agrège santé, circuit breakers, cache)
- Auto-refresh 10s via fetch() vanilla
- Même auth que routes admin existantes

### HTTPS enforcement
- Middleware optionnel (`ENFORCE_HTTPS=true`)
- Redirige HTTP → HTTPS via check `X-Forwarded-Proto`

### Audit sécurité CI
- `npm audit --audit-level=high` dans GitHub Actions
- Fail build sur vulnérabilité high/critical

---

## Section 6 — Documentation

### Runbooks (`docs/runbooks.md`)
- Upstream ne répond plus
- Latence élevée
- Erreurs 5xx en hausse
- Cache invalidation d'urgence
- Mise à jour / rollback

### Architecture (`docs/architecture.md`)
- Diagramme Mermaid : flux requête → proxy → upstream
- Composants internes (router, adapter, cache, circuit breaker, plugins)
- Déploiement (Docker/K8s avec Redis, Prometheus, Grafana)

### Guide plugins (`docs/plugin-development.md`)
- Cycle de vie des hooks
- Exemple complet
- API de référence TypeScript
- Bonnes pratiques

### OpenAPI amélioré
- Enrichir `/ogc/api` avec nouveaux endpoints
- Exemples de réponses dans le schéma
