# PRD — OGC API – Features Proxy Municipal

**Version 2.1** — Intégrant les recommandations d'architecture
Mars 2026 — Document confidentiel, usage interne

---

## 1. Vision Produit

Offrir une interface GIS commune et standardisée aux APIs « maison » de l'organisation. Le proxy expose ces APIs hétérogènes sous forme de services OGC API – Features et WFS, permettant leur consommation directe par :

- **QGIS** (via le plugin OAuth2) pour les analystes SIG
- **MapStore** (via WFS) pour la cartographie web
- **Applications internes** (Angular, React, etc.) via OGC API – Features (REST/JSON)

Le proxy devient une brique d'urbanisation géospatiale municipale : un point d'entrée unique, standardisé et sécurisé pour toutes les données géographiques internes.

---

## 2. Contexte

La ville possède plusieurs APIs REST internes dont les structures sont non uniformes et incompatibles avec les standards OGC :

| Contrainte | Situation |
|---|---|
| Format | JSON custom (pas GeoJSON) |
| Structure | Non uniforme entre APIs |
| Pagination | Hétérogène (offset/limit, page/pageSize, cursor) |
| Filtres | Supportés côté serveur |
| CRS | Unique et stable |
| Authentification | JWT via Microsoft Entra ID |

Ces APIs nécessitent une couche de traduction pour devenir compatibles OGC.

---

## 3. Objectifs Stratégiques

### 3.1 Objectif principal

Offrir une interface GIS commune aux APIs « maison » de l'organisation, permettant leur utilisation transparente dans QGIS, MapStore et les applications web internes (Angular, React, etc.).

### 3.2 Objectifs secondaires

- Centraliser la normalisation géospatiale des API internes
- Créer un moteur de mapping réutilisable
- Standardiser la sécurité via JWT Entra ID (plugin OAuth2 QGIS)
- Faciliter l'intégration des données géospatiales dans les applications web maison
- Réduire la dette technique liée aux intégrations SIG ad hoc
- Assurer la compatibilité MapStore via WFS
- Préparer la transition vers OGC API Tiles et CQL2

---

## 4. Scope du Produit

### 4.1 Inclus

- OGC API – Features Core (Part 1)
- WFS (GetCapabilities, DescribeFeatureType, GetFeature) pour compatibilité MapStore
- JSON → GeoJSON transformation
- Registry déclaratif des collections (YAML)
- Adapter pattern par famille d'API
- Normalisation de pagination hétérogène (offset/limit, page/pageSize, cursor) vers OGC standard
- Filtres attributaires simples + bbox
- Endpoint `/queryables` par collection (Part 3 — dès V3)
- Rate limiting par upstream dans le proxy
- Authentification JWT Entra ID (compatible plugin OAuth2 QGIS)
- Compatible QGIS, MapStore et applications web (Angular, React, etc.)

### 4.2 Hors scope initial

- WFS-T (transactions / écriture)
- Reprojection multi-CRS
- CQL2 complet
- Jointures entre collections
- Cache distribué avancé
- Multi-tenant complexe

---

## 5. Personas

| Persona | Besoin principal |
|---|---|
| Analyste SIG | Charger et filtrer des couches dans QGIS (via plugin OAuth2) sans configuration custom |
| Développeur web | Consommer les données géospatiales dans des applications Angular, React, etc. via OGC API – Features (REST/JSON) |
| Architecte SI | Standardiser les APIs géospatiales internes, réduire les intégrations ad hoc |
| Développeur backend | Ajouter une nouvelle collection via config YAML sans modifier le code ou presque pas (ex: fonction de mapping) |
| Équipe MapStore | Utiliser les couches via WFS dans MapStore sans développement custom |

---

## 6. Architecture Produit

### 6.1 Modèle général

Le proxy intercepte les requêtes OGC, les traduit en appels REST upstream via un système d'adapters, et retourne du GeoJSON standard :

