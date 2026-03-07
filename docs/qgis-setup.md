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

## Authentification JWT

Si l'authentification JWT est activee dans la configuration du proxy (`security.jwt.enabled: true`), QGIS doit envoyer un token Bearer valide.

### Configurer OAuth2 dans QGIS

1. Dans les proprietes de la connexion OGC API Features, section **Authentification**
2. Cliquer **+** pour creer une nouvelle configuration
3. Choisir le type **OAuth2**
4. Remplir les parametres de votre fournisseur d'identite (Microsoft Entra ID, etc.)
5. QGIS ajoutera automatiquement le header `Authorization: Bearer <token>` a chaque requete

### Endpoints ouverts (sans authentification)

Les endpoints de decouverte restent accessibles sans token :
- Landing page (`/ogc/`)
- Conformance (`/ogc/conformance`)
- WFS GetCapabilities

### Mode developpement

Pour le developpement local, desactiver JWT dans `collections.yaml` :

```yaml
security:
  jwt:
    enabled: false
```

## Notes

- Le CRS est EPSG:4326 (WGS84)
