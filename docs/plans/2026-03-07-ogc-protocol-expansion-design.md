# Design: Extension du support des protocoles OGC

**Date:** 2026-03-07
**Statut:** Approuve

## Objectif

Augmenter le support des protocoles OGC (lecture/recherche uniquement) sur 4 axes :

1. CQL2 : operateurs IN, BETWEEN, IS NULL
2. WFS 2.0 DescribeFeatureType (tests + documentation)
3. WFS Filter Encoding / FES (filtres XML dans les requetes WFS)
4. Fonctions spatiales additionnelles (S_CONTAINS, S_CROSSES, S_TOUCHES, S_DISJOINT, S_EQUALS)

Exclusions : ecriture, transactions, locking, StoredQueries.

## Architecture

### 1. CQL2 : IN, BETWEEN, IS NULL

Extension du pipeline CQL2 existant (`packages/proxy/src/engine/cql2/`).

**Lexer** — Ajouter `IN`, `BETWEEN`, `IS`, `NULL` aux keywords.

**Types** — Trois nouveaux noeuds AST :

```typescript
interface CqlIn {
  type: 'in';
  property: string;
  values: (string | number)[];
}

interface CqlBetween {
  type: 'between';
  property: string;
  low: string | number;
  high: string | number;
}

interface CqlIsNull {
  type: 'isNull';
  property: string;
  negated: boolean; // true pour IS NOT NULL
}
```

**Parser** — Dans `parsePrimary()`, apres avoir lu une propriete, detecter :
- `property IN (val1, val2, ...)`
- `property BETWEEN val1 AND val2`
- `property IS NULL` / `property IS NOT NULL`

**Evaluateur** — Ajouter les 3 cas dans `evaluateFilter()`.

**Syntaxe CQL2 supportee :**
- `etat IN ('active', 'inactive')`
- `population BETWEEN 1000 AND 5000`
- `description IS NULL`
- `description IS NOT NULL`

### 2. WFS 2.0 DescribeFeatureType

Le code existant (`buildDescribeFeatureType()`) est deja version-agnostique.
Le router WFS accepte deja DescribeFeatureType avec version=2.0.0.

Il manque :
- Tests de conformite dans `wfs20/describe.test.ts`
- Documentation dans `docs/conformance/wfs.md`

### 3. WFS Filter Encoding (OGC Filter XML)

**Approche : conversion Filter XML vers AST CqlNode** puis reutilisation de
`evaluateFilter()`. Un seul evaluateur a maintenir.

**Nouveau module** `packages/proxy/src/wfs/filter-encoding.ts` :
- Fonction `parseFilterXml(filterObj: Record<string, unknown>): CqlNode`
- Prend en entree l'objet issu de `fast-xml-parser`
- Retourne un `CqlNode` compatible avec l'evaluateur existant

**Operateurs supportes :**

| XML Element | CqlNode type |
|---|---|
| PropertyIsEqualTo | comparison (=) |
| PropertyIsNotEqualTo | comparison (<>) |
| PropertyIsLessThan | comparison (<) |
| PropertyIsGreaterThan | comparison (>) |
| PropertyIsLessThanOrEqualTo | comparison (<=) |
| PropertyIsGreaterThanOrEqualTo | comparison (>=) |
| PropertyIsLike | like |
| PropertyIsBetween | between |
| PropertyIsNull | isNull |
| And | logical (AND) |
| Or | logical (OR) |
| Not | not |
| BBOX | spatial (bbox applique en amont) |
| Intersects | spatial (S_INTERSECTS) |
| Within | spatial (S_WITHIN) |
| Contains | spatial (S_CONTAINS) |
| Crosses | spatial (S_CROSSES) |
| Touches | spatial (S_TOUCHES) |
| Disjoint | spatial (S_DISJOINT) |
| Equals | spatial (S_EQUALS) |

**Integration dans get-feature.ts :**
- `parseGetFeaturePost()` extrait le filtre XML et le convertit en CqlNode
- `parseGetFeatureGet()` supporte un parametre `filter` contenant du XML URL-encode
- `executeGetFeature()` applique le filtre via `evaluateFilter()` post-fetch

**Tests :** `wfs11/filter-encoding.test.ts`, `wfs20/filter-encoding.test.ts`

### 4. Fonctions spatiales additionnelles

Extension du CQL2 et mise a jour des Capabilities WFS.

**Nouvelles fonctions :**

| CQL2 | Turf.js |
|---|---|
| S_CONTAINS | @turf/boolean-contains |
| S_CROSSES | @turf/boolean-crosses |
| S_TOUCHES | @turf/boolean-touches |
| S_DISJOINT | @turf/boolean-disjoint |
| S_EQUALS | @turf/boolean-equal |

**Fichiers impactes :**
- `cql2/lexer.ts` — Ajouter les keywords
- `cql2/types.ts` — Etendre le type union `CqlSpatial.operator`
- `cql2/evaluator.ts` — Ajouter les cas d'evaluation
- `cql2/bbox-extractor.ts` — S_CONTAINS peut aussi fournir un bbox
- `wfs/capabilities.ts` — Ajouter les operateurs spatiaux aux deux documents XML
- `cql2-spatial.test.ts` — Tests pour les nouvelles fonctions

## Fichiers modifies (resume)

### Proxy (`packages/proxy/src/`)

| Fichier | Modification |
|---|---|
| engine/cql2/types.ts | +CqlIn, +CqlBetween, +CqlIsNull, etendre CqlSpatial.operator |
| engine/cql2/lexer.ts | +IN, +BETWEEN, +IS, +NULL, +S_CONTAINS, +S_CROSSES, +S_TOUCHES, +S_DISJOINT, +S_EQUALS |
| engine/cql2/parser.ts | +parsePrimary cases pour IN, BETWEEN, IS NULL |
| engine/cql2/evaluator.ts | +in, +between, +isNull, +spatial operators |
| wfs/filter-encoding.ts | Nouveau — parse Filter XML vers CqlNode |
| wfs/get-feature.ts | Integration filter-encoding, application post-fetch |
| wfs/capabilities.ts | Operateurs spatiaux supplementaires |

### Tests (`packages/conformance-tests/src/`)

| Fichier | Modification |
|---|---|
| ogc-api-features/filtering/cql2-advanced.test.ts | +IN, +BETWEEN tests |
| ogc-api-features/filtering/cql2-basic.test.ts | +IS NULL, +IS NOT NULL |
| ogc-api-features/filtering/cql2-spatial.test.ts | +S_CONTAINS, +S_CROSSES, etc. |
| wfs/wfs11/filter-encoding.test.ts | Nouveau — filtres OGC XML |
| wfs/wfs20/filter-encoding.test.ts | Nouveau — filtres FES XML |
| wfs/wfs20/describe.test.ts | Nouveau — DescribeFeatureType 2.0 |

### Documentation

| Fichier | Modification |
|---|---|
| docs/conformance/ogc-api-features.md | MAJ statuts CQL2 |
| docs/conformance/wfs.md | +DescribeFeatureType 2.0, +Filter Encoding |
| docs/conformance/README.md | MAJ couverture |
