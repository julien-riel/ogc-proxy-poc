# Guide d'intégration — Diffuser mon API via le proxy OGC

Ce guide explique comment exposer une API REST existante en tant que service géospatial standardisé (OGC API Features + WFS) via le proxy OGC municipal.

## Table des matières

- [Prérequis](#prérequis)
- [Vue d'ensemble](#vue-densemble)
- [Étape 1 — Analyser votre API](#étape-1--analyser-votre-api)
- [Étape 2 — Configurer la collection](#étape-2--configurer-la-collection)
- [Étape 3 — Configurer les variables d'environnement](#étape-3--configurer-les-variables-denvironnement)
- [Étape 4 — Démarrer et tester](#étape-4--démarrer-et-tester)
- [Cas avancés](#cas-avancés)
- [Référence des options de configuration](#référence-des-options-de-configuration)
- [Dépannage](#dépannage)

---

## Prérequis

- Node.js 20+
- npm
- Votre API REST est accessible depuis le réseau où tourne le proxy
- Votre API retourne des données contenant des coordonnées géographiques (x/y, lat/lon, WKT, ou GeoJSON)

## Vue d'ensemble

Le proxy agit comme un traducteur entre votre API interne et les standards OGC :

```
Clients (QGIS, MapStore, apps web)
        │
        ▼
┌──────────────────┐
│   Proxy OGC      │  ← Endpoints standardisés /ogc/* et /wfs/*
│                  │
│  collections.yaml│  ← Votre configuration ici
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│   Votre API      │  ← API REST existante, aucune modification requise
└──────────────────┘
```

**Vous n'avez pas besoin de modifier votre API.** Toute la configuration se fait dans un seul fichier YAML.

---

## Étape 1 — Analyser votre API

Avant de configurer le proxy, identifiez les éléments suivants dans votre API :

### 1.1 Format de la réponse

Déterminez comment votre API structure ses réponses. Exemple :

```json
{
  "data": [ { "id": 1, "nom": "Parc A", "lat": 45.5, "lon": -73.6 }, ... ],
  "total": 42
}
```

Notez :
- **Le chemin vers le tableau d'items** : ici `data`
- **Le chemin vers le total** : ici `total` (peut être absent)
- **Le chemin vers un item unique** (si votre API supporte `GET /item/:id`) : ex. `data`

### 1.2 Type de pagination

| Votre API utilise... | Type à configurer |
|---|---|
| `?offset=0&limit=10` | `offset-limit` |
| `?page=1&pageSize=10` | `page-pageSize` |
| `?cursor=abc123&limit=10` | `cursor` |

Notez les **noms exacts** des paramètres de requête.

### 1.3 Géométrie

| Vos données contiennent... | Type de géométrie |
|---|---|
| Deux champs séparés (latitude/longitude) | `Point` avec `xField`/`yField` |
| Un tableau de coordonnées `[[x,y], ...]` | `LineString` ou `Polygon` avec `coordsField` |
| Un champ WKT (`POLYGON((...))`) | `Polygon` avec `wktField` |
| Un objet GeoJSON natif | Utiliser le plugin `wfs-upstream` |

### 1.4 Filtres supportés

Pour chaque propriété, vérifiez si votre API supporte le filtrage via des paramètres de requête. Exemple : `GET /api/parcs?arrondissement=Rosemont`.

---

## Étape 2 — Configurer la collection

Éditez le fichier `packages/proxy/src/config/collections.yaml` et ajoutez votre collection sous la clé `collections:`.

### Exemple complet — API avec pagination offset/limit et points

Supposons une API de parcs accessible à `https://api.ville.ca/v1/parcs` :

```yaml
collections:
  # ... collections existantes ...

  parcs:
    title: "Parcs municipaux"
    description: "Inventaire des parcs et espaces verts"
    extent:
      spatial: [-73.98, 45.41, -73.47, 45.70]  # bbox [minLon, minLat, maxLon, maxLat]

    upstream:
      type: "rest"
      baseUrl: "${PARCS_API_HOST}/v1/parcs"
      method: GET
      pagination:
        type: "offset-limit"
        offsetParam: "offset"
        limitParam: "limit"
      responseMapping:
        items: "data"        # réponse.data = tableau d'items
        total: "total"       # réponse.total = nombre total
        item: "data"         # pour GET /items/:id
      spatialCapabilities:
        - "bbox"

    geometry:
      type: Point
      xField: "longitude"   # nom du champ X dans vos données
      yField: "latitude"    # nom du champ Y dans vos données

    idField: "id"            # champ identifiant unique

    properties:
      - name: "nom"
        type: "string"
        filterable: true
        sortable: true
        upstream:
          param: "nom"               # envoyé à l'API comme ?nom=valeur
          operators: ["=", "LIKE"]
      - name: "arrondissement"
        type: "string"
        filterable: true
        upstream:
          param: "arrondissement"
          operators: ["="]
      - name: "superficie"
        type: "double"
        filterable: true
        sortable: true
        # pas de section upstream = filtrage post-fetch (côté proxy)
```

### Exemple — API avec pagination par page et lignes

```yaml
  reseau-eau:
    title: "Réseau d'aqueduc"
    description: "Conduites principales du réseau d'eau"
    extent:
      spatial: [-73.98, 45.41, -73.47, 45.70]

    upstream:
      type: "rest"
      baseUrl: "${UPSTREAM_HOST}/api/conduites"
      method: GET
      pagination:
        type: "page-pageSize"
        pageParam: "page"
        pageSizeParam: "pageSize"
      responseMapping:
        items: "results"
        total: "count"
        item: "result"
      spatialCapabilities:
        - "bbox"

    geometry:
      type: LineString
      coordsField: "geometry.coords"  # chemin vers [[x,y], [x,y], ...]

    idField: "id"
    properties:
      - name: "diametre"
        type: "int"
        filterable: true
        sortable: true
```

### Exemple — API avec cursor et polygones WKT

```yaml
  zones:
    title: "Zones de planification"
    description: "Zones d'aménagement urbain"
    extent:
      spatial: [-73.98, 45.41, -73.47, 45.70]

    upstream:
      type: "rest"
      baseUrl: "${UPSTREAM_HOST}/api/zones"
      method: GET
      pagination:
        type: "cursor"
        cursorParam: "cursor"
        limitParam: "limit"
        nextCursorField: "nextCursor"  # champ contenant le curseur suivant
      responseMapping:
        items: "items"
        total: null          # pas de total disponible avec cursor
        item: "item"
      spatialCapabilities:
        - "bbox"

    geometry:
      type: Polygon
      wktField: "wkt_geom"  # champ contenant "POLYGON((-73.5 45.5, ...))"

    idField: "code"
    properties:
      - name: "nom"
        type: "string"
        filterable: true
```

---

## Étape 3 — Configurer les variables d'environnement

Si votre API utilise un host différent de `UPSTREAM_HOST`, ajoutez une variable d'environnement.

### Fichier `.env`

```bash
# Host existant pour les API mock
UPSTREAM_HOST=http://localhost:3001

# Votre API (ajoutez au besoin)
PARCS_API_HOST=https://api.ville.ca

# Port du proxy
PORT=3000
```

Les variables `${...}` dans `collections.yaml` sont substituées automatiquement au démarrage.

### Docker Compose

Si vous utilisez Docker, ajoutez la variable dans `docker-compose.yml` :

```yaml
services:
  proxy:
    environment:
      PARCS_API_HOST: "https://api.ville.ca"
```

---

## Étape 4 — Démarrer et tester

### Démarrage

```bash
# Installation des dépendances
npm install

# Développement (avec rechargement automatique)
npm run dev:proxy

# OU production
npm run build && npm start
```

### Vérification

```bash
# Santé du proxy
curl http://localhost:3000/health

# Vérifier que votre collection apparaît
curl http://localhost:3000/ogc/collections | jq '.collections[].id'

# Détails de votre collection
curl http://localhost:3000/ogc/collections/parcs

# Récupérer les features (GeoJSON)
curl "http://localhost:3000/ogc/collections/parcs/items?limit=5"

# Filtrer par propriété
curl "http://localhost:3000/ogc/collections/parcs/items?arrondissement=Rosemont"

# Filtre spatial (bbox)
curl "http://localhost:3000/ogc/collections/parcs/items?bbox=-73.6,45.5,-73.5,45.6"

# Filtre CQL2
curl "http://localhost:3000/ogc/collections/parcs/items?filter=nom%20LIKE%20'%25Mont%25'&filter-lang=cql2-text"

# Récupérer un item par ID
curl http://localhost:3000/ogc/collections/parcs/items/42

# Propriétés filtrables (queryables)
curl http://localhost:3000/ogc/collections/parcs/queryables
```

### Tester avec QGIS

1. Ouvrir QGIS
2. **Couche** → **Ajouter une couche** → **WFS / OGC API Features**
3. Créer une nouvelle connexion :
   - **URL** : `http://localhost:3000/ogc/`
   - **Version** : OGC API Features
4. Cliquer **Connecter** → sélectionner votre collection → **Ajouter**

### Tester avec MapStore

```bash
# Démarrer avec Docker Compose (inclut MapStore)
docker-compose up

# MapStore disponible à http://localhost:8080
```

Ajouter le catalogue WFS :
- URL : `http://proxy:3000/wfs?service=WFS&request=GetCapabilities`

---

## Cas avancés

### Activer l'authentification JWT

Dans `collections.yaml`, section `security` en haut du fichier :

```yaml
security:
  jwt:
    enabled: true
    host: "${JWT_HOST}"
    endpoint: "${JWT_ENDPOINT}"
```

Les endpoints de découverte (`/ogc/`, `/ogc/conformance`, WFS `GetCapabilities`) restent publics. Tous les autres endpoints requièrent un header `Authorization: Bearer <token>`.

### Limiter le débit vers votre API (rate limiting)

Pour protéger votre API contre les rafales de requêtes (ex. QGIS qui pagine en parallèle) :

```yaml
  parcs:
    rateLimit:
      capacity: 20       # max requêtes simultanées en file
      refillRate: 10      # requêtes/seconde autorisées
    # ... reste de la config
```

### Ajuster les limites de pagination

Globalement dans la section `defaults` :

```yaml
defaults:
  maxPageSize: 1000     # taille max d'une page
  maxFeatures: 10000    # offset max (protection mémoire)
```

### Connecter une source WFS existante

Si votre source est déjà un WFS (ex. GeoServer), utilisez le plugin `wfs-upstream` :

```yaml
  ma-couche-wfs:
    title: "Ma couche WFS"
    plugin: "wfs-upstream"
    rateLimit:
      capacity: 10
      refillRate: 5
    upstream:
      type: "wfs"
      baseUrl: "https://geoserver.ville.ca/geoserver/wfs"
      typeName: "namespace:layer_name"
      version: "1.1.0"
      method: GET
      pagination:
        type: "offset-limit"
        offsetParam: "startIndex"
        limitParam: "count"
      responseMapping:
        items: "features"
        total: "totalFeatures"
        item: "features.0"
      spatialCapabilities:
        - "bbox"
        - "intersects"
    geometry:
      type: Polygon
    idField: "id"
    properties:
      - name: "NOM"
        type: "string"
        filterable: true
        sortable: true
```

### Créer un plugin personnalisé

Si votre API nécessite une transformation spéciale (ex. authentification custom, reformatage de données), créez un plugin dans `packages/proxy/src/plugins/` :

```typescript
// packages/proxy/src/plugins/mon-api.ts
import type { CollectionPlugin } from '../engine/plugin.js';

export const plugin: CollectionPlugin = {
  async transformRequest(req) {
    // Ajouter un header d'auth vers l'upstream
    req.headers['X-Api-Key'] = process.env.MON_API_KEY;
    return req;
  },

  async transformFeature(feature) {
    // Reformater un champ avant de le servir
    feature.properties.date = new Date(feature.properties.timestamp).toISOString();
    return feature;
  },
};

export default plugin;
```

Référencez-le dans la collection :

```yaml
  ma-collection:
    plugin: "mon-api"
    # ... reste de la config
```

---

## Référence des options de configuration

### Collection

| Clé | Type | Requis | Description |
|---|---|---|---|
| `title` | string | oui | Nom affiché de la collection |
| `description` | string | non | Description textuelle |
| `extent.spatial` | number[4] | non | Bbox [minLon, minLat, maxLon, maxLat] |
| `plugin` | string | non | Nom du plugin à charger |
| `rateLimit.capacity` | number | non | Taille du token bucket |
| `rateLimit.refillRate` | number | non | Tokens/seconde |

### Upstream

| Clé | Type | Requis | Description |
|---|---|---|---|
| `type` | `"rest"` ou `"wfs"` | oui | Type de source |
| `baseUrl` | string | oui | URL de base (supporte `${VAR}`) |
| `method` | `GET` ou `POST` | oui | Méthode HTTP |
| `pagination.type` | string | oui | `offset-limit`, `page-pageSize` ou `cursor` |
| `responseMapping.items` | string | oui | Chemin JSON vers le tableau d'items |
| `responseMapping.total` | string/null | oui | Chemin vers le total (`null` si absent) |
| `responseMapping.item` | string | oui | Chemin vers un item unique |
| `spatialCapabilities` | string[] | non | Capacités spatiales (`bbox`, `intersects`, etc.) |

### Geometry

| Clé | Type | Description |
|---|---|---|
| `type` | `Point`, `LineString`, `Polygon` | Type de géométrie |
| `xField` / `yField` | string | Champs longitude/latitude (Point) |
| `coordsField` | string | Chemin vers tableau de coordonnées (LineString/Polygon) |
| `wktField` | string | Champ contenant du WKT (Polygon) |

### Property

| Clé | Type | Description |
|---|---|---|
| `name` | string | Nom de la propriété |
| `type` | `string`, `int`, `double` | Type de données |
| `filterable` | boolean | Disponible dans les filtres CQL2 |
| `sortable` | boolean | Disponible dans `sortby` |
| `upstream.param` | string | Paramètre de requête envoyé à l'API |
| `upstream.operators` | string[] | Opérateurs supportés (`=`, `LIKE`, `<`, `>`, etc.) |

---

## Dépannage

### "Collection not found"

- Vérifiez que l'identifiant (clé YAML) est bien en minuscules et sans espaces
- Relancez le proxy après modification du YAML (le fichier est lu au démarrage)

### Erreur 502 / timeout

- Vérifiez que `baseUrl` est accessible depuis le proxy : `curl <votre-url>`
- Vérifiez les variables d'environnement : `echo $UPSTREAM_HOST`
- Augmentez le timeout si nécessaire (défaut : 15 secondes)

### Les features sont vides (pas de géométrie)

- Vérifiez les noms de champs `xField`/`yField`/`coordsField`/`wktField`
- Testez votre API directement et comparez les noms de champs dans la réponse JSON

### Rate limiting (429)

- Augmentez `capacity` et `refillRate` dans la config de votre collection
- Ou augmentez les limites globales `RATE_LIMIT_MAX`

### Filtres qui ne fonctionnent pas

- **Filtre upstream** : vérifiez que `upstream.param` correspond exactement au paramètre attendu par votre API
- **Filtre post-fetch** (pas de section `upstream`) : fonctionne uniquement sur les données déjà récupérées, limité à 5000 items
- Consultez les filtres disponibles : `GET /ogc/collections/{id}/queryables`
