# Guide de test — Filtres, tri et pagination

Ce document regroupe les requetes `curl` pour tester les fonctionnalites de filtrage, tri et pagination du proxy OGC API Features.

**Base URL :** `http://localhost:3000`

> **Note JWT :** Si l'authentification JWT est activee (`security.jwt.enabled: true` dans `collections.yaml`), ajouter le header `Authorization: Bearer <token>` aux requetes sur les endpoints proteges (collections, items, WFS GetFeature/DescribeFeatureType). Les exemples ci-dessous supposent que JWT est desactive (mode dev par defaut).

---

## Table des matieres

- [1. Pagination](#1-pagination)
  - [1.1 Offset/Limit (bornes-fontaines)](#11-offsetlimit-bornes-fontaines)
  - [1.2 Page/PageSize (pistes-cyclables)](#12-pagepagesize-pistes-cyclables)
  - [1.3 Cursor (arrondissements)](#13-cursor-arrondissements)
  - [1.4 Limites de telechargement](#14-limites-de-telechargement)
- [2. Filtres attributaires](#2-filtres-attributaires)
  - [2.1 Egalite simple (query string)](#21-egalite-simple-query-string)
  - [2.2 CQL2 — Comparaison](#22-cql2--comparaison)
  - [2.3 CQL2 — Operateurs logiques](#23-cql2--operateurs-logiques)
  - [2.4 CQL2 — LIKE](#24-cql2--like)
- [3. Filtres spatiaux](#3-filtres-spatiaux)
  - [3.1 Bbox](#31-bbox)
  - [3.2 CQL2 — S_INTERSECTS](#32-cql2--s_intersects)
  - [3.3 CQL2 — S_WITHIN](#33-cql2--s_within)
  - [3.4 CQL2 — S_DWITHIN](#34-cql2--s_dwithin)
- [4. Tri (sortby)](#4-tri-sortby)
- [5. Combinaisons](#5-combinaisons)
- [6. Queryables](#6-queryables)
- [7. Cas d'erreur](#7-cas-derreur)

---

## 1. Pagination

### 1.1 Offset/Limit (bornes-fontaines)

Premiere page (10 items par defaut) :

```bash
curl -s "http://localhost:3000/ogc/collections/bornes-fontaines/items" | jq '.numberReturned, .links[]'
```

Page explicite avec `limit` :

```bash
curl -s "http://localhost:3000/ogc/collections/bornes-fontaines/items?limit=5" | jq '.numberReturned'
```

Deuxieme page :

```bash
curl -s "http://localhost:3000/ogc/collections/bornes-fontaines/items?limit=5&offset=5" | jq '.numberReturned'
```

Verifier le lien `next` :

```bash
curl -s "http://localhost:3000/ogc/collections/bornes-fontaines/items?limit=5" | jq '.links[] | select(.rel=="next")'
```

Verifier le lien `prev` :

```bash
curl -s "http://localhost:3000/ogc/collections/bornes-fontaines/items?limit=5&offset=5" | jq '.links[] | select(.rel=="prev")'
```

### 1.2 Page/PageSize (pistes-cyclables)

Premiere page :

```bash
curl -s "http://localhost:3000/ogc/collections/pistes-cyclables/items?limit=5" | jq '.numberReturned'
```

Pages suivantes :

```bash
curl -s "http://localhost:3000/ogc/collections/pistes-cyclables/items?limit=5&offset=5" | jq '.numberReturned'
curl -s "http://localhost:3000/ogc/collections/pistes-cyclables/items?limit=5&offset=10" | jq '.numberReturned'
```

### 1.3 Cursor (arrondissements)

Premiere page :

```bash
curl -s "http://localhost:3000/ogc/collections/arrondissements/items?limit=3" | jq '.numberReturned, .links[]'
```

Page suivante (copier la valeur du lien `next`) :

```bash
# Extraire et suivre le lien next automatiquement :
NEXT=$(curl -s "http://localhost:3000/ogc/collections/arrondissements/items?limit=3" | jq -r '.links[] | select(.rel=="next") | .href')
curl -s "$NEXT" | jq '.numberReturned, .features[].id'
```

### 1.4 Limites de telechargement

Demander un `limit` superieur a `maxPageSize` (le proxy devrait le plafonner) :

```bash
curl -s "http://localhost:3000/ogc/collections/bornes-fontaines/items?limit=99999" | jq '.numberReturned'
```

Verifier le header `OGC-maxPageSize` :

```bash
curl -sI "http://localhost:3000/ogc/collections/bornes-fontaines/items?limit=99999" | grep -i ogc-maxpagesize
```

Offset au-dela de `maxFeatures` (devrait retourner HTTP 400) :

```bash
curl -s -o /dev/null -w "%{http_code}" "http://localhost:3000/ogc/collections/bornes-fontaines/items?offset=999999"
```

---

## 2. Filtres attributaires

### 2.1 Egalite simple (query string)

Filtrer par propriete directement dans la query string (OGC API Features Part 1) :

```bash
# Bornes-fontaines avec etat=actif
curl -s "http://localhost:3000/ogc/collections/bornes-fontaines/items?etat=actif" | jq '.numberMatched, .features[].properties.etat'
```

```bash
# Bornes-fontaines avec arrondissement specifique
curl -s "http://localhost:3000/ogc/collections/bornes-fontaines/items?arrondissement=Rosemont" | jq '.numberMatched, .features[].properties.arrondissement'
```

Filtres multiples (AND implicite) :

```bash
curl -s "http://localhost:3000/ogc/collections/bornes-fontaines/items?etat=actif&arrondissement=Rosemont" | jq '.numberMatched'
```

### 2.2 CQL2 — Comparaison

Egalite :

```bash
curl -s "http://localhost:3000/ogc/collections/bornes-fontaines/items?filter=etat='actif'&filter-lang=cql2-text" | jq '.numberMatched'
```

Superieur / inferieur :

```bash
curl -s "http://localhost:3000/ogc/collections/pistes-cyclables/items?filter=longueur>500&filter-lang=cql2-text" | jq '.features[].properties.longueur'
```

```bash
curl -s "http://localhost:3000/ogc/collections/pistes-cyclables/items?filter=longueur<=200&filter-lang=cql2-text" | jq '.features[].properties.longueur'
```

Difference :

```bash
curl -s "http://localhost:3000/ogc/collections/pistes-cyclables/items?filter=type<>'piste'&filter-lang=cql2-text" | jq '.features[].properties.type'
```

### 2.3 CQL2 — Operateurs logiques

AND :

```bash
curl -s "http://localhost:3000/ogc/collections/bornes-fontaines/items?filter=etat='actif' AND arrondissement='Rosemont'&filter-lang=cql2-text" | jq '.numberMatched'
```

OR :

```bash
curl -s "http://localhost:3000/ogc/collections/bornes-fontaines/items?filter=arrondissement='Rosemont' OR arrondissement='Plateau'&filter-lang=cql2-text" | jq '.numberMatched'
```

NOT :

```bash
curl -s "http://localhost:3000/ogc/collections/bornes-fontaines/items?filter=NOT etat='inactif'&filter-lang=cql2-text" | jq '.numberMatched'
```

### 2.4 CQL2 — LIKE

```bash
curl -s "http://localhost:3000/ogc/collections/pistes-cyclables/items?filter=nom LIKE 'Boulevard%25'&filter-lang=cql2-text" | jq '.features[].properties.nom'
```

---

## 3. Filtres spatiaux

### 3.1 Bbox

Bbox sur les bornes-fontaines (OGC API Features Part 1) :

```bash
curl -s "http://localhost:3000/ogc/collections/bornes-fontaines/items?bbox=-73.60,45.50,-73.55,45.55" | jq '.numberMatched, .numberReturned'
```

Bbox sur les arrondissements :

```bash
curl -s "http://localhost:3000/ogc/collections/arrondissements/items?bbox=-73.65,45.45,-73.50,45.60" | jq '.numberReturned'
```

### 3.2 CQL2 — S_INTERSECTS

Chercher les features qui intersectent un polygone :

```bash
curl -s "http://localhost:3000/ogc/collections/bornes-fontaines/items?filter=S_INTERSECTS(geometry,POLYGON((-73.60 45.50,-73.55 45.50,-73.55 45.55,-73.60 45.55,-73.60 45.50)))&filter-lang=cql2-text" | jq '.numberMatched'
```

Sur les pistes cyclables :

```bash
curl -s "http://localhost:3000/ogc/collections/pistes-cyclables/items?filter=S_INTERSECTS(geometry,POLYGON((-73.60 45.50,-73.55 45.50,-73.55 45.55,-73.60 45.55,-73.60 45.50)))&filter-lang=cql2-text" | jq '.numberMatched'
```

### 3.3 CQL2 — S_WITHIN

Chercher les features entierement contenues dans un polygone :

```bash
curl -s "http://localhost:3000/ogc/collections/bornes-fontaines/items?filter=S_WITHIN(geometry,POLYGON((-73.65 45.45,-73.50 45.45,-73.50 45.60,-73.65 45.60,-73.65 45.45)))&filter-lang=cql2-text" | jq '.numberMatched'
```

### 3.4 CQL2 — S_DWITHIN

Chercher les features a moins de 500 metres d'un point :

```bash
curl -s "http://localhost:3000/ogc/collections/bornes-fontaines/items?filter=S_DWITHIN(geometry,POINT(-73.5673 45.5017),500,meters)&filter-lang=cql2-text" | jq '.numberMatched'
```

---

## 4. Tri (sortby)

Tri ascendant (par defaut) :

```bash
curl -s "http://localhost:3000/ogc/collections/bornes-fontaines/items?sortby=arrondissement" | jq '[.features[].properties.arrondissement]'
```

Tri descendant (prefixe `-`) :

```bash
curl -s "http://localhost:3000/ogc/collections/arrondissements/items?sortby=-population" | jq '[.features[] | {nom: .properties.nom, population: .properties.population}]'
```

Tri multi-champs :

```bash
curl -s "http://localhost:3000/ogc/collections/bornes-fontaines/items?sortby=arrondissement,-etat" | jq '[.features[] | {arrondissement: .properties.arrondissement, etat: .properties.etat}]'
```

Tri sur les pistes cyclables par longueur :

```bash
curl -s "http://localhost:3000/ogc/collections/pistes-cyclables/items?sortby=-longueur" | jq '[.features[] | {nom: .properties.nom, longueur: .properties.longueur}]'
```

---

## 5. Combinaisons

### Filtre + pagination

```bash
curl -s "http://localhost:3000/ogc/collections/bornes-fontaines/items?etat=actif&limit=5&offset=0" | jq '.numberMatched, .numberReturned'
```

### Filtre CQL2 + tri + pagination

```bash
curl -s "http://localhost:3000/ogc/collections/pistes-cyclables/items?filter=longueur>100&filter-lang=cql2-text&sortby=-longueur&limit=5" | jq '[.features[] | {nom: .properties.nom, longueur: .properties.longueur}]'
```

### Bbox + filtre + tri

```bash
curl -s "http://localhost:3000/ogc/collections/bornes-fontaines/items?bbox=-73.60,45.50,-73.55,45.55&etat=actif&sortby=arrondissement" | jq '[.features[] | {arrondissement: .properties.arrondissement, etat: .properties.etat}]'
```

### Filtre spatial CQL2 + filtre attributaire + pagination

```bash
curl -s "http://localhost:3000/ogc/collections/bornes-fontaines/items?filter=S_INTERSECTS(geometry,POLYGON((-73.60 45.50,-73.55 45.50,-73.55 45.55,-73.60 45.55,-73.60 45.50))) AND etat='actif'&filter-lang=cql2-text&limit=10" | jq '.numberMatched, .numberReturned'
```

---

## 6. Queryables

Lister les proprietes filtrables d'une collection :

```bash
curl -s "http://localhost:3000/ogc/collections/bornes-fontaines/queryables" | jq '.'
```

```bash
curl -s "http://localhost:3000/ogc/collections/pistes-cyclables/queryables" | jq '.'
```

```bash
curl -s "http://localhost:3000/ogc/collections/arrondissements/queryables" | jq '.'
```

Verifier que les champs triables sont exposes (`x-ogc-sortable`) :

```bash
curl -s "http://localhost:3000/ogc/collections/bornes-fontaines/queryables" | jq '.properties | to_entries[] | select(.value["x-ogc-sortable"]==true) | .key'
```

---

## 7. Cas d'erreur

### Filtre sur propriete non filtrable

```bash
curl -s -w "\n%{http_code}" "http://localhost:3000/ogc/collections/bornes-fontaines/items?filter=id=1&filter-lang=cql2-text"
# Attendu : 400
```

### Tri sur propriete non triable

```bash
curl -s -w "\n%{http_code}" "http://localhost:3000/ogc/collections/bornes-fontaines/items?sortby=etat"
# Attendu : 400 si etat n'est pas declare sortable
```

### filter-lang invalide

```bash
curl -s -w "\n%{http_code}" "http://localhost:3000/ogc/collections/bornes-fontaines/items?filter=etat='actif'&filter-lang=cql-invalid"
# Attendu : 400
```

### CQL2 syntaxe invalide

```bash
curl -s -w "\n%{http_code}" "http://localhost:3000/ogc/collections/bornes-fontaines/items?filter=AND AND AND&filter-lang=cql2-text"
# Attendu : 400
```

### Collection inexistante

```bash
curl -s -w "\n%{http_code}" "http://localhost:3000/ogc/collections/inexistante/items"
# Attendu : 404
```

### Limit negatif

```bash
curl -s -w "\n%{http_code}" "http://localhost:3000/ogc/collections/bornes-fontaines/items?limit=-1"
# Attendu : 400
```

### Offset negatif

```bash
curl -s -w "\n%{http_code}" "http://localhost:3000/ogc/collections/bornes-fontaines/items?offset=-5"
# Attendu : 400
```

---

## Notes

- Toutes les requetes supposent que le proxy tourne sur `http://localhost:3000` et que `docker compose up` est actif.
- Les coordonnees utilisees dans les exemples spatiaux ciblent la region de Montreal.
- Les valeurs de proprietes (`actif`, `Rosemont`, etc.) dependent des donnees du mock-api. Adapter selon les donnees reelles.
- Pour les collections WFS upstream (ex: `mrc-quebec`), les filtres CQL2 et le tri sont traduits en Filter XML et SortBy XML cote upstream.
- `jq` est utilise pour formater les reponses. Installer avec `sudo apt install jq` si necessaire.
