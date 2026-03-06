# Configurer QGIS avec le proxy OGC

## Prerequis

- QGIS 3.28+
- Le proxy et le mock API doivent etre demarres (`npm run dev` ou `docker compose up`)

## Ajouter la source OGC API Features

1. Ouvrir QGIS
2. Menu **Couche** > **Ajouter une couche** > **Ajouter une couche WFS / OGC API Features**
3. Cliquer **Nouveau** pour creer une connexion
4. Remplir :
   - **Nom** : `Proxy Municipal`
   - **URL** : `http://localhost:3000/ogc`
   - **Version** : `OGC API - Features`
5. Cliquer **OK** puis **Connexion**
6. Les 4 collections apparaissent : bornes-fontaines, pistes-cyclables, arrondissements, mrc-quebec
7. Selectionner une ou plusieurs couches et cliquer **Ajouter**

## Verification

- Les bornes-fontaines s'affichent comme des points autour de Montreal
- Les pistes cyclables comme des lignes
- Les arrondissements comme des polygones
- La pagination fonctionne (verifier dans le panneau de debogage reseau)

## Filtrage spatial

1. Zoomer sur un secteur de la carte
2. QGIS envoie automatiquement le bbox dans les requetes
3. Seules les features visibles sont chargees

## Filtres

### Query string simple
Ajouter `?etat=actif` a l'URL de la couche pour filtrer par attribut.

### CQL2
Utiliser le parametre `filter` avec `filter-lang=cql2-text`:
- `filter=etat='actif' AND population>50000`
- `filter=S_INTERSECTS(geometry,POLYGON((...)))`

### MRC du Quebec (WFS upstream)
La collection `mrc-quebec` est alimentee par le GeoServer PAVICS Ouranos.
Elle supporte les filtres spatiaux avances via pass-through WFS.

## Notes

- Sans authentification pour le POC
- Le CRS est EPSG:4326 (WGS84)
