# Évaluation du Codebase — OGC Proxy Municipal

**Date :** 7 mars 2026
**Branche analysée :** `fix/review-suggestions`
**Dernière version du PRD :** 2.1

---

## 1. Résumé Exécutif

Le projet est un proxy OGC qui expose des APIs REST municipales hétérogènes sous forme de services OGC API – Features (Part 1 & 3) et WFS 1.1.0/2.0.0. Le code est structuré en monorepo TypeScript avec 3 packages : `proxy` (cœur), `mock-api` (simulation upstream), et `conformance-tests` (tests d'intégration).

**Verdict global :** Le codebase est de bonne qualité pour ce projet. L'architecture est claire, les choix techniques sont cohérents avec le PRD, et la couverture de tests est remarquablement complète pour ce stade. Quelques points méritent attention avant la mise en production.

---

## 2. Vue Fonctionnelle

### 2.1 Couverture du PRD

| Exigence PRD | Statut | Commentaire |
|---|---|---|
| RF-1 Landing Page | Complet | `/ogc/` avec liens corrects |
| RF-2 Liste des collections | Complet | Inclut CRS, liens |
| RF-3 Détail collection | Complet | Titre, description, CRS |
| RF-4 Queryables (Part 3) | Complet | Génération depuis config, inclut `x-ogc-sortable` |
| RF-5 Items + pagination | Complet | offset/limit, next/prev links, numberMatched/Returned |
| RF-6 Item unique | Complet | Avec liens self/collection |
| RF-7 JSON → GeoJSON | Complet | Point, LineString, Polygon (x/y, coords, WKT) |
| RF-8 Registry déclaratif | Complet | YAML avec substitution env vars, validation Zod |
| RF-9 Adapter pattern | Complet | 3 stratégies pagination + WFS upstream |
| RF-10 WFS | Complet | GetCapabilities (1.1.0/2.0.0), DescribeFeatureType, GetFeature |
| RF-11 Auth JWT | Partiel | Middleware créé, mode dev (bypass) fonctionnel |

### 2.2 Fonctionnalités au-delà du PRD

- **CQL2-text complet** : Le parser CQL2 est très abouti — comparaisons, LIKE, IN, BETWEEN, IS NULL, opérateurs logiques, opérateurs spatiaux (S_INTERSECTS, S_WITHIN, S_DWITHIN, S_CONTAINS, S_CROSSES, S_TOUCHES, S_DISJOINT, S_EQUALS). Ceci dépasse le scope V3 du PRD.
- **WFS Filter Encoding XML** : Parsing complet des filtres OGC XML vers l'AST CQL2 interne pour évaluation post-fetch.
- **Reprojection EPSG:3857** : Implémentée pour le WFS GetFeature, non mentionnée dans le PRD (CRS unique).
- **Système de plugins** : Architecture extensible avec hooks (transformRequest, transformFeature, transformResponse, etc.).
- **Extraction bbox depuis CQL2** : Optimisation qui extrait automatiquement les bbox des prédicats spatiaux CQL2 pour les passer upstream.
- **Post-fetch filtering** : Mécanisme intelligent qui fetch plus de données (×10, cap maxPostFetchItems) quand un filtre post-fetch est nécessaire.

### 2.3 Fonctionnalités manquantes (vs PRD V5)

- **Extent spatial** dans les réponses `/collections/{id}` — la config contient `extent.spatial` mais la réponse JSON ne l'expose pas.
- **OpenAPI `/api`** — retourne un squelette vide (`paths: {}`).
- **Cache léger (ETag)** — non implémenté.
- **Rate limiting par upstream** — le rate limiting est global (express-rate-limit), pas par upstream comme recommandé (R3).
- **Logs structurés d'accès** — présents mais basiques (pas de request-id dans les logs d'accès, bien que correlation-id soit configuré).
- **`/ready` endpoint** — seul `/health` existe.

---

## 3. Vue Architecture

### 3.1 Structure du projet

