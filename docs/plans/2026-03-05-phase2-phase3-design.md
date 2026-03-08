# Design — Phase 2 & Phase 3

**Date :** 2026-03-05
**Statut :** Approuve

---

## Contexte

La Phase 1 est completee et validee : OGC API Features + WFS fonctionnels avec QGIS et MapStore, 3 collections mock (Points, LineStrings, Polygons), 3 strategies de pagination, bbox cote client.

La Phase 2 ajoute les filtres, operations spatiales, tri, systeme de plugins et une collection WFS upstream reelle. La Phase 3 ajoute l'authentification OAuth2/OpenID Connect.

---

## Phase 2 — Filtres, spatial, tri, plugins

### 1. Systeme de plugins

Pipeline avec hooks async a 6 points d'extension :

```
Requete OGC/WFS entrante
  -> hooks.transformRequest(req)
    -> hooks.buildUpstreamRequest(upstreamReq)
      -> HTTP fetch upstream
    -> hooks.transformUpstreamResponse(rawResponse)
    -> geojson-builder + hooks.transformFeature(feature) / transformFeatures(features[])
    -> filtrage spatial (Turf.js ou pass-through)
  -> hooks.transformResponse(ogcResponse)
Reponse sortante
```

#### Interface plugin

```typescript
export interface CollectionPlugin {
  skipGeojsonBuilder?: boolean;
  transformRequest?(req: OgcRequest): Promise<OgcRequest>;
  buildUpstreamRequest?(req: UpstreamRequest): Promise<UpstreamRequest>;
  transformUpstreamResponse?(raw: unknown): Promise<unknown>;
  transformFeature?(feature: Feature): Promise<Feature>;
  transformFeatures?(features: Feature[]): Promise<Feature[]>;
  transformResponse?(res: OgcResponse): Promise<OgcResponse>;
}
```

Tous les hooks sont optionnels. Sans plugin, le comportement YAML-driven par defaut s'applique.

#### Decouverte des plugins

Declare dans le YAML par collection :

```yaml
collections:
  mrc-quebec:
    plugin: "wfs-upstream"            # built-in reutilisable
  permis-construction:
    plugin: "./plugins/permis.ts"     # custom par fichier
```

Plugins charges au demarrage via `import()` dynamique. Les plugins built-in sont dans `packages/proxy/src/plugins/`.

### 2. Filtres attributaires

#### A) Query string simple (OGC API Features Part 1)

```
GET /ogc/collections/bornes-fontaines/items?etat=actif&arrondissement=Rosemont
```

Egalite seulement. Les proprietes filtrables declarees dans le YAML :

```yaml
properties:
  - name: etat
    type: string
    filterable: true
  - name: population
    type: integer
    filterable: true
```

#### B) CQL2 Text (OGC API Features Part 3)

```
GET /ogc/collections/bornes-fontaines/items?filter=etat='actif' AND population>50000&filter-lang=cql2-text
```

Operateurs supportes :
- **Comparaison** : `=`, `<>`, `<`, `>`, `<=`, `>=`
- **Logique** : `AND`, `OR`, `NOT`
- **Spatial** : `S_INTERSECTS`, `S_WITHIN`, `S_DWITHIN`
- **Like** : `LIKE` avec wildcards

Parseur CQL2 leger custom produisant un AST. L'AST est soit traduit en params upstream (via mapping YAML), soit evalue cote proxy post-fetch (Turf.js pour spatial, comparaison JS pour le reste).

#### C) Strategie hybride dans le YAML

```yaml
properties:
  - name: etat
    type: string
    filterable: true
    upstream:
      param: "statut"
      operators: ["="]
```

Si l'operateur demande n'est pas dans `operators` ou si `upstream` n'est pas declare -> filtrage cote proxy post-fetch.

### 3. Endpoint `/queryables` (Part 3)

```
GET /ogc/collections/bornes-fontaines/queryables
```

JSON Schema genere depuis le YAML (proprietes `filterable: true`) :

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": ".../collections/bornes-fontaines/queryables",
  "type": "object",
  "properties": {
    "etat": { "type": "string" },
    "population": { "type": "integer" },
    "geometry": { "$ref": "https://geojson.org/schema/Polygon.json" }
  }
}
```

### 4. Operations spatiales

#### Upstream REST (mock-api, APIs municipales)

L'upstream supporte seulement bbox. Operations avancees evaluees cote proxy avec Turf.js :

```
Requete CQL2: S_INTERSECTS(geometry, POLYGON(...))
  -> 1. Calculer le bbox englobant du polygone (turf.bbox)
  -> 2. Fetch upstream avec ce bbox (reduit le dataset)
  -> 3. Evaluer S_INTERSECTS precis avec Turf.js
