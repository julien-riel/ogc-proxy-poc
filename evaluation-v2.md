# Evaluation du Codebase -- OGC Proxy Municipal

**Date :** 8 mars 2026
**Branche analysee :** `main` (post-merge PR #3)
**Methode :** Analyse exhaustive de tous les fichiers source, tests, configuration et dependances.

---

## 1. Resume Executif

Le projet est un proxy OGC qui expose des APIs REST municipales heterogenes sous forme de services OGC API Features (Part 1 & 3) et WFS 1.1.0/2.0.0. Le code est structure en monorepo TypeScript avec 3 packages : `proxy` (coeur), `mock-api` (simulation upstream), et `conformance-tests` (tests d'integration).

**Verdict global :** Le codebase est de tres bonne qualite, bien au-dela d'un simple projet. L'architecture est claire et extensible, la couverture de tests est complete (301 tests, ratio test/code 0.66:1), et les mesures de securite sont solides. Les recommandations de la v1 de l'evaluation ont ete implementees. Quelques axes d'amelioration restent pour la mise en production.

**Metriques cles :**

| Metrique | Valeur |
|---|---|
| Lignes de code source | 3 126 |
| Lignes de tests | 3 072 |
| Fichiers source (hors tests) | 22 |
| Fichiers test | 39 (15 unitaires + 24 conformance) |
| Tests unitaires | 119 |
| Tests de conformance | 182 |
| Total tests | 301 |
| Dependances directes (proxy) | 13 |
| Dependances dev | 7 |

---

## 2. Vue Fonctionnelle

### 2.1 Conformite OGC API Features

| Exigence | Endpoint | Statut | Commentaire |
|---|---|---|---|
| Landing Page | `GET /ogc/` | Complet | Liens self, service-desc, conformance, data |
| Conformance | `GET /ogc/conformance` | Complet | Core, GeoJSON, OAS30, Filter, Features-Filter |
| Liste collections | `GET /ogc/collections` | Complet | Titre, description, CRS, extent spatial, liens |
| Detail collection | `GET /ogc/collections/{id}` | Complet | Meme structure que liste, avec extent |
| Queryables (Part 3) | `GET /ogc/collections/{id}/queryables` | Complet | JSON Schema 2020-12, x-ogc-sortable |
| Items + pagination | `GET /ogc/collections/{id}/items` | Complet | offset/limit, next/prev links, numberMatched/Returned |
| Item unique | `GET /ogc/collections/{id}/items/{fid}` | Complet | Liens self/collection |
| OpenAPI | `GET /ogc/api` | Complet | Spec generee dynamiquement depuis le registry |
| CQL2-text | `?filter=...&filter-lang=cql2-text` | Complet | Comparaisons, LIKE, IN, BETWEEN, IS NULL, spatiaux |
| Bbox | `?bbox=minLon,minLat,maxLon,maxLat` | Complet | Filtrage client-side + extraction depuis CQL2 |

### 2.2 Conformite WFS

| Operation | WFS 1.1.0 | WFS 2.0.0 | Commentaire |
|---|---|---|---|
| GetCapabilities | Complet | Complet | XML avec escaping, negotiation de version |
| DescribeFeatureType | Complet | Complet | Schema JSON (pas GML XSD) |
| GetFeature (GET) | Complet | Complet | Pagination, CRS, filtres, hits |
| GetFeature (POST) | Complet | Complet | XML body parsing, Filter Encoding |
| Filter Encoding | Complet | Complet | 9 comparaisons + 8 spatiaux + logiques |
| CRS/SRS | Complet | Complet | CRS84 + EPSG:3857 avec reprojection |

### 2.3 Fonctionnalites avancees (au-dela du PRD)

- **CQL2-text complet** : Lexer -> Parser -> Evaluateur -> BBox Extractor (494 lignes). Support de 8 operateurs spatiaux (S_INTERSECTS, S_WITHIN, S_DWITHIN, S_CONTAINS, S_CROSSES, S_TOUCHES, S_DISJOINT, S_EQUALS).
- **Filter Encoding XML** : Conversion complete OGC Filter XML -> AST CQL2 interne (226 lignes).
- **Reprojection EPSG:3857** : Formule Web Mercator dans WFS GetFeature.
- **Systeme de plugins** : 6 hooks (transformRequest, transformUpstreamResponse, transformFeatures, transformFeature, transformResponse, skipGeojsonBuilder).
- **Extraction bbox depuis CQL2** : Optimisation qui extrait les bbox des predicats spatiaux pour les passer upstream.
- **Post-fetch filtering** : Multiplicateur x10 (cap maxPostFetchItems=5000) quand un filtre post-fetch est necessaire.
- **Per-upstream rate limiting** : Token bucket par collection (capacity=50, refill=50/sec).

### 2.4 Fonctionnalites manquantes

| Fonctionnalite | Impact | Effort |
|---|---|---|
| Predicats temporels CQL2 (BEFORE, AFTER, DURING) | Moyen | Moyen |
| GML XSD dans DescribeFeatureType | Faible (JSON suffit pour QGIS) | Eleve |
| Content negotiation (Accept header) | Faible | Faible |
| CRS dynamique depuis config | Faible | Moyen |
| Cache ETag | Moyen | Moyen |
| Transactions WFS (Insert/Update/Delete) | N/A (proxy read-only) | N/A |

---

## 3. Vue Architecture

### 3.1 Structure du projet

```
ogc-proxy-poc/
├── packages/
│   ├── proxy/src/                 (~3 126 lignes source)
│   │   ├── engine/                — Coeur metier
│   │   │   ├── types.ts           — Schemas Zod + types inferes (115 lignes)
│   │   │   ├── registry.ts        — Chargement YAML, cache singleton (62 lignes)
│   │   │   ├── adapter.ts         — Fetch upstream, 4 strategies pagination (251 lignes)
│   │   │   ├── geojson-builder.ts — JSON -> GeoJSON, WKT parser (141 lignes)
│   │   │   ├── plugin.ts          — Systeme de plugins, 6 hooks (87 lignes)
│   │   │   ├── limits.ts          — Controle pagination 3 niveaux (45 lignes)
│   │   │   ├── sorting.ts         — Tri upstream (50 lignes)
│   │   │   ├── upstream-rate-limit.ts — Token bucket par collection (47 lignes)
│   │   │   └── cql2/              — Pipeline CQL2 complet (494 lignes)
│   │   │       ├── lexer.ts       — Tokenisation (94 lignes)
│   │   │       ├── parser.ts      — Recursive descent, MAX_DEPTH=20 (252 lignes)
│   │   │       ├── evaluator.ts   — Evaluation feature-by-feature (127 lignes)
│   │   │       ├── bbox-extractor.ts — Optimisation spatiale (41 lignes)
│   │   │       └── types.ts       — AST nodes (index.ts barrel export)
│   │   ├── ogc/                   — OGC API Features (~650 lignes)
│   │   │   ├── router.ts          — Routes + JWT guard (28 lignes)
│   │   │   ├── landing.ts         — Discovery (16 lignes)
│   │   │   ├── conformance.ts     — Conformance classes (13 lignes)
│   │   │   ├── collections.ts     — Collections + extent (52 lignes)
│   │   │   ├── items.ts           — Orchestrateur principal (435 lignes)
│   │   │   ├── queryables.ts      — JSON Schema generation (53 lignes)
│   │   │   └── openapi.ts         — OpenAPI spec dynamique (59 lignes)
│   │   ├── wfs/                   — WFS 1.1.0 + 2.0.0 (~620 lignes)
│   │   │   ├── router.ts          — GET/POST dispatch (102 lignes)
│   │   │   ├── capabilities.ts    — XML generation dual version (269 lignes)
│   │   │   ├── describe.ts        — DescribeFeatureType (50 lignes)
│   │   │   ├── get-feature.ts     — GetFeature + SRS reprojection (202 lignes)
│   │   │   └── filter-encoding.ts — OGC Filter XML -> CQL2 AST (226 lignes)
│   │   ├── plugins/wfs-upstream.ts — Plugin WFS built-in (58 lignes)
│   │   ├── auth/jwt.ts            — Middleware JWT configurable (31 lignes)
│   │   ├── utils/                 — Base URL, XML escaping (20 lignes)
│   │   ├── app.ts                 — Express factory, middleware (65 lignes)
│   │   ├── index.ts               — Entry point, graceful shutdown (31 lignes)
│   │   └── logger.ts              — Logging structure, correlation ID (38 lignes)
│   ├── mock-api/                  (~260 lignes)
│   └── conformance-tests/         (~1 880 lignes tests)
```

### 3.2 Points forts architecturaux

1. **Separation nette des couches** : `engine/` (coeur pur) / `ogc/` (couche HTTP OGC) / `wfs/` (couche HTTP WFS). Les deux protocoles partagent le meme engine.

2. **Zero dependances circulaires** : Le graphe d'imports est strictement acyclique. Les modules engine n'importent jamais des modules HTTP.

3. **Discriminated Union pour la pagination** : Zod discriminated union (`offset-limit | page-pageSize | cursor`) garantit au niveau type qu'une seule strategie est configuree par collection.

4. **Pipeline CQL2 complet** : Lexer -> Parser -> AST -> Evaluateur + BBox Extractor. Architecture classique de compilateur, bien structuree avec barrel export.

5. **Plugin system avec late binding** : Chargement dynamique ESM (`import()`) evite le couplage fort. 6 hooks couvrent tout le pipeline de requete.

6. **Representation unifiee des filtres** : OGC Filter XML et CQL2-text convergent vers le meme AST CQL2 interne. Un seul evaluateur pour les deux protocoles.

7. **Configuration declarative validee** : YAML + substitution env vars + validation Zod au demarrage. Configuration invalide = boot refuse.

### 3.3 Points de vigilance architecturaux

1. **`items.ts` (435 lignes)** : Fichier le plus gros, concentre l'orchestration complete. Deja partiellement decoupe (parseItemsRequest, applyPostFilters, buildUpstreamFilters extraits comme fonctions pures), mais pourrait beneficier d'un pattern pipeline plus formel.

2. **`capabilities.ts` (269 lignes)** : XML construit par template strings. Duplication entre les versions 1.1.0 et 2.0.0 (~120 lignes communes). Un template engine ou builder XML reduirait la duplication.

3. **Singleton registry** : Module-level `let registry` avec lazy loading. Fonctionnel mais empeche la multi-instance et complique le testing (necessite reset entre tests).

4. **Token bucket en memoire** : `Map<string, TokenBucket>` sans invalidation ni TTL. Les buckets persistent indefiniment. Acceptable pour un nombre fixe de collections, mais leak potentiel si collections dynamiques.

5. **Plugin cache sans invalidation** : `pluginCache` dans `registry.ts` est un `Map` sans mecanisme de clear. Hot-reload du registry ne recharge pas les plugins.

6. **Post-fetch filtering non-optimal** : Multiplicateur fixe x10 avec cap a maxPostFetchItems. Un filtre tres selectif fetch 10x plus que necessaire. Pas d'analyse de cout des filtres.

### 3.4 Dependances

| Dependance | Version | Usage | Evaluation |
|---|---|---|---|
| Express 4 | ^4.21.0 | HTTP framework | Mature, bon choix |
| Zod 4 | ^4.3.6 | Validation schema | Excellent pour config |
| Turf.js | ^7.3.4 (10 modules) | Operations spatiales | Standard GIS |
| fast-xml-parser | ^4.5.0 | Parsing XML WFS | Performant, XXE-safe |
| helmet | ^8.1.0 | Headers securite HTTP | Standard |
| express-rate-limit | ^8.3.0 | Rate limiting global | In-memory, suffisant pour le moment |
| yaml | ^2.6.0 | Parsing YAML | Standard |
| cors | ^2.8.5 | CORS handling | Stable |
| @villedemontreal/* | 3 packages | Logger, JWT, Correlation ID | Enterprise, coherent |

**13 dependances directes** (lean). Pas de dependance inutile.

---

## 4. Vue Tests

### 4.1 Strategie de test

Le projet utilise une **double strategie** exemplaire :

1. **Tests unitaires** (119 tests, 15 fichiers) : Tests du engine et des helpers avec mocks vitest.
2. **Tests de conformance** (182 tests, 24 fichiers) : Tests d'integration end-to-end avec mock-api + proxy reel.

**Ratio test/code :** 3 072 LOC tests / 3 126 LOC source = **0.98:1**. Remarquable pour ce projet.

### 4.2 Tests unitaires — Detail

| Module | Fichier test | Tests | Qualite |
|---|---|---|---|
| adapter.ts | adapter.test.ts | 10 | 3 strategies pagination, erreurs, timeout, validation, rate limit |
| geojson-builder.ts | geojson-builder.test.ts | 8 | Point/LineString/Polygon, pagination links, property filtering |
| limits.ts | limits.test.ts | 7 | Cap, reject, suppressNext, boundaries |
| sorting.ts | sorting.test.ts | 8 | Parse, validation, upstream sort building |
| plugin.ts | plugin.test.ts | 6 | Load, hook execution, null handling |
| registry.ts | registry.test.ts | 11 | YAML loading, env vars, Zod validation, substitution |
| upstream-rate-limit.ts | upstream-rate-limit.test.ts | 3 | Token bucket, refill (fake timers) |
| cql2/lexer.ts | lexer.test.ts | 9 | Tous les types de tokens, operateurs, nombres negatifs |
| cql2/parser.ts | parser.test.ts | 12 | Tous les operateurs, depth limit, nesting |
| cql2/evaluator.ts | evaluator.test.ts | 12 | Comparaisons, logiques, spatiaux, LIKE patterns |
| cql2/bbox-extractor.ts | bbox-extractor.test.ts | 5 | Polygon bbox, S_DWITHIN buffer, AND combinations |
| auth/jwt.ts | jwt.test.ts | 3 | Disabled, enabled states, config validation |
| wfs-upstream.ts | wfs-upstream.test.ts | 4 | URL building avec params |
| utils/xml.ts | xml.test.ts | 5 | 5 chars XML, entities, passthrough |
| ogc/items.ts | items.test.ts | 16 | parseBbox, isInBbox, buildUpstreamFilters, applyPostFilters |

### 4.3 Tests de conformance — Detail

| Domaine | Fichiers | Tests | Couverture |
|---|---|---|---|
| OGC Core (landing, conformance, collections, items, http, errors) | 6 | 63 | Complet |
| OGC Filtering (queryables, query-params, bbox, CQL2 basic/advanced/spatial, filter-lang) | 7 | 44 | Complet |
| OGC Sorting | 1 | 5 | Complet |
| OGC WFS upstream | 1 | 5 | Basique (PAVICS) |
| WFS 1.1.0 (capabilities, describe, get-feature, filter-encoding) | 4 | 39 | Complet |
| WFS 2.0.0 (capabilities, describe, get-feature, filter-encoding, version-negotiation) | 5 | 26 | Complet |

### 4.4 Points forts des tests

- **Conformite OGC rigoureuse** : Verifient structure GeoJSON, content-types, links, codes HTTP, pagination, filtres.
- **Tests CQL2 exhaustifs** : Couvrent tous les operateurs de comparaison, logiques et spatiaux.
- **Global setup automatique** : Les tests de conformance demarrent automatiquement mock-api et proxy.
- **Fake timers** pour le rate limiter : Tests deterministes du token bucket.
- **Assertions significatives** : Pas de tests triviaux — chaque assertion verifie un comportement metier.
- **Mocking propre** : `vi.fn()`, `vi.stubGlobal()`, `mockResolvedValue()` avec bon TypeScript.

### 4.5 Lacunes des tests

| Lacune | LOC non testees | Impact | Priorite |
|---|---|---|---|
| `wfs/capabilities.ts` — XML generation | 269 | Moyen (couvert par conformance) | P2 |
| `wfs/filter-encoding.ts` — OGC Filter -> CQL2 | 226 | Eleve (logique complexe) | P1 |
| `wfs/get-feature.ts` — orchestration WFS | 202 | Moyen (couvert par conformance) | P2 |
| `ogc/openapi.ts` — spec OpenAPI | 59 | Faible | P3 |
| `app.ts` — middleware chain, /health, /ready | 65 | Moyen | P2 |
| Pas de coverage reporting | - | Moyen | P1 |
| Pas de tests de performance | - | Moyen | P3 |
| `isInBbox` ne teste que Point (pas LineString/Polygon) | - | Faible | P3 |
| `applyPostFilters` — parametre postFetchSimpleAst jamais teste non-null | - | Faible | P3 |

---

## 5. Vue Securite

### 5.1 Points positifs

| Mesure | Implementation | Evaluation |
|---|---|---|
| **Helmet** | Headers HTTP securise (CSP, X-Frame-Options, etc.) | Excellent |
| **CORS configurable** | `CORS_ORIGIN` env var, multi-origin, defaut permissif | Bon |
| **Rate limiting global** | express-rate-limit, configurable via env vars | Bon |
| **Rate limiting upstream** | Token bucket par collection (50 req/sec) | Bon |
| **JWT** | Middleware configurable, discovery endpoints publics | Bon |
| **XXE prevention** | `processEntities: false` dans fast-xml-parser | Excellent |
| **XML injection** | `escapeXml()` sur tous les contenus dynamiques WFS | Excellent |
| **Validation Zod** | Schemas stricts, URLs validees, nombres positifs | Excellent |
| **Filter limits** | MAX_FILTER_LENGTH=4096, MAX_DEPTH=20 | Excellent |
| **Body limits** | JSON 100kb, XML 100kb | Bon |
| **URL redaction** | Query params supprimes des logs upstream | Bon |
| **Property filtering** | Seuls les champs declares sont exposes | Excellent |
| **Env var substitution** | Regex `\$\{(\w+)\}` — alphanumerique uniquement | Bon |
| **Erreurs generiques** | Upstream details non exposes au client | Excellent |
| **Graceful shutdown** | SIGTERM/SIGINT avec timeout 30s | Excellent |

### 5.2 Points de vigilance

| Risque | Severite | Detail |
|---|---|---|
| **CORS ouvert par defaut** | Moyenne | `cors()` sans config = tous les origins. Acceptable en dev, a restreindre via `CORS_ORIGIN` en prod. |
| **Rate limit in-memory** | Moyenne | Ne fonctionne pas en cluster. Necessitera Redis en production multi-instance. |
| **Token bucket non-configurable** | Faible | Capacity/refillRate hardcodes a 50. Pas de config YAML par collection. |
| **Query params dans les logs** | Faible | Le middleware de logging inclut `req.query` — pourrait logguer des filtres contenant des donnees sensibles. |
| **JWT non teste en mode actif** | Moyenne | Seul le mode desactive est teste unitairement. Le mode actif depend de `@villedemontreal/jwt-validator`. |
| **`redactUrl` fallback** | Faible | Le catch retourne l'URL brute si `new URL()` echoue. Pourrait logguer des query params. |
| **Pas de timeout global Express** | Moyenne | Seuls les appels upstream ont un timeout. Un CQL2 spatial complexe pourrait bloquer le thread. |

---

## 6. Vue Developpeur (DX)

### 6.1 Points forts

| Aspect | Detail | Evaluation |
|---|---|---|
| **Monorepo npm workspaces** | Simple, pas besoin de Turborepo pour cette taille | Excellent |
| **Scripts coherents** | dev:mock, dev:proxy, test:unit, test:conformance, lint, format | Excellent |
| **Hot-reload** | `tsx watch` pour le dev | Bon |
| **TypeScript strict** | `strict: true`, `target: ES2022`, `module: Node16` | Excellent |
| **ESM natif** | `"type": "module"` avec Node16 resolution | Moderne |
| **ESLint + Prettier** | Config flat ESM, typescript-eslint, prettier compat | Bon |
| **README** | Architecture, setup, env vars, commandes, standards | Bon |
| **`.env.example`** | Toutes les variables documentees | Bon |
| **Vitest** | Rapide, compatible ESM, watch mode | Excellent |

### 6.2 Points d'amelioration

| Aspect | Detail | Priorite |
|---|---|---|
| **Pas de pre-commit hooks** | Pas de husky/lint-staged | P2 |
| **Pas de coverage reporting** | vitest.config.ts sans coverage | P1 |
| **Pas de CI/CD** | Aucun workflow GitHub Actions | P1 |
| **README minimaliste** | Pas de section securite, troubleshooting, contribution | P3 |
| **Pas de guide JWT** | Configuration JWT non documentee | P2 |
| **OpenAPI non publie** | Spec generee mais pas documentee/accessible | P3 |

---

## 7. Vue Qualite & Maintenabilite

### 7.1 Qualite du code

| Critere | Evaluation | Detail |
|---|---|---|
| **Nommage** | Excellent | Fichiers, fonctions, variables explicites et coherents |
| **Taille des fonctions** | Bon | Majorite < 50 lignes, sauf `getItems` (~110 lignes) |
| **Code mort** | Aucun | Pas de fonctions inutilisees |
| **Types stricts** | Excellent | TypeScript strict + Zod runtime validation |
| **Barrel exports** | Bon | CQL2 module avec index.ts |
| **Error types custom** | Bon | UpstreamError, UpstreamTimeoutError avec contexte |
| **Logging structure** | Excellent | Loggers nommes par domaine, correlation IDs |
| **Consistance de style** | Bon | 2 espaces, single quotes, trailing commas (Prettier) |
| **JSDoc** | Partiel | Present sur les fonctions cles, absent sur les helpers |

### 7.2 Complexite par fichier

| Fichier | Lignes | Complexite | Risque |
|---|---|---|---|
| `ogc/items.ts` | 435 | Elevee | Pipeline complet, multiple concerns |
| `wfs/capabilities.ts` | 269 | Moyenne | Duplication XML 1.1/2.0 |
| `cql2/parser.ts` | 252 | Moyenne | Recursive descent, bien structure |
| `engine/adapter.ts` | 251 | Moyenne | 4 strategies pagination |
| `wfs/filter-encoding.ts` | 226 | Moyenne | Mapping XML -> AST |
| `wfs/get-feature.ts` | 202 | Moyenne | Orchestration + reprojection |
| Tous les autres | < 150 | Faible | Single-responsibility |

### 7.3 Dette technique identifiee

| Dette | Severite | Effort |
|---|---|---|
| Duplication XML capabilities 1.1.0/2.0.0 | Faible | 2-4h (refactor template) |
| `evaluateFilter` avec loose equality (`==`) | Faible | 1h (documenter ou passer a `===` + coercion explicite) |
| Reprojection manuelle `lonLatTo3857` | Faible | 2h (remplacer par proj4) |
| Pas de type pour les reponses OGC | Faible | 2h (ajouter types pour FeatureCollection response) |
| `getUpstreamBucket` ignore les params differents sur appels suivants | Tres faible | 1h |

---

## 8. Recommandations Prioritaires

### P0 — Critiques (avant production)

1. **Configurer un pipeline CI/CD** : GitHub Actions avec lint, tests unitaires, tests de conformance. Bloquer les merges si les tests echouent.

2. **Activer le coverage reporting** : Ajouter `coverage: { provider: 'v8', lines: 60, functions: 60 }` dans vitest.config.ts.

3. **Restreindre CORS en production** : S'assurer que `CORS_ORIGIN` est configure dans les deployments prod.

4. **Tester le JWT en mode actif** : Tests d'integration avec un JWT mock ou un serveur JWKS local.

### P1 — Importantes (qualite)

5. **Ajouter des tests unitaires pour `wfs/filter-encoding.ts`** (226 lignes de logique complexe sans tests unitaires).

6. **Configurer pre-commit hooks** (husky + lint-staged) pour garantir le lint/format avant commit.

7. **Rendre le rate limit upstream configurable** via YAML (capacity/refillRate par collection).

8. **Ajouter un timeout global Express** pour prevenir les requetes qui bloquent le thread.

### P2 — Souhaitables (ameliorations)

9. **Refactorer `capabilities.ts`** pour reduire la duplication XML entre WFS 1.1.0 et 2.0.0.

10. **Ajouter des tests de performance** : Benchmark pour valider le target < 1.5s pour 10 000 features.

11. **Documenter le setup JWT** dans le README.

12. **Ajouter des predicats temporels CQL2** (BEFORE, AFTER, DURING) pour le support date/heure.

---

## 9. Conclusion

Ce projet est remarquablement bien execute. Depuis la premiere evaluation, les 13 recommandations ont ete implementees, ajoutant :

- XML escaping securise
- CORS configurable
- Tests JWT
- README complet
- Extent spatial dans les collections
- 16 tests unitaires supplementaires pour items.ts
- ESLint + Prettier
- Rate limiting per-upstream
- Endpoint /ready
- OpenAPI dynamique
- .env.example

L'architecture est claire et extensible, les choix techniques sont solides (Zod, Turf.js, fast-xml-parser), et la couverture de tests (301 tests) est exemplaire. La dette technique est faible et bien contenue. Les principaux axes d'amelioration concernent l'outillage CI/CD, le coverage reporting, et quelques lacunes de tests unitaires sur les modules WFS.

**Le codebase est en excellent etat pour passer en phase de production-readiness.**
