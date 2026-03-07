# Design: Tests de conformité OGC

**Date:** 2026-03-07
**Statut:** Approuvé

## Objectif

Améliorer les tests de conformité du proxy OGC pour couvrir :
- OGC API Features (Core, Filtering/CQL2, Sorting)
- WFS 1.1.0
- WFS 2.0 (support partiel)

Produire une documentation qui explique précisément quels requirements des specs sont couverts, avec quel test.

## Structure des tests

```
packages/conformance-tests/src/
├── ogc-api-features/
│   ├── core/
│   │   ├── landing.test.ts          # Landing page, required links, self/alternate
│   │   ├── conformance.test.ts      # Conformance endpoint, conformsTo array
│   │   ├── collections.test.ts      # Collection listing, single collection, extent, CRS, links
│   │   ├── items.test.ts            # FeatureCollection structure, pagination, numberReturned/Matched,
│   │   │                            # timeStamp, content-type, prev/next links
│   │   ├── feature.test.ts          # Single feature retrieval by ID
│   │   ├── error-handling.test.ts   # 400 unknown params, 404 missing resources
│   │   └── http.test.ts             # CORS headers, content negotiation
│   ├── filtering/
│   │   ├── queryables.test.ts       # Queryables endpoint, JSON Schema, link relation
│   │   ├── query-params.test.ts     # Simple property filters, combined filters
│   │   ├── cql2-basic.test.ts       # =, !=, <, >, <=, >=, AND, OR, NOT
│   │   ├── cql2-advanced.test.ts    # LIKE, IN, BETWEEN
│   │   ├── cql2-spatial.test.ts     # S_INTERSECTS, S_WITHIN, S_OVERLAPS, S_DWITHIN
│   │   ├── filter-lang.test.ts      # filter-lang parameter, invalid filter rejection
│   │   └── bbox.test.ts             # bbox parameter filtering
│   └── sorting/
│       └── sortby.test.ts           # sortby ascending/descending, invalid field rejection
├── wfs/
│   ├── wfs11/
│   │   ├── capabilities.test.ts     # GetCapabilities XML 1.1.0, FeatureTypeList, bbox, namespaces
│   │   ├── describe.test.ts         # DescribeFeatureType, JSON schema
│   │   └── get-feature.test.ts      # GET/POST, maxFeatures, startIndex, resultType=hits,
│   │                                # geometry types, CRS reprojection (EPSG:3857)
│   └── wfs20/
│       ├── capabilities.test.ts     # GetCapabilities version=2.0.0
│       ├── get-feature.test.ts      # count (vs maxFeatures), startIndex, numberMatched/Returned
│       └── version-negotiation.test.ts  # Version parameter handling, fallback
├── helpers.ts
├── global-setup.ts
└── vitest.config.ts
```

## Documentation de conformité

```
docs/conformance/
├── README.md              # Résumé exécutif, % couverture par spec
├── ogc-api-features.md    # Core + Filtering + Sorting requirements
└── wfs.md                 # WFS 1.1.0 + WFS 2.0 requirements
```

Chaque document contient des tableaux par conformance class :
- Requirement ID + description
- Statut : Supporté / Partiel / Non supporté / Hors scope
- Test(s) qui démontrent la conformité

## Specs OGC couvertes

### OGC API Features — Core (Part 1)

**Conformance class:** `http://www.opengis.net/spec/ogcapi-features-1/1.0/conf/core`

Requirements couverts :
- `/req/core/root-op` — GET / (landing page)
- `/req/core/root-success` — Structure landing page, links required
- `/req/core/conformance-op` — GET /conformance
- `/req/core/conformance-success` — conformsTo array
- `/req/core/collections-op` — GET /collections
- `/req/core/collections-success` — Collection metadata
- `/req/core/collection-op` — GET /collections/{id}
- `/req/core/collection-success` — Single collection metadata
- `/req/core/items-op` — GET /collections/{id}/items
- `/req/core/items-limit-param` — limit parameter
- `/req/core/items-bbox-param` — bbox parameter
- `/req/core/items-response-structure` — numberReturned, numberMatched, links
- `/req/core/feature-op` — GET /collections/{id}/items/{fid}
- `/req/core/feature-success` — Single feature response
- `/req/core/query-param-unknown` — 400 for unknown params
- `/req/core/query-param-invalid` — 400 for invalid values
- `/req/core/http` — HTTP 1.1 conformance