```

| Operateur | Turf.js | Description |
|---|---|---|
| `S_INTERSECTS` | `booleanIntersects` | Geometries se chevauchent |
| `S_WITHIN` | `booleanWithin` | Feature contenue dans la geometrie |
| `S_DWITHIN` | `distance` + seuil | Feature a moins de X metres |
| `BBOX` | pass-through upstream | Envelope spatial (existant) |

#### Upstream WFS

Le proxy traduit le CQL2 en Filter XML et le passe directement a l'upstream. Pas de filtrage cote proxy.

#### Declaration dans le YAML

```yaml
collections:
  bornes-fontaines:
    upstream:
      type: "rest"
      spatialCapabilities: ["bbox"]

  mrc-quebec:
    upstream:
      type: "wfs"
      spatialCapabilities: ["bbox", "intersects", "within", "dwithin"]
```

### 5. Tri (sorting)

Parametre `sortby` (OGC API Features Part 3) :

```
GET /ogc/collections/bornes-fontaines/items?sortby=arrondissement,-population
```

Declare dans le YAML par propriete :

```yaml
properties:
  - name: population
    type: integer
    sortable: true
    upstream:
      sortParam: "sort_by"
      sortDesc: "-"
```

Comportement :
- `sortable: true` + `sortParam` declare -> pass-through upstream
- `sortable: true` sans `sortParam` -> HTTP 400 (refus, tri sur une page n'a pas de sens)
- WFS upstream -> traduction en `<SortBy>` XML

Le endpoint `/queryables` expose les champs triables via `x-ogc-sortable: true`.

### 6. Limites de telechargement

Deux niveaux :

```yaml
defaults:
  maxPageSize: 1000
  maxFeatures: 10000

collections:
  bornes-fontaines:
    maxPageSize: 500
    maxFeatures: 5000
```

| Situation | Action |
|---|---|
| `limit` depasse `maxPageSize` | Cap silencieux, header `OGC-maxPageSize` |
| Pagination au-dela de `maxFeatures` | Lien `next` disparait |
| `offset` au-dela de `maxFeatures` | HTTP 400 |

Tache de validation : test exploratoire QGIS + MapStore avec limites basses, resultat documente dans `docs/client-limits-behavior.md`.

### 7. WFS upstream reel

Collection `mrc-quebec` via le GeoServer public PAVICS Ouranos :

```yaml
collections:
  mrc-quebec:
    title: "MRC du Quebec"
    plugin: "wfs-upstream"
    upstream:
      type: "wfs"
      baseUrl: "https://pavics.ouranos.ca/geoserver/wfs"
      typeName: "public:quebec_mrc_boundaries"
      version: "1.1.0"
      spatialCapabilities: ["bbox", "intersects", "within", "dwithin"]
    geometry:
      type: Polygon
    idField: "gid"
    properties:
      - name: NOM_MRC
        type: string
        filterable: true
        sortable: true
      - name: RES_CO_MRC
        type: string
        filterable: true
```

Plugin `wfs-upstream` (built-in reutilisable) :
- `buildUpstreamRequest` : CQL2 -> Filter XML, sortby -> SortBy XML, pagination -> startIndex/count
- `transformUpstreamResponse` : parse GeoJSON (outputFormat=application/json)
- `skipGeojsonBuilder: true`

### 8. Collections finales du projet

| Collection | Upstream | Geometrie | Plugin |
|---|---|---|---|
| bornes-fontaines | REST mock (offset/limit) | Point | -- |
| pistes-cyclables | REST mock (page/pageSize) | LineString | -- |
| arrondissements | REST mock (cursor) | Polygon | -- |
| mrc-quebec | WFS PAVICS Ouranos | Polygon | `wfs-upstream` |

---

## Phase 3 — Authentification OAuth2/OpenID Connect (haut niveau)

Design detaille a produire dans un brainstorming separe.

### Architecture

```
Client (QGIS/MapStore/App web)
  -> Token OAuth2 (obtenu via Keycloak)
    -> Proxy OGC
      -> Valide JWT (signature JWKS, audience, scopes)
      -> Forward token vers upstream si requis
        -> API REST municipale
        -> WFS upstream
```

### Composantes

| Composante | Role |
|---|---|
| Keycloak local | IdP dans Docker Compose simulant Entra ID |
| Middleware JWT | Valide signature via JWKS, verifie audience + scopes |
| Scopes par collection | Declares dans le YAML (`scopes: ["read:bornes"]`) |
| Relai de tokens | Forward du Bearer token vers les upstreams qui l'exigent |
| Mode dev | Bypass auth configurable via env var |

### Validation bout en bout

- QGIS : plugin OAuth2 avec Keycloak, charger une couche protegee
- MapStore : auth OpenID Connect, acceder au WFS protege
- curl/Postman : obtenir un token, appeler l'API directement

### YAML

```yaml
collections:
  bornes-fontaines:
    auth:
      required: true
      scopes: ["read:bornes"]
      forwardToken: true
```

---

*Fin du document — 2026-03-05*
