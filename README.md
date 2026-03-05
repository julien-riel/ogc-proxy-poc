# OGC Proxy POC

Proxy qui expose des APIs REST internes en **OGC API Features** et **WFS 1.1.0**, compatible QGIS et MapStore.

## Prerequis

- Node.js 20+
- Docker et Docker Compose (pour MapStore)

## Demarrage rapide

### Mode local (sans Docker)

```bash
npm install
npm run dev
```

Le mock API demarre sur `http://localhost:3001` et le proxy sur `http://localhost:3000`.

Tester :
```bash
# OGC API Features
curl http://localhost:3000/ogc/collections

# WFS 1.1.0
curl 'http://localhost:3000/wfs?service=WFS&request=GetCapabilities'
```

### Mode Docker (avec MapStore)

```bash
docker compose up --build
```

Tout est accessible via le gateway nginx sur `http://localhost:8080` :

| Service | URL |
|---------|-----|
| MapStore | http://localhost:8080/mapstore/ |
| WFS | http://localhost:8080/wfs?service=WFS&request=GetCapabilities |
| OGC API Features | http://localhost:8080/ogc/collections |

## Connecter QGIS

1. Menu **Couche** > **Ajouter une couche** > **Ajouter une couche WFS / OGC API Features**
2. Creer une connexion avec l'URL `http://localhost:3000/ogc`
3. Les 3 collections apparaissent : bornes-fontaines, pistes-cyclables, arrondissements

Voir [docs/qgis-setup.md](docs/qgis-setup.md) pour le guide complet.

## Connecter MapStore

1. Ouvrir `http://localhost:8080/mapstore/` (admin/admin)
2. Creer une carte, ouvrir le catalogue
3. Ajouter un service WFS avec l'URL `http://localhost:8080/wfs`

Voir [docs/mapstore-setup.md](docs/mapstore-setup.md) pour le guide complet.

## Tests

```bash
# Tous les tests (unit + conformance)
npm test

# Unit seulement
npm run test:unit

# Conformance seulement
npm run test:conformance
```

## Architecture

```
packages/
  mock-api/        # 3 APIs REST simulees (bornes-fontaines, pistes-cyclables, arrondissements)
  proxy/           # Proxy OGC (API Features + WFS 1.1.0)
  conformance-tests/  # Tests de conformance OGC
```

Le proxy lit un registre YAML (`packages/proxy/src/config/collections.yaml`) qui mappe chaque collection vers une API upstream. Il supporte la pagination (offset/limit, page/pageSize, cursor) et la reprojection CRS84/EPSG:3857.

## Collections disponibles

| Collection | Geometrie | Source |
|-----------|-----------|--------|
| bornes-fontaines | Point | API paginee offset/limit |
| pistes-cyclables | LineString | API paginee page/pageSize |
| arrondissements | Polygon (WKT) | API paginee cursor |