```
QGIS (OAuth2)      ─┐
MapStore (WFS)      ─┤→  /ogc/*  →  Mapping Engine  →  Adapter  →  API JSON Municipale
App web (Angular…)  ─┘   /wfs/*
```

### 6.2 Préfixe de route

Le proxy utilise le préfixe `/ogc` pour cohabiter proprement avec d'autres routes (health check, admin, métriques). L'URL de base configurée dans QGIS pointe vers `https://proxy.ville.ca/ogc`.

> **Recommandation :** Vérifier la compatibilité du préfixe `/ogc` avec QGIS dès V1. QGIS utilise l'URL de base complète, donc pas de problème attendu, mais un test rapide évite les surprises.

### 6.3 Registry + Adapters

#### 6.3.1 Registry déclaratif

Chaque collection est décrite dans un fichier YAML qui spécifie : l'URL upstream, la méthode HTTP, les headers, le mapping pagination (offset/limit), le mapping des filtres (OGC → REST), la construction de la géométrie, le champ ID, et le rate limit upstream.

#### 6.3.2 Adapter pattern

Un adapter TypeScript par famille d'API gère la construction de la requête REST (query builder), le parsing de la réponse (items + total), et la transformation en Feature GeoJSON. La config YAML fait 80% du travail ; l'adapter gère les cas non uniformes.

> **Recommandation — Rate limit par upstream :** Prévoir un champ `rateLimit` dans le registry YAML pour chaque collection upstream. Certaines APIs municipales ont des limites basses, et QGIS fait du paging agressif (requêtes parallèles). Un token bucket par upstream dans le proxy évitera les blocages en production.

### 6.4 Modèle de données interne

Toutes les réponses upstream sont standardisées en un modèle interne simple :

```typescript
type UpstreamPage<T> = {
  items: T[];
  total?: number; // si l'API le fournit
};
```

Puis normalisées en GeoJSON : `FeatureCollection` avec `features[]`, `links[]` (pagination OGC), `numberMatched` et `numberReturned`.

> **Recommandation — numberMatched / numberReturned :** QGIS utilise `numberMatched` et `numberReturned` pour la barre de progression. Si une API upstream ne fournit pas le total, QGIS affiche un chargement sans fin apparent. Documenter dans le registry quelles APIs fournissent le count (`hasTotal: true/false`) et gérer le cas gracieusement côté réponse OGC.

---

## 7. Exigences Fonctionnelles

### RF-1 — Landing Page

`GET /ogc/`

Retourne les métadonnées du service, la version et les liens vers `/collections` et `/api`.

### RF-2 — Liste des collections

`GET /ogc/collections`

Retourne la liste des collections configurées avec CRS, extent spatial (si disponible) et métadonnées.

### RF-3 — Détail d'une collection

`GET /ogc/collections/{collectionId}`

Inclut titre, description, CRS, extent et paramètres de requête supportés.

### RF-4 — Queryables (dès V3)

`GET /ogc/collections/{collectionId}/queryables`

Expose le schéma des filtres disponibles par collection, conformément à OGC API Features Part 3. Cela permet aux clients de découvrir dynamiquement les attributs filtrables sans documentation externe.

> **Recommandation — Queryables dès V3 :** QGIS ne découvre pas les filtres magiquement — sans queryables, les utilisateurs doivent savoir quoi filtrer. Générer le queryables depuis le mapping de filtres du registry YAML.

### RF-5 — Items d'une collection

`GET /ogc/collections/{collectionId}/items`

| Paramètre | Description | Mapping |
|---|---|---|
| `limit` | Nombre max d'items | Pass-through vers upstream |
| `offset` | Décalage pagination | Traduit vers offset/limit, page/pageSize ou cursor selon l'upstream |
| `bbox` | Filtre spatial | Selon config (bbox ou xmin,ymin,xmax,ymax) |
| attributs | Query string simple | Mapping OGC param → REST param via config |

Retourne une `FeatureCollection` GeoJSON avec `links` (next/prev), `numberMatched` (si upstream fournit total) et `numberReturned`.

### RF-6 — Item unique

