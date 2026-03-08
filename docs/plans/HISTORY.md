# Historique du Projet

## Phase 1 — Fondations (4 mars 2026)

**Design initial** du proxy OGC : exposer des APIs REST municipales heterogenes via OGC API Features (Part 1) et WFS 1.1.0.

- Stack : Node.js + Express + TypeScript, monorepo npm workspaces
- 3 collections mock : Points (bornes-fontaines), LineStrings (pistes-cyclables), Polygons (arrondissements)
- 3 strategies de pagination : offset-limit, page-pageSize, cursor
- Moteur generique : registry YAML, adapter upstream, GeoJSON builder
- WFS comme facade legere au-dessus du meme moteur OGC
- Tests de conformance Vitest + supertest
- JWT optionnel via `@villedemontreal/jwt-validator`

**Resultat :** Proxy fonctionnel valide avec QGIS et MapStore. 76 tests.

---

## Phase 2 — Filtres, spatial, plugins (5 mars 2026)

Extension du proxy avec filtrage avance et une source upstream reelle.

- **Systeme de plugins** : pipeline a 6 hooks async (transformRequest, transformUpstreamResponse, transformFeatures, transformFeature, transformResponse, skipGeojsonBuilder)
- **CQL2-text** : lexer, parser, evaluator avec operateurs de comparaison, LIKE, IN, BETWEEN, IS NULL, logiques (AND/OR/NOT)
- **Operateurs spatiaux** : S_INTERSECTS, S_WITHIN, S_DWITHIN, S_CONTAINS, S_CROSSES, S_TOUCHES, S_DISJOINT, S_EQUALS (via Turf.js)
- **WFS Filter Encoding** : conversion XML OGC Filter → AST CQL2
- **WFS 2.0** : GetCapabilities, DescribeFeatureType, GetFeature
- **Collection WFS upstream reelle** : MRC Quebec via Pavics/GeoServer
- **Tri** : sortby upstream + post-fetch

---

## Phase 3 — Conformite et qualite (7 mars 2026)

### Tests de conformite OGC

Suite exhaustive de tests d'integration couvrant :
- OGC API Features Core (landing, conformance, collections, items, feature, erreurs, HTTP/CORS)
- OGC API Features Filtering (queryables, CQL2-text, bbox, combinaisons)
- OGC API Features Sorting
- WFS 1.1.0 et 2.0.0 (capabilities, getFeature, filter encoding, spatial, pagination)
- Documentation de conformite par requirement

### Authentification JWT

Middleware JWT avec `@villedemontreal/jwt-validator` :
- Endpoints de decouverte (GetCapabilities, landing) publics
- Toutes les autres operations protegees
- Configurable via YAML (`security.jwt.enabled`)

### Extension des protocoles OGC

- CQL2 : IN, BETWEEN, IS NULL
- WFS 2.0 DescribeFeatureType
- WFS Filter Encoding / FES complet
- 4 operateurs spatiaux additionnels

### Production-readiness

- Logging structure JSON (`@villedemontreal/logger` + correlation-id)
- Timeouts upstream configurables (defaut 15s, AbortController)
- Limite post-fetch (`maxPostFetchItems`)
- Limites de taille de requete (100kb)
- Helmet + CORS configurable
- Rate limiting global (express-rate-limit)
- Endpoint /health et /ready
- Graceful shutdown

---

## Evaluation et recommandations v1 (7 mars 2026)

Premiere evaluation du codebase. 13 recommandations implementees :
- XML escaping dans WFS capabilities
- CORS configurable via `CORS_ORIGIN`
- Tests JWT
- README complet
- Extent spatial dans les collections
- Tests unitaires items.ts (16 tests)
- ESLint + Prettier
- Rate limiting per-upstream (token bucket)
- Endpoint /ready
- OpenAPI dynamique
- .env.example

---

## Evaluation et recommandations v2 (8 mars 2026)

Deuxieme evaluation. 11 recommandations implementees (CI/CD exclu) :
- Coverage reporting v8 (40% lines / 60% functions)
- Tests JWT avec mocks JWKS (7 tests)
- Tests unitaires filter-encoding.ts (45 tests)
- Pre-commit hooks (husky + lint-staged)
- Rate limit upstream configurable par collection via YAML
- Timeout global Express (60s)
- Refactoring capabilities.ts (extraction helper partage)
- Benchmark de performance (10k features < 1.5s)
- Documentation JWT dans le README
- Predicats temporels CQL2 (T_BEFORE, T_AFTER, T_DURING)
- Retrait des mentions "PoC"

**Etat final :** 182 tests unitaires, ~180 tests de conformance. 0 erreurs lint.
