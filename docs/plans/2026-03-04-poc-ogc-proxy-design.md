# Design — POC OGC Proxy

**Date :** 2026-03-04
**Statut :** Approuvé

---

## Contexte

Preuve de concept pour un proxy OGC qui offre une interface GIS commune aux APIs maison de l'organisation. Expose OGC API Features + WFS (lecture) au-dessus d'APIs REST internes hétérogènes.

**Clients cibles :** QGIS (OGC API Features), MapStore (WFS), applications web Angular/React (OGC API Features REST/JSON).

**Périmètre POC :** Sans authentification. Données simulées. Validation bout en bout avec QGIS et MapStore.

---

## Décisions

| Décision | Choix |
|---|---|
| Stack | Node.js + Express + TypeScript |
| Mono-repo | npm workspaces (`packages/`) |
| Données mock | 3 collections : Points, Lines, Polygons |
| CRS | EPSG:4326 (WGS84) |
| WFS output | GeoJSON uniquement |
| WFS architecture | Façade légère au-dessus du même moteur OGC |
| Tests conformité | Vitest + supertest |
| Auth | Hors scope POC |

---

## Structure mono-repo

```
ogc-proxy-poc/
├── package.json                  # workspace root
├── packages/
│   ├── mock-api/                 # API REST simulée (Express)
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   ├── data/
│   │   │   │   ├── bornes-fontaines.ts   # Points
│   │   │   │   ├── pistes-cyclables.ts   # LineStrings
│   │   │   │   └── arrondissements.ts    # Polygons
│   │   │   └── routes/
│   │   │       ├── bornes.ts
│   │   │       ├── pistes.ts
│   │   │       └── arrondissements.ts
│   │   └── package.json
│   │
│   ├── proxy/                    # Le proxy OGC (coeur)
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   ├── ogc/              # Routes OGC API Features
│   │   │   │   ├── landing.ts
│   │   │   │   ├── collections.ts
│   │   │   │   └── items.ts
│   │   │   ├── wfs/              # Façade WFS
│   │   │   │   ├── router.ts
│   │   │   │   ├── capabilities.ts
│   │   │   │   ├── describe.ts
│   │   │   │   └── get-feature.ts
│   │   │   ├── engine/           # Moteur partagé
│   │   │   │   ├── registry.ts
│   │   │   │   ├── adapter.ts
│   │   │   │   └── geojson-builder.ts
│   │   │   └── config/
│   │   │       └── collections.yaml
│   │   └── package.json
│   │
│   └── conformance-tests/        # Tests de conformité OGC
│       ├── src/
│       │   ├── landing.test.ts
│       │   ├── collections.test.ts
│       │   ├── items.test.ts
│       │   └── wfs.test.ts
│       └── package.json
│
├── docker-compose.yml            # MapStore + proxy + mock
└── docs/
    ├── qgis-setup.md
    └── mapstore-setup.md
```

---

## Mock API (`packages/mock-api`)

3 endpoints REST simulant des APIs municipales avec des structures volontairement différentes :

| Endpoint | Géométrie | Structure réponse |
|---|---|---|
| `GET /api/bornes-fontaines` | Points | `{ data: [{ id, x, y, etat, ... }], total: N }` |
| `GET /api/pistes-cyclables` | Lines | `{ results: [{ id, geometry: { coords: [...] }, nom, ... }], count: N }` |
| `GET /api/arrondissements` | Polygons | `{ items: [{ code, nom, wkt: "POLYGON(...)", ... }] }` — pas de total |

Chaque endpoint supporte `offset` et `limit`. Les structures hétérogènes démontrent la valeur du pattern adapter.

---

## Moteur de mapping (`packages/proxy/src/engine/`)

### Registry YAML

Une entrée par collection décrivant l'upstream, le mapping de réponse, la construction de géométrie, le champ ID et les propriétés à exposer :

```yaml
collections:
  bornes-fontaines:
    title: "Bornes-fontaines"
    upstream:
      url: "http://mock-api:3001/api/bornes-fontaines"
      method: GET
      responseMapping:
        items: "data"
        total: "total"
    geometry:
      type: Point
      xField: "x"
      yField: "y"
    idField: "id"
    properties: ["etat", "arrondissement"]

  pistes-cyclables:
    title: "Pistes cyclables"
    upstream:
      url: "http://mock-api:3001/api/pistes-cyclables"
      method: GET
      responseMapping:
        items: "results"
        total: "count"
    geometry:
      type: LineString
      coordsField: "geometry.coords"
    idField: "id"
    properties: ["nom", "type", "longueur"]

  arrondissements:
    title: "Arrondissements"
    upstream:
      url: "http://mock-api:3001/api/arrondissements"
      method: GET
      responseMapping:
        items: "items"
        total: null
    geometry:
      type: Polygon
      wktField: "wkt"
    idField: "code"
    properties: ["nom", "population"]
```

### Adapter générique

Le YAML couvre les 3 cas du POC sans adapter custom. L'adapter :

1. Construit la requête upstream (URL + query params offset/limit/bbox)
2. Parse la réponse selon `responseMapping` (chemin vers items et total)
3. Construit les Features GeoJSON via `geojson-builder` (Point xy, LineString coords, Polygon WKT)

---

## Routes OGC API Features (`/ogc/*`)

| Route | Réponse |
|---|---|
| `GET /ogc/` | Landing page avec liens (self, service-desc, conformance, data) |
| `GET /ogc/conformance` | Classes de conformité supportées |
| `GET /ogc/collections` | Liste des collections depuis le registry |
| `GET /ogc/collections/{id}` | Détail d'une collection |
| `GET /ogc/collections/{id}/items` | FeatureCollection GeoJSON (limit, offset, bbox) |
| `GET /ogc/collections/{id}/items/{featureId}` | Feature unique |

---

## Façade WFS (`/wfs`)

Un seul endpoint `GET /wfs?service=WFS&request=...` dispatche selon le paramètre `request` :

| request | Action |
|---|---|
| `GetCapabilities` | XML généré depuis le registry (template) |
| `DescribeFeatureType` | JSON Schema de la collection |
| `GetFeature` | Appel au moteur + formatage GeoJSON avec enveloppe WFS |

Le `outputFormat=application/json` est le format par défaut pour MapStore. La façade réutilise le même moteur et le même registry que l'OGC API Features — aucune duplication de logique.

---

## Tests de conformité (`packages/conformance-tests`)

Tests Vitest + supertest validant la conformité OGC API Features Part 1 :

- **Landing** : structure, liens requis (self, service-desc, conformance, data)
- **Conformance** : présence des classes de conformité
- **Collections** : structure, liens, CRS
- **Items** : FeatureCollection valide, pagination (next/prev links), numberMatched/numberReturned, limit, bbox
- **Single feature** : structure Feature, id match
- **WFS** : GetCapabilities XML valide, GetFeature retourne du GeoJSON

---

## Docker Compose

```yaml
services:
  mock-api:
    build: ./packages/mock-api
    ports: ["3001:3001"]

  proxy:
    build: ./packages/proxy
    ports: ["3000:3000"]
    depends_on: [mock-api]

  mapstore:
    image: geosolutionsit/mapstore2
    ports: ["8080:8080"]
    depends_on: [proxy]
```

---

## Documentation

- **`docs/qgis-setup.md`** : Ajouter le proxy comme source OGC API Features dans QGIS, tester navigation et filtrage
- **`docs/mapstore-setup.md`** : Configurer MapStore pour consommer le WFS, créer une carte avec les 3 couches