**Conformance class:** `http://www.opengis.net/spec/ogcapi-features-1/1.0/conf/geojson`
- Réponses en `application/geo+json`

### OGC API Features — Filtering (Part 3)

**Conformance classes:**
- `http://www.opengis.net/spec/ogcapi-features-3/1.0/conf/filter`
- `http://www.opengis.net/spec/ogcapi-features-3/1.0/conf/features-filter`
- `http://www.opengis.net/spec/ogcapi-features-3/1.0/conf/queryables`

Requirements couverts :
- `/req/filter/filter-param` — filter query parameter
- `/req/filter/filter-lang-param` — filter-lang parameter (cql2-text)
- `/req/filter/filter-crs-wgs84` — Default CRS84
- `/req/filter/mixing-expressions` — Combinaison filter + bbox/query params
- `/req/filter/response` — Inclusion/exclusion basée sur le filtre
- `/req/queryables/get-queryables-op` — GET queryables
- `/req/queryables/get-queryables-response` — JSON Schema avec $schema, properties

### CQL2

**Conformance classes couvertes :**
- `http://www.opengis.net/spec/cql2/1.0/conf/basic-cql2` — =, !=, <, >, <=, >=, AND, OR, NOT
- `http://www.opengis.net/spec/cql2/1.0/conf/advanced-comparison-operators` — LIKE, IN, BETWEEN
- `http://www.opengis.net/spec/cql2/1.0/conf/basic-spatial-functions` — S_INTERSECTS
- `http://www.opengis.net/spec/cql2/1.0/conf/spatial-functions` — S_WITHIN, S_OVERLAPS (partiel)
- `http://www.opengis.net/spec/cql2/1.0/conf/cql2-text` — Encodage texte

**Hors scope :**
- `cql2-json` — Pas d'encodage JSON
- `temporal-functions` — Pas de données temporelles dans le POC
- `array-functions` — Pas de données array
- `property-property` — Comparaison propriété-propriété
- `arithmetic` — Expressions arithmétiques
- `case-insensitive-comparison` — CASEI()
- `accent-insensitive-comparison` — ACCENTI()

### Sorting

**Conformance class:** `http://www.opengis.net/spec/ogcapi-records-1/1.0/conf/sorting`

- sortby parameter avec syntaxe `field,-field`
- Lien vers sortables resource

### WFS 1.1.0

Opérations :
- GetCapabilities — XML avec FeatureTypeList, WGS84BoundingBox
- DescribeFeatureType — JSON Schema
- GetFeature — GET et POST, maxFeatures, startIndex, resultType=hits
- Reprojection CRS (EPSG:3857)

### WFS 2.0 (support partiel)

Ce qui sera supporté :
- `count` comme alias de `maxFeatures`
- Version negotiation (`version=2.0.0`)
- GetCapabilities 2.0
- `numberMatched`/`numberReturned` dans la réponse

Hors scope :
- StoredQueries (ListStoredQueries, DescribeStoredQueries, etc.)
- Ad-hoc queries avec Filter Encoding (FES)
- GetPropertyValue
- Output GML (on reste en GeoJSON)
- Transaction, Locking

## Changements au proxy pour WFS 2.0

Modifications minimales requises dans `packages/proxy/src/wfs/` :
1. **Router** — Accepter `version=2.0.0` en plus de `1.1.0`
2. **get-feature.ts** — Supporter `count` comme alias de `maxFeatures`
3. **capabilities.ts** — Retourner un document 2.0.0 quand `version=2.0.0` est demandé
4. **Version negotiation** — Gérer le fallback quand la version n'est pas spécifiée