`GET /ogc/collections/{collectionId}/items/{id}`

### RF-7 — Transformation JSON → GeoJSON

Le proxy construit la géométrie (Point, LineString, Polygon) selon la config du registry, mappe les propriétés, définit l'ID et assure la validité GeoJSON. Trois patterns de géométrie sont supportés : Point par xField/yField, géométrie WKT, et objet géométrie déjà encodé (coords/geom).

### RF-8 — Registry déclaratif

Les collections sont configurables via YAML : URL upstream, méthode HTTP, headers, mapping pagination, mapping filtres, geometry builder, champ ID, mapping propriétés, rate limit upstream et indicateur `hasTotal`.

### RF-9 — Adapter pattern

Chaque famille d'API a un adapter dédié qui construit la requête REST, parse la réponse et transforme en Feature(s). Le contrat d'adapter est stable et extensible.

### RF-10 — WFS (compatibilité MapStore)

Le proxy expose un endpoint WFS en lecture seule pour assurer la compatibilité avec MapStore :

| Opération | Description |
|---|---|
| `GetCapabilities` | Liste des couches disponibles et capacités du service |
| `DescribeFeatureType` | Schéma des attributs par couche |
| `GetFeature` | Récupération des features (GML/GeoJSON) avec filtres et pagination |

Le WFS réutilise le même registry YAML et les mêmes adapters que l'OGC API – Features. La couche WFS est un « façade » au-dessus du même moteur de mapping.

### RF-11 — Authentification

- Validation JWT locale (compatible plugin OAuth2 QGIS)
- Vérification signature via JWKS
- Vérification audience
- Vérification scopes
- Mode dev optionnel (bypass auth)

---

## 8. Exigences Non Fonctionnelles

### 8.1 Performance

- Temps de réponse < 1.5s pour 10 000 features
- Pagination obligatoire au-delà de 1 000 features
- Rate limiting par upstream pour protéger les APIs internes

### 8.2 Sécurité