```
ogc-proxy-poc/
├── packages/
│   ├── proxy/          (~2960 lignes source, ~1010 lignes tests)
│   │   ├── src/
│   │   │   ├── app.ts           — Bootstrap Express
│   │   │   ├── index.ts         — Entry point + graceful shutdown
│   │   │   ├── logger.ts        — Logging structuré (VDM logger)
│   │   │   ├── auth/jwt.ts      — Middleware JWT
│   │   │   ├── engine/          — Cœur métier
│   │   │   │   ├── types.ts     — Schémas Zod + types inférés
│   │   │   │   ├── registry.ts  — Chargement YAML, cache
│   │   │   │   ├── adapter.ts   — Fetch upstream (3 paginations + WFS)
│   │   │   │   ├── geojson-builder.ts — Transformation JSON→GeoJSON
│   │   │   │   ├── plugin.ts    — Système de plugins
│   │   │   │   ├── limits.ts    — Contrôle pagination
│   │   │   │   ├── sorting.ts   — Tri upstream
│   │   │   │   └── cql2/        — Parser + évaluateur CQL2
│   │   │   ├── ogc/             — Routes OGC API Features
│   │   │   ├── wfs/             — Routes WFS
│   │   │   ├── plugins/         — Plugins built-in
│   │   │   └── utils/           — Utilitaires
│   │   └── config/collections.yaml
│   ├── mock-api/       (~260 lignes)
│   └── conformance-tests/ (~1880 lignes tests)
```

### 3.2 Points forts architecturaux

- **Séparation nette des responsabilités** : engine (cœur) / ogc (couche HTTP OGC) / wfs (couche HTTP WFS) / plugins. Le WFS et l'OGC API partagent le même engine, comme recommandé dans le PRD (R6).
- **Registry déclaratif avec validation Zod** : Les schémas sont stricts et les types sont inférés (`z.infer`), ce qui donne un bon typage de bout en bout.
- **Substitution de variables d'environnement** : Le registry supporte `${VAR}` dans les valeurs YAML — utile pour la config par environnement.
- **Adapter pattern multi-pagination** : Support propre de offset/limit, page/pageSize, et cursor — chaque stratégie est isolée.
- **Plugin system avec hooks** : Architecture extensible qui permet de transformer requêtes et réponses à différentes étapes du pipeline.
- **Module CQL2 self-contained** : Lexer → Parser → Evaluateur → Bbox Extractor, bien structuré et barrel-exporté.

### 3.3 Points de vigilance architecturaux

- **Couplage `items.ts` (428 lignes)** : Ce fichier est le plus gros du projet et concentre trop de responsabilités : parsing de requête, construction de filtres, fetch upstream, application des filtres post-fetch, construction de la réponse. Un refactoring en pipeline serait bénéfique.
- **`capabilities.ts` (267 lignes)** : Le XML est construit par concaténation de templates strings. Fragile et difficile à maintenir. Un template engine ou un builder XML serait plus robuste.
- **Singleton registry** : Le registry utilise un `let registry` module-level avec lazy loading. Fonctionnel mais rend le testing plus complexe et empêche la multi-instance.
- **Plugin cache sans invalidation** : `pluginCache` dans `registry.ts` n'a pas de mécanisme d'invalidation — acceptable pour ce projet, problématique si le hot-reload du registry est envisagé.
- **Pas de couche service** : Les handlers Express font directement les appels métier. L'ajout d'une couche service faciliterait le testing et la réutilisation.

### 3.4 Dépendances