- Validation signature JWT (pas d'exposition directe des APIs internes)
- Logs d'accès structurés
- Aucune donnée sensible dans les logs

### 8.3 Extensibilité

- Ajouter une collection sans modifier le code (YAML uniquement dans 80% des cas)
- Adapter extensible et découplé
- Pas de couplage fort entre collections

### 8.4 Observabilité

- Logs structurés (JSON)
- Corrélation request-id de bout en bout
- Monitoring endpoints (`/health`, `/ready`)

---

## 9. Contraintes Techniques

| Élément | Décision |
|---|---|
| CRS | Unique — pas de reprojection V1–V3 |
| Pagination | Normalisation multi-stratégie → OGC offset/limit |
| Filtres | Mapping simple OGC → REST via config |
| Structure API | Hétérogène — adapter requis |
| Préfixe route | `/ogc` pour cohabitation avec autres services |

---

## 10. Hypothèses

- Les APIs upstream restent stables dans leur contrat
- Les filtres upstream couvrent les besoins principaux des analystes
- Le CRS ne changera pas à court terme
- QGIS supporte sans problème un préfixe d'URL arbitraire

---

## 11. Risques

| Risque | Impact | Mitigation |
|---|---|---|
| API upstream change de format | Élevé | Adapter isolé par API, tests de régression |
| Données volumineuses | Moyen | Pagination stricte, limit par défaut |
| Mauvais mapping géométrie | Moyen | Validation GeoJSON stricte dans l'adapter |
| Rate limit upstream atteint | Moyen | Token bucket par upstream dans le proxy |
| QGIS chargement infini (pas de total) | Faible | Indicateur hasTotal dans le registry, gestion gracieuse |

---

## 12. Critères de Succès

**V1 — Hello QGIS :** QGIS charge 1 collection et affiche les features sur la carte. Pagination fonctionnelle avec links next/prev.

**V3 — Filtres + WFS :** Filtres attributaires fonctionnels via query string. bbox fonctionnel. `/queryables` expose les filtres disponibles. WFS opérationnel et validé avec MapStore.

**V5 — Production :** Auth Entra fonctionnelle et validée (plugin OAuth2 QGIS). Multi-collections (5+) en production. Stable sous charge. Utilisé par les analystes SIG, MapStore et les applications web internes.

---

## 13. Roadmap Produit

| Version | Objectif | Livrables clés |
|---|---|---|
| V1 | Hello QGIS | 1 collection, /collections, /items, pagination, GeoJSON minimal |
| V2 | Framework multi-collections | Registry YAML, 3 collections, adapters par API, /collections/{id} + extent |
| V3 | Requêtes utiles + WFS | Filtres attributaires, bbox, /queryables, façade WFS (GetCapabilities, DescribeFeatureType, GetFeature) pour MapStore |
| V4 | Auth Entra | Validation JWT, JWKS, scopes par collection, plugin OAuth2 QGIS, mode dev, logs structurés |
| V5 | Production ready | OpenAPI /api, gestion erreurs OGC, rate limiting upstream, cache léger (ETag) |
| V6 | Enterprise + Tiles | OGC API Tiles, CQL2 partiel, Open Data |

---

## 14. Positionnement Stratégique

Ce proxy devient :

- Une **interface GIS commune** aux APIs « maison » de l'organisation
- Un standard interne de diffusion géospatiale (OGC API + WFS)
- Un point d'entrée unique pour toutes les données géographiques internes
- Un facilitateur d'intégration pour QGIS, MapStore et les applications web maison
- Une base pour l'Open Data futur

---

## 15. Décisions d'Architecture Clés

| Décision | Justification |
|---|---|
| OGC API – Features + WFS | OGC API pour QGIS et apps web ; WFS pour compatibilité MapStore |
| Registry YAML + Adapter TS | 80% config / 20% code, extensible sans modifier le cœur |
| Normalisation pagination | L'adapter traduit OGC offset/limit vers le mécanisme natif de chaque API upstream (offset/limit, page/pageSize, cursor) |
| CRS unique | Simplification massive, pas de reprojection nécessaire |
| Auth JWT locale | Pas de dépendance sur un gateway externe en V1-V3 |
| Préfixe /ogc | Cohabitation propre avec health checks, admin, métriques |
| /queryables dès V3 | Découverte dynamique des filtres pour QGIS et autres clients |
| Rate limit par upstream | Protection des APIs internes contre le paging agressif de QGIS |

---

## 16. KPI

| KPI | Cible V5 |
|---|---|
| Nombre de collections exposées | 5+ |
| Temps moyen de réponse (p95) | < 1.5s |
| Adoption par équipes SIG | 3+ équipes utilisatrices (QGIS) |
| Adoption par applications web | 2+ applications Angular/React consommant l'API |
| Compatibilité MapStore | WFS validé et fonctionnel |
| Réduction des intégrations custom | 50% des flux géospatiaux via proxy |
| Temps d'ajout d'une collection | < 1 heure (YAML uniquement) |

---

## 17. Récapitulatif des Recommandations

Les recommandations suivantes ont été intégrées dans ce PRD suite à la revue d'architecture :

| # | Recommandation | Impact | Version |
|---|---|---|---|
| R1 | Ajouter `hasTotal` dans le registry pour gérer numberMatched/numberReturned | UX QGIS (barre de progression) | V1 |
| R2 | Ajouter `/queryables` (OGC Part 3) pour la découverte des filtres | Découverte dynamique des filtres | V3 |
| R3 | Ajouter `rateLimit` par collection upstream dans le registry | Protection APIs internes | V2 |
| R4 | Utiliser le préfixe `/ogc` et valider avec QGIS en V1 | Cohabitation propre | V1 |
| R5 | Documenter dans le registry quelles APIs fournissent le count | Observabilité, débogage | V1 |
| R6 | Façade WFS réutilisant le même moteur que OGC API (pas de duplication) | Compatibilité MapStore, maintenabilité | V3 |

---

*Fin du document — Version 2.1 — Mars 2026*