| Dépendance | Usage | Évaluation |
|---|---|---|
| Express 4 | HTTP framework | Mature, bon choix |
| Zod 4 | Validation schema | Excellent choix pour la validation config |
| Turf.js (8 modules) | Opérations spatiales | Standard, bien choisi |
| fast-xml-parser | Parsing XML (WFS POST) | Performant, bon choix |
| helmet | Sécurité HTTP headers | Standard |
| express-rate-limit | Rate limiting | Basique (in-memory), suffisant pour le moment |
| yaml | Parsing YAML | Standard |
| @villedemontreal/* | Logger, JWT, Correlation ID | Packages internes VDM, cohérent |

**Nombre de dépendances directes :** 16 (raisonnable).
**Pas de dépendance inutile observée.**

---

## 4. Vue Développeur

### 4.1 Expérience développeur (DX)

- **Monorepo npm workspaces** : Simple et fonctionnel, pas besoin de Turborepo/Nx pour cette taille.
- **Scripts cohérents** : `dev:mock`, `dev:proxy`, `test:unit`, `test:conformance` — clair et bien organisé.
- **Hot-reload** : `tsx watch` pour le dev — bon choix.
- **TypeScript strict** : `strict: true` partout, bon typage.
- **ESM natif** : `"type": "module"` avec `moduleResolution: Node16` — moderne et correct.

### 4.2 Points d'amélioration DX

- **Pas de `.env.example`** : Les variables d'environnement nécessaires (`UPSTREAM_HOST`, `JWT_HOST`, etc.) ne sont documentées nulle part sauf dans le YAML.
- **Pas de README** : Aucun README.md à la racine ni dans les packages. Un développeur qui arrive sur le projet n'a aucun guide de démarrage.
- **`dist/` dans le repo** : Le dossier `packages/mock-api/dist/` est versionné (présent dans le Glob). Le `.gitignore` a `dist/` mais il semble que certains fichiers compilés aient été committés.
- **Pas de linter/formatter configuré** : Pas d'ESLint, pas de Prettier. Le code est néanmoins consistant — probablement grâce à l'outillage IDE.
- **Pas de pre-commit hooks** : Pas de husky/lint-staged pour garantir la qualité avant commit.

### 4.3 Qualité du code

- **Style cohérent** : Indentation 2 espaces, nommage clair, JSDoc présent sur les fonctions clés.
- **Fonctions small & focused** : La plupart des fonctions ont une responsabilité unique (sauf `getItems`).
- **Gestion d'erreurs** : Correcte avec des types d'erreur custom (`UpstreamError`, `UpstreamTimeoutError`) et des codes HTTP appropriés (404, 400, 502, 504).
- **Pas de `any` excessif** : Quelques `as any` dans l'evaluateur CQL2 (passage de types GeoJSON à Turf), acceptables.
- **`buildFeatureSafe`** : Pattern silencieux qui avale les erreurs — acceptable pour la robustesse mais masque les problèmes de mapping.

---

## 5. Vue Tests

### 5.1 Stratégie de test

Le projet utilise une **double stratégie** remarquable :

1. **Tests unitaires** (1008 lignes, `packages/proxy/`) : Tests de chaque module engine isolément avec mocks.
2. **Tests de conformance** (1880 lignes, `packages/conformance-tests/`) : Tests d'intégration end-to-end qui démarrent mock-api + proxy et valident la conformité OGC.

**Ratio test/code :** ~1:1 (2888 lignes de tests pour 2958 lignes de source). Excellent pour ce projet.

### 5.2 Couverture des tests unitaires

| Module | Testé | Qualité |
|---|---|---|
| `adapter.ts` | Oui (190 lignes) | 3 stratégies pagination, erreurs, timeout, validation upstream |
| `geojson-builder.ts` | Oui (124 lignes) | Point/LineString/Polygon, pagination links, numberMatched |
| `limits.ts` | Oui (44 lignes) | Cap, reject, suppressNext |
| `sorting.ts` | Oui (60 lignes) | Parse, validate, buildUpstream |
| `plugin.ts` | Oui (44 lignes) | Load, runHook |
| `registry.ts` | Oui (138 lignes) | Load, env vars, Zod validation |
| `cql2/lexer.ts` | Oui (66 lignes) | Tokenization |
| `cql2/parser.ts` | Oui (120 lignes) | AST construction |
| `cql2/evaluator.ts` | Oui (94 lignes) | Évaluation de filtres |
| `cql2/bbox-extractor.ts` | Oui (42 lignes) | Extraction bbox |
| `auth/jwt.ts` | Oui (33 lignes) | Noop, disabled, missing host |
| `plugins/wfs-upstream.ts` | Oui (53 lignes) | Transform, skipGeojsonBuilder |

### 5.3 Couverture des tests de conformance

| Domaine | Fichiers tests | Lignes |
|---|---|---|
| OGC Core (landing, conformance, collections, items, http, errors) | 6 | 459 |
| OGC Filtering (queryables, query-params, bbox, CQL2 basic/advanced/spatial, filter-lang) | 7 | 464 |
| OGC Sorting | 1 | 41 |
| OGC WFS upstream | 1 | 39 |
| WFS 1.1.0 (capabilities, describe, get-feature, filter-encoding) | 4 | 527 |
| WFS 2.0.0 (capabilities, describe, get-feature, filter-encoding, version-negotiation) | 5 | 339 |

### 5.4 Points forts des tests

- **Tests de conformité OGC rigoureux** : Vérifient la structure GeoJSON, les content-types, les links, les codes HTTP, la pagination, les filtres — très proche d'une suite de conformance officielle.
- **Tests WFS complets** : Couvrent les deux versions (1.1.0 et 2.0.0), le XML des capabilities, le DescribeFeatureType, le GetFeature avec filtres, la reprojection.
- **Tests CQL2 exhaustifs** : Comparaisons, LIKE, IN, BETWEEN, IS NULL, AND/OR/NOT, opérateurs spatiaux (S_INTERSECTS, S_WITHIN, S_DWITHIN).
- **Global setup automatique** : Les tests de conformance démarrent automatiquement mock-api et proxy — zéro config manuelle.

### 5.5 Lacunes des tests

- **Pas de tests pour `items.ts`** : Le fichier le plus complexe (428 lignes) n'a pas de tests unitaires dédiés. Il est couvert indirectement par les tests de conformance, mais les cas limites (post-fetch filter avec over-fetch, suppressNext, OGC-Warning header, plugin hooks dans le contexte items) ne sont pas testés unitairement.
- **Pas de tests pour les handlers OGC** (`landing.ts`, `collections.ts`, `queryables.ts`, `conformance.ts`) : Couverts par les tests de conformance mais sans tests unitaires isolés.
- **Pas de tests pour `capabilities.ts`** (WFS XML generation) : Testé en conformance mais le XML template n'est pas validé contre un XSD.
- **Pas de tests pour `filter-encoding.ts`** unitairement : Testé indirectement via les tests de conformance WFS.
- **Pas de tests de performance** : Le PRD cible < 1.5s pour 10 000 features, aucun benchmark n'existe.
- **Pas de tests pour le graceful shutdown** (`index.ts`).
- **Mock API avec données limitées** : 15 bornes-fontaines, quelques pistes cyclables et arrondissements. Insuffisant pour tester la pagination à grande échelle.

---

## 6. Vue Sécurité

### 6.1 Points positifs

- **Helmet** : Headers de sécurité HTTP configurés.
- **Rate limiting** : Présent (express-rate-limit), configurable par env vars.
- **Validation d'entrée** : `MAX_FILTER_LENGTH = 4096` pour les filtres CQL2, profondeur max du parser (`MAX_DEPTH = 20`).
- **Pas d'exposition de données sensibles** : `buildProperties` ne retourne que les propriétés déclarées dans la config — les champs upstream non mappés sont exclus.
- **URL redaction** : Les URLs upstream sont redactées dans les logs (`redactUrl` supprime les query params).
- **Messages d'erreur génériques** : Les erreurs upstream retournent `"An upstream error occurred"` sans détails internes.
- **CORS activé** : Via le middleware `cors()`.
- **Validation Zod stricte** : La config YAML est validée au démarrage — une config invalide empêche le boot.
- **Substitution d'env vars contrôlée** : Regex `\$\{(\w+)\}` — seuls les noms de variables alphanumériques sont acceptés.
- **JSON body limit** : `express.json({ limit: '100kb' })` et `express.text({ limit: '100kb' })`.
- **Input sanitization** : `processEntities: false` dans le XML parser (fast-xml-parser) — prévient les attaques XXE.

### 6.2 Points de vigilance

- **CORS ouvert** : `cors()` sans configuration = tous les origins sont autorisés. Acceptable en developpement, à restreindre en production.
- **Pas de validation des paramètres de requête** : Les query params (`collectionId`, `featureId`) sont utilisés directement sans sanitization (ex: dans les messages d'erreur JSON). Bien que le JSON encoding protège contre le XSS, c'est une bonne pratique de valider.
- **Rate limit in-memory** : Ne fonctionne pas en cluster/multi-instance. Nécessitera un store externe (Redis) en production.
- **JWT non testé en mode activé** : Seul le mode désactivé est testé. Le middleware JWT activé n'a pas de test (dépend de `@villedemontreal/jwt-validator`).
- **XML template injection potentielle** : Les titres et descriptions des collections sont injectés directement dans le XML WFS capabilities sans échappement XML. Un titre contenant `<script>` ou des entités XML serait injecté tel quel.
- **Pas de timeout global Express** : Seuls les appels upstream ont un timeout. Une requête qui fait beaucoup de post-processing (gros CQL2 spatial) pourrait bloquer le thread.

---

## 7. Vue Qualité & Maintenabilité

### 7.1 Métriques

| Métrique | Valeur | Évaluation |
|---|---|---|
| Lignes de code source | 2 958 | Compact |
| Lignes de tests | 2 888 | Ratio ~1:1 |
| Fichiers source (hors tests) | 22 | Gérable |
| Fichiers test | 24 | Bon |
| Dépendances directes | 16 | Raisonnable |
| Plus gros fichier | `items.ts` (428 lignes) | À surveiller |
| Couverture fonctionnelle PRD | ~90% | Très bon pour ce projet |

### 7.2 Points de qualité

- **Nommage clair** : Les noms de fichiers, fonctions et variables sont explicites et cohérents.
- **Pas de code mort** : Le codebase est propre, pas de fonctions inutilisées visibles.
- **Types stricts** : TypeScript strict avec Zod pour la validation runtime.
- **Barrel exports** : Utilisés pour le module CQL2 (`index.ts`).
- **Graceful shutdown** : Implémenté avec timeout et drain de connexions.
- **Logging structuré** : Loggers nommés par domaine (app, adapter, items, wfs, registry).
- **Error types custom** : `UpstreamError` et `UpstreamTimeoutError` avec contexte.

### 7.3 Dette technique identifiée

1. **`items.ts` monolithique** : Refactoring nécessaire avant d'ajouter de la complexité (cache, rate limit upstream, etc.).
2. **XML par template strings** : Les capabilities WFS 1.1.0 et 2.0.0 sont des strings de 130+ lignes chacune. Duplication significative entre les deux versions.
3. **`dist/` dans le repo** : Artefacts de build committé dans `packages/mock-api/dist/`.
4. **Pas de README** : Onboarding difficile pour un nouveau développeur.
5. **OpenAPI vide** : L'endpoint `/api` retourne un squelette — ne sert à rien en l'état.
6. **`evaluateFilter` avec loose equality** (`==` et `!=`) : Documenté par un commentaire mais potentiellement source de bugs subtils (ex: `0 == ""` → `true`).
7. **Reprojection manuelle** : La fonction `lonLatTo3857` est une implémentation simplifiée. Pour la production, utiliser proj4 ou une bibliothèque dédiée.

---

## 8. Alignement avec la Roadmap

| Version PRD | Objectif | Statut actuel |
|---|---|---|
| V1 Hello QGIS | 1 collection, pagination, GeoJSON | **Dépassé** — 4 collections, 3 types géométrie |
| V2 Multi-collections | Registry YAML, adapters | **Dépassé** — 3 paginations + WFS upstream |
| V3 Filtres + WFS | Filtres, bbox, queryables, WFS | **Dépassé** — CQL2 complet, WFS 1.1.0/2.0.0 |
| V4 Auth Entra | JWT, JWKS, scopes | **Partiel** — Middleware JWT prêt, non activé |
| V5 Production ready | OpenAPI, erreurs OGC, rate limit upstream, cache | **Partiel** — Erreurs OGC ok, reste à faire |

Le projet est en avance sur sa roadmap pour les aspects fonctionnels (V1-V3 complets), mais les aspects production-readiness (V4-V5) restent à compléter.

---

## 9. Recommandations Prioritaires

### Critiques (avant production)

1. **Échapper les valeurs XML** dans `capabilities.ts` — les titres/descriptions de collections injectés dans le XML doivent être échappés pour prévenir l'injection XML.
2. **Restreindre CORS** — configurer les origins autorisés.
3. **Tester le JWT en mode activé** — ajouter des tests d'intégration avec JWT.
4. **Ajouter un README** avec instructions de démarrage, variables d'environnement, architecture.

### Importantes (qualité)

5. **Refactorer `items.ts`** — extraire le parsing de requête, le pipeline de fetch, et l'application des filtres en modules séparés.
6. **Supprimer `dist/` du repo** — vérifier le `.gitignore` et nettoyer l'historique.
7. **Exposer `extent` dans la réponse collections** — la config le supporte, la réponse devrait l'inclure.
8. **Ajouter des tests unitaires pour `items.ts`** — couvrir les cas limites du post-fetch filtering.
9. **Configurer ESLint + Prettier** — garantir la cohérence à mesure que l'équipe grandit.

### Souhaitables (améliorations)

10. **Rate limiting par upstream** — implémenter un token bucket par collection upstream.
11. **Implémenter `/ready`** — distinguer liveness (`/health`) et readiness (`/ready`).
12. **Compléter l'OpenAPI** — générer le spec depuis les routes ou le supprimer.
13. **Ajouter un `.env.example`** — documenter les variables d'environnement requises.

---

## 10. Conclusion

Ce projet est remarquablement bien exécuté. L'architecture est claire et extensible, les choix techniques sont solides, et la couverture de tests (unitaires + conformance OGC) est exemplaire. Le projet dépasse déjà les objectifs V1-V3 du PRD.

Les principaux axes d'amélioration concernent la production-readiness : sécurité XML, CORS, JWT activé, documentation, et le refactoring de `items.ts`. La dette technique est faible et bien contenue. Le codebase est en excellent état pour passer à l'étape suivante de la roadmap.
