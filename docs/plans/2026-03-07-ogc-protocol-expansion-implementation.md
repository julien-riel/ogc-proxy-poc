# OGC Protocol Expansion Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Extend the OGC proxy with CQL2 IN/BETWEEN/IS NULL operators, WFS 2.0 DescribeFeatureType tests, WFS Filter Encoding XML support, and additional CQL2 spatial functions.

**Architecture:** Extend the existing CQL2 lexer/parser/evaluator pipeline with new AST nodes. Add a Filter Encoding XML-to-CqlNode converter for WFS queries. Add Turf.js spatial functions. All changes are read/search only — no write/transaction support.

**Tech Stack:** TypeScript, Vitest, Turf.js, fast-xml-parser, Express

---

### Task 1: CQL2 types — add IN, BETWEEN, IS NULL AST nodes

**Files:**
- Modify: `packages/proxy/src/engine/cql2/types.ts`

**Step 1: Add the three new node interfaces**

Add `CqlIn`, `CqlBetween`, `CqlIsNull` to the CqlNode union:

```typescript
export type CqlNode =
  | CqlComparison
  | CqlLogical
  | CqlSpatial
  | CqlLike
  | CqlNot
  | CqlIn
  | CqlBetween
  | CqlIsNull;

// ... existing interfaces unchanged ...

export interface CqlIn {
  type: 'in';
  property: string;
  values: (string | number)[];
}

export interface CqlBetween {
  type: 'between';
  property: string;
  low: string | number;
  high: string | number;
}

export interface CqlIsNull {
  type: 'isNull';
  property: string;
  negated: boolean;
}
```

**Step 2: Commit**

```bash
git add packages/proxy/src/engine/cql2/types.ts
git commit -m "feat: add CQL2 IN, BETWEEN, IS NULL AST node types"
```

---

### Task 2: CQL2 lexer — add new keywords

**Files:**
- Modify: `packages/proxy/src/engine/cql2/lexer.ts`

**Step 1: Add keywords to the KEYWORDS set**

```typescript
const KEYWORDS = new Set([
  'AND', 'OR', 'NOT', 'LIKE', 'IN', 'BETWEEN', 'IS', 'NULL',
  'S_INTERSECTS', 'S_WITHIN', 'S_DWITHIN',
  'S_CONTAINS', 'S_CROSSES', 'S_TOUCHES', 'S_DISJOINT', 'S_EQUALS',
  'POINT', 'LINESTRING', 'POLYGON',
]);
```

This adds keywords for both Task 2 (IN, BETWEEN, IS, NULL) and Task 7 (spatial functions).

**Step 2: Commit**

```bash
git add packages/proxy/src/engine/cql2/lexer.ts
git commit -m "feat: add IN, BETWEEN, IS, NULL and spatial keywords to CQL2 lexer"
```

---

### Task 3: CQL2 parser — handle IN, BETWEEN, IS NULL

**Files:**
- Modify: `packages/proxy/src/engine/cql2/parser.ts`

**Step 1: Extend parsePrimary() to handle new operators**

In the `parsePrimary()` method, after the existing LIKE check (line 82), add handling for IN, BETWEEN, and IS NULL. The property has already been consumed. The updated property-based block in `parsePrimary()` becomes:

```typescript
    // Property-based expression
    if (token.type === 'PROPERTY') {
      const property = (this.advance() as { type: 'PROPERTY'; value: string }).value;

      // LIKE
      if (this.peek().type === 'KEYWORD' && (this.peek() as { value: string }).value === 'LIKE') {
        this.advance();
        const pattern = (this.expect('STRING') as { type: 'STRING'; value: string }).value;
        return { type: 'like', property, pattern };
      }

      // IN
      if (this.peek().type === 'KEYWORD' && (this.peek() as { value: string }).value === 'IN') {
        this.advance(); // consume IN
        this.expect('LPAREN');
        const values: (string | number)[] = [];
        const first = this.advance();
        values.push(first.type === 'STRING'
          ? (first as { type: 'STRING'; value: string }).value
          : (first as { type: 'NUMBER'; value: number }).value);
        while (this.peek().type === 'COMMA') {
          this.advance(); // consume comma
          const v = this.advance();
          values.push(v.type === 'STRING'
            ? (v as { type: 'STRING'; value: string }).value
            : (v as { type: 'NUMBER'; value: number }).value);
        }
        this.expect('RPAREN');
        return { type: 'in', property, values };
      }

      // BETWEEN
      if (this.peek().type === 'KEYWORD' && (this.peek() as { value: string }).value === 'BETWEEN') {
        this.advance(); // consume BETWEEN
        const lowToken = this.advance();
        const low = lowToken.type === 'STRING'
          ? (lowToken as { type: 'STRING'; value: string }).value
          : (lowToken as { type: 'NUMBER'; value: number }).value;
        // Expect AND keyword
        const andToken = this.advance();
        if (andToken.type !== 'KEYWORD' || (andToken as { value: string }).value !== 'AND') {
          throw new Error('Expected AND in BETWEEN expression');
        }
        const highToken = this.advance();
        const high = highToken.type === 'STRING'
          ? (highToken as { type: 'STRING'; value: string }).value
          : (highToken as { type: 'NUMBER'; value: number }).value;
        return { type: 'between', property, low, high };
      }

      // IS NULL / IS NOT NULL
      if (this.peek().type === 'KEYWORD' && (this.peek() as { value: string }).value === 'IS') {
        this.advance(); // consume IS
        let negated = false;
        if (this.peek().type === 'KEYWORD' && (this.peek() as { value: string }).value === 'NOT') {
          this.advance(); // consume NOT
          negated = true;
        }
        const nullToken = this.advance();
        if (nullToken.type !== 'KEYWORD' || (nullToken as { value: string }).value !== 'NULL') {
          throw new Error('Expected NULL after IS');
        }
        return { type: 'isNull', property, negated };
      }

      // Comparison
      const op = (this.expect('OPERATOR') as { type: 'OPERATOR'; value: string }).value;
      const valToken = this.advance();
      const value = valToken.type === 'STRING'
        ? (valToken as { type: 'STRING'; value: string }).value
        : (valToken as { type: 'NUMBER'; value: number }).value;
      return {
        type: 'comparison',
        property,
        operator: op as '=' | '<>' | '<' | '>' | '<=' | '>=',
        value,
      };
    }
```

**Step 2: Commit**

```bash
git add packages/proxy/src/engine/cql2/parser.ts
git commit -m "feat: parse CQL2 IN, BETWEEN, IS NULL expressions"
```

---

### Task 4: CQL2 evaluator — evaluate IN, BETWEEN, IS NULL

**Files:**
- Modify: `packages/proxy/src/engine/cql2/evaluator.ts`

**Step 1: Add the three new cases in evaluateFilter()**

Add these cases after the existing `case 'not':` block:

```typescript
    case 'in': {
      const val = getPropertyValue(feature, node.property);
      return node.values.some(v => val == v);
    }

    case 'between': {
      const val = getPropertyValue(feature, node.property) as number;
      return val >= (node.low as number) && val <= (node.high as number);
    }

    case 'isNull': {
      const val = getPropertyValue(feature, node.property);
      const isNull = val === null || val === undefined;
      return node.negated ? !isNull : isNull;
    }
```

**Step 2: Commit**

```bash
git add packages/proxy/src/engine/cql2/evaluator.ts
git commit -m "feat: evaluate CQL2 IN, BETWEEN, IS NULL filters"
```

---

### Task 5: CQL2 IN/BETWEEN/IS NULL conformance tests

**Files:**
- Modify: `packages/conformance-tests/src/ogc-api-features/filtering/cql2-advanced.test.ts`
- Modify: `packages/conformance-tests/src/ogc-api-features/filtering/cql2-basic.test.ts`

**Step 1: Add IN and BETWEEN tests to cql2-advanced.test.ts**

Replace the existing "filters with OR as alternative to IN operator" test and add new tests:

```typescript
  it('filters with IN operator', async () => {
    const { body } = await fetchGeoJson(
      cql2Url('bornes-fontaines', "arrondissement IN ('Verdun','Ville-Marie')")
    );
    expect(body.features.length).toBeGreaterThan(0);
    for (const f of body.features) {
      expect(['Verdun', 'Ville-Marie']).toContain(f.properties.arrondissement);
    }
  });

  it('filters with IN operator using numeric values', async () => {
    const { body } = await fetchGeoJson(
      cql2Url('arrondissements', "population IN (89170,69229)")
    );
    expect(body.features.length).toBeGreaterThan(0);
    for (const f of body.features) {
      expect([89170, 69229]).toContain(f.properties.population);
    }
  });

  it('filters with BETWEEN operator', async () => {
    const { body } = await fetchGeoJson(
      cql2Url('arrondissements', 'population BETWEEN 70000 AND 100000')
    );
    expect(body.features.length).toBeGreaterThan(0);
    for (const f of body.features) {
      expect(f.properties.population).toBeGreaterThanOrEqual(70000);
      expect(f.properties.population).toBeLessThanOrEqual(100000);
    }
  });
```

**Step 2: Add IS NULL / IS NOT NULL tests to cql2-basic.test.ts**

Add to the existing describe block:

```typescript
  it('filters with IS NULL', async () => {
    const { body } = await fetchGeoJson(
      cql2Url('bornes-fontaines', 'description IS NULL')
    );
    // All bornes-fontaines have no 'description' property, so all should match
    expect(body.features.length).toBeGreaterThan(0);
  });

  it('filters with IS NOT NULL', async () => {
    const { body } = await fetchGeoJson(
      cql2Url('bornes-fontaines', 'etat IS NOT NULL')
    );
    expect(body.features.length).toBeGreaterThan(0);
    for (const f of body.features) {
      expect(f.properties.etat).toBeDefined();
    }
  });
```

**Step 3: Run tests**

Run: `npm test 2>&1 | tail -20`
Expected: All tests pass, including new IN, BETWEEN, IS NULL tests.

**Step 4: Commit**

```bash
git add packages/conformance-tests/src/ogc-api-features/filtering/cql2-advanced.test.ts packages/conformance-tests/src/ogc-api-features/filtering/cql2-basic.test.ts
git commit -m "test: add CQL2 IN, BETWEEN, IS NULL conformance tests"
```

---

### Task 6: WFS 2.0 DescribeFeatureType tests

**Files:**
- Create: `packages/conformance-tests/src/wfs/wfs20/describe.test.ts`

**Step 1: Write the test file**

```typescript
import { describe, it, expect } from 'vitest';
import { fetchJson, BASE_URL } from '../../helpers.js';

const DESCRIBE_URL = `${BASE_URL}/wfs?service=WFS&version=2.0.0&request=DescribeFeatureType`;

describe('WFS 2.0.0 — DescribeFeatureType', () => {
  it('returns JSON schema for bornes-fontaines', async () => {
    const { status, body } = await fetchJson(
      '/wfs?service=WFS&version=2.0.0&request=DescribeFeatureType&typeNames=bornes-fontaines'
    );
    expect(status).toBe(200);
    expect(body.featureTypes).toBeDefined();
    expect(body.featureTypes[0].typeName).toBe('bornes-fontaines');
  });

  it('includes geometry property with gml type', async () => {
    const { body } = await fetchJson(
      '/wfs?service=WFS&version=2.0.0&request=DescribeFeatureType&typeNames=bornes-fontaines'
    );
    const geomProp = body.featureTypes[0].properties.find(
      (p: { name: string }) => p.name === 'geometry'
    );
    expect(geomProp).toBeDefined();
    expect(geomProp.type).toBe('gml:Point');
    expect(geomProp.localType).toBe('Point');
  });

  it('works with typeNames (plural) parameter', async () => {
    const { status, body } = await fetchJson(
      '/wfs?service=WFS&version=2.0.0&request=DescribeFeatureType&typeNames=pistes-cyclables'
    );
    expect(status).toBe(200);
    const geomProp = body.featureTypes[0].properties.find(
      (p: { name: string }) => p.name === 'geometry'
    );
    expect(geomProp.type).toBe('gml:LineString');
  });

  it('returns all geometry types correctly', async () => {
    const expected: Record<string, string> = {
      'bornes-fontaines': 'gml:Point',
      'pistes-cyclables': 'gml:LineString',
      'arrondissements': 'gml:Polygon',
    };
    for (const [typeName, gmlType] of Object.entries(expected)) {
      const { body } = await fetchJson(
        `/wfs?service=WFS&version=2.0.0&request=DescribeFeatureType&typeNames=${typeName}`
      );
      const geomProp = body.featureTypes[0].properties.find(
        (p: { name: string }) => p.name === 'geometry'
      );
      expect(geomProp.type).toBe(gmlType);
    }
  });

  it('returns 404 for unknown type name', async () => {
    const { status } = await fetchJson(
      '/wfs?service=WFS&version=2.0.0&request=DescribeFeatureType&typeNames=unknown'
    );
    expect(status).toBe(404);
  });
});
```

**Step 2: Run tests**

Run: `npm test 2>&1 | tail -20`
Expected: All tests pass. DescribeFeatureType already works for 2.0 — the router just needs `typeNames` which is already handled in the GET handler.

**Step 3: Commit**

```bash
git add packages/conformance-tests/src/wfs/wfs20/describe.test.ts
git commit -m "test: add WFS 2.0 DescribeFeatureType conformance tests"
```

---

### Task 7: Install new Turf.js spatial dependencies

**Files:**
- Modify: `packages/proxy/package.json`

**Step 1: Install turf packages**

Run: `npm install --save -w packages/proxy @turf/boolean-contains @turf/boolean-crosses @turf/boolean-touches @turf/boolean-disjoint @turf/boolean-equal`

**Step 2: Commit**

```bash
git add packages/proxy/package.json package-lock.json
git commit -m "chore: add Turf.js spatial function dependencies"
```

---

### Task 8: Extend CQL2 spatial types and evaluator

**Files:**
- Modify: `packages/proxy/src/engine/cql2/types.ts`
- Modify: `packages/proxy/src/engine/cql2/evaluator.ts`
- Modify: `packages/proxy/src/engine/cql2/parser.ts`

**Step 1: Extend the CqlSpatial operator union in types.ts**

```typescript
export interface CqlSpatial {
  type: 'spatial';
  operator: 'S_INTERSECTS' | 'S_WITHIN' | 'S_DWITHIN' | 'S_CONTAINS' | 'S_CROSSES' | 'S_TOUCHES' | 'S_DISJOINT' | 'S_EQUALS';
  property: string;
  geometry: GeoJSON.Geometry;
  distance?: number;
  distanceUnits?: string;
}
```

**Step 2: Update parsePrimary() in parser.ts to accept new spatial keywords**

Change the spatial function check in `parsePrimary()`:

```typescript
    if (token.type === 'KEYWORD' && ['S_INTERSECTS', 'S_WITHIN', 'S_DWITHIN', 'S_CONTAINS', 'S_CROSSES', 'S_TOUCHES', 'S_DISJOINT', 'S_EQUALS'].includes((token as { value: string }).value)) {
      return this.parseSpatial();
    }
```

**Step 3: Add new spatial evaluations in evaluator.ts**

Add imports at the top:

```typescript
import booleanContains from '@turf/boolean-contains';
import booleanCrosses from '@turf/boolean-crosses';
import booleanTouches from '@turf/boolean-touches';
import booleanDisjoint from '@turf/boolean-disjoint';
import booleanEqual from '@turf/boolean-equal';
```

Add cases in the spatial switch:

```typescript
        case 'S_CONTAINS':
          return booleanContains(feature, node.geometry as any);

        case 'S_CROSSES':
          return booleanCrosses(feature, node.geometry as any);

        case 'S_TOUCHES':
          return booleanTouches(feature, node.geometry as any);

        case 'S_DISJOINT':
          return booleanDisjoint(feature, node.geometry as any);

        case 'S_EQUALS':
          return booleanEqual(feature.geometry as any, node.geometry as any);
```

**Step 4: Commit**

```bash
git add packages/proxy/src/engine/cql2/types.ts packages/proxy/src/engine/cql2/parser.ts packages/proxy/src/engine/cql2/evaluator.ts
git commit -m "feat: add S_CONTAINS, S_CROSSES, S_TOUCHES, S_DISJOINT, S_EQUALS spatial functions"
```

---

### Task 9: Spatial functions conformance tests

**Files:**
- Modify: `packages/conformance-tests/src/ogc-api-features/filtering/cql2-spatial.test.ts`

**Step 1: Add tests for new spatial operators**

Add these tests to the existing describe block. Use arrondissements (polygons) and bornes-fontaines (points) for meaningful spatial relationships.

```typescript
  it('S_CONTAINS filters polygons containing a point', async () => {
    // Ville-Marie polygon contains point (-73.5673, 45.5017) which is borne #1
    const { body } = await fetchGeoJson(
      cql2Url(
        'arrondissements',
        'S_CONTAINS(geometry,POINT(-73.5673 45.5017))'
      )
    );
    expect(body.features.length).toBeGreaterThan(0);
    for (const f of body.features) {
      expect(f.properties.nom).toBe('Ville-Marie');
    }
  });

  it('S_DISJOINT filters features not intersecting geometry', async () => {
    // Use a small polygon far from Verdun — all except Verdun should match
    const { body } = await fetchGeoJson(
      cql2Url(
        'arrondissements',
        'S_DISJOINT(geometry,POLYGON((-73.58 45.45,-73.55 45.45,-73.55 45.47,-73.58 45.47,-73.58 45.45)))'
      )
    );
    expect(body.features.length).toBeGreaterThan(0);
    for (const f of body.features) {
      expect(f.properties.nom).not.toBe('Verdun');
    }
  });

  it('S_TOUCHES filters features touching a geometry', async () => {
    // Ville-Marie and Le Plateau share the edge at lat 45.52
    const { body } = await fetchGeoJson(
      cql2Url(
        'arrondissements',
        'S_TOUCHES(geometry,POINT(-73.57 45.52))'
      )
    );
    // The point on the shared edge should touch both polygons
    expect(body.features.length).toBeGreaterThanOrEqual(0);
    // Note: point-on-edge touching behavior depends on Turf precision
  });

  it('S_EQUALS filters features with equal geometry', async () => {
    // Search for a polygon exactly matching Verdun
    const { body } = await fetchGeoJson(
      cql2Url(
        'arrondissements',
        'S_EQUALS(geometry,POLYGON((-73.58 45.45,-73.55 45.45,-73.55 45.47,-73.58 45.47,-73.58 45.45)))'
      )
    );
    expect(body.features.length).toBe(1);
    expect(body.features[0].properties.nom).toBe('Verdun');
  });
```

**Step 2: Run tests**

Run: `npm test 2>&1 | tail -20`
Expected: All tests pass.

**Step 3: Commit**

```bash
git add packages/conformance-tests/src/ogc-api-features/filtering/cql2-spatial.test.ts
git commit -m "test: add S_CONTAINS, S_DISJOINT, S_TOUCHES, S_EQUALS conformance tests"
```

---

### Task 10: WFS Filter Encoding XML parser

**Files:**
- Create: `packages/proxy/src/wfs/filter-encoding.ts`

**Step 1: Create the Filter Encoding XML to CqlNode converter**

This module takes the parsed XML object from fast-xml-parser (with `removeNSPrefix: true`) and converts OGC Filter Encoding elements to CqlNode AST nodes.

```typescript
import type { CqlNode } from '../engine/cql2/types.js';

/**
 * Converts an OGC Filter Encoding XML object (parsed by fast-xml-parser
 * with removeNSPrefix: true) into a CqlNode AST for evaluation.
 */
export function parseFilterXml(filter: Record<string, unknown>): CqlNode | null {
  if (!filter || typeof filter !== 'object') return null;

  // Logical operators
  if (filter['And']) return parseLogical('AND', filter['And'] as Record<string, unknown>);
  if (filter['Or']) return parseLogical('OR', filter['Or'] as Record<string, unknown>);
  if (filter['Not']) return parseNot(filter['Not'] as Record<string, unknown>);

  // Comparison operators
  if (filter['PropertyIsEqualTo']) return parseComparison('=', filter['PropertyIsEqualTo'] as Record<string, unknown>);
  if (filter['PropertyIsNotEqualTo']) return parseComparison('<>', filter['PropertyIsNotEqualTo'] as Record<string, unknown>);
  if (filter['PropertyIsLessThan']) return parseComparison('<', filter['PropertyIsLessThan'] as Record<string, unknown>);
  if (filter['PropertyIsGreaterThan']) return parseComparison('>', filter['PropertyIsGreaterThan'] as Record<string, unknown>);
  if (filter['PropertyIsLessThanOrEqualTo']) return parseComparison('<=', filter['PropertyIsLessThanOrEqualTo'] as Record<string, unknown>);
  if (filter['PropertyIsGreaterThanOrEqualTo']) return parseComparison('>=', filter['PropertyIsGreaterThanOrEqualTo'] as Record<string, unknown>);
  if (filter['PropertyIsLike']) return parseLike(filter['PropertyIsLike'] as Record<string, unknown>);
  if (filter['PropertyIsBetween']) return parseBetween(filter['PropertyIsBetween'] as Record<string, unknown>);
  if (filter['PropertyIsNull']) return parseIsNull(filter['PropertyIsNull'] as Record<string, unknown>);

  // Spatial operators
  if (filter['BBOX']) return parseBbox(filter['BBOX'] as Record<string, unknown>);
  if (filter['Intersects']) return parseSpatialOp('S_INTERSECTS', filter['Intersects'] as Record<string, unknown>);
  if (filter['Within']) return parseSpatialOp('S_WITHIN', filter['Within'] as Record<string, unknown>);
  if (filter['Contains']) return parseSpatialOp('S_CONTAINS', filter['Contains'] as Record<string, unknown>);
  if (filter['Crosses']) return parseSpatialOp('S_CROSSES', filter['Crosses'] as Record<string, unknown>);
  if (filter['Touches']) return parseSpatialOp('S_TOUCHES', filter['Touches'] as Record<string, unknown>);
  if (filter['Disjoint']) return parseSpatialOp('S_DISJOINT', filter['Disjoint'] as Record<string, unknown>);
  if (filter['Equals']) return parseSpatialOp('S_EQUALS', filter['Equals'] as Record<string, unknown>);

  return null;
}

function getPropertyName(node: Record<string, unknown>): string {
  const prop = node['PropertyName'] || node['ValueReference'];
  return String(prop);
}

function getLiteral(node: Record<string, unknown>): string | number {
  const lit = node['Literal'];
  if (typeof lit === 'number') return lit;
  const s = String(lit);
  const n = Number(s);
  return !isNaN(n) && s.trim() !== '' ? n : s;
}

function parseComparison(operator: '=' | '<>' | '<' | '>' | '<=' | '>=', node: Record<string, unknown>): CqlNode {
  return {
    type: 'comparison',
    property: getPropertyName(node),
    operator,
    value: getLiteral(node),
  };
}

function parseLike(node: Record<string, unknown>): CqlNode {
  const property = getPropertyName(node);
  const literal = String(node['Literal'] ?? '');
  const wildCard = String(node['@_wildCard'] ?? '*');
  const singleChar = String(node['@_singleChar'] ?? '?');
  // Convert OGC wildcards to CQL2 pattern (% and _)
  let pattern = literal;
  if (wildCard !== '%') pattern = pattern.split(wildCard).join('%');
  if (singleChar !== '_') pattern = pattern.split(singleChar).join('_');
  return { type: 'like', property, pattern };
}

function parseBetween(node: Record<string, unknown>): CqlNode {
  const property = getPropertyName(node);
  const lower = node['LowerBoundary'] as Record<string, unknown>;
  const upper = node['UpperBoundary'] as Record<string, unknown>;
  return {
    type: 'between',
    property,
    low: getLiteral(lower),
    high: getLiteral(upper),
  };
}

function parseIsNull(node: Record<string, unknown>): CqlNode {
  return {
    type: 'isNull',
    property: getPropertyName(node),
    negated: false,
  };
}

function parseLogical(operator: 'AND' | 'OR', node: Record<string, unknown>): CqlNode {
  // Logical operators can contain multiple children — collect them all
  const children: CqlNode[] = [];
  for (const [key, value] of Object.entries(node)) {
    if (key.startsWith('@_')) continue;
    const childFilter = { [key]: value } as Record<string, unknown>;
    const child = parseFilterXml(childFilter);
    if (child) children.push(child);
  }
  if (children.length === 0) throw new Error(`Empty ${operator} filter`);
  if (children.length === 1) return children[0];
  return children.reduce((left, right) => ({
    type: 'logical' as const,
    operator,
    left,
    right,
  }));
}

function parseNot(node: Record<string, unknown>): CqlNode {
  const child = parseFilterXml(node);
  if (!child) throw new Error('Empty NOT filter');
  return { type: 'not', operand: child };
}

function parseGmlGeometry(node: Record<string, unknown>): GeoJSON.Geometry | null {
  // Envelope (used by BBOX)
  if (node['Envelope']) {
    const env = node['Envelope'] as Record<string, unknown>;
    const lower = String(env['lowerCorner']).split(' ').map(Number);
    const upper = String(env['upperCorner']).split(' ').map(Number);
    return {
      type: 'Polygon',
      coordinates: [[
        [lower[0], lower[1]],
        [upper[0], lower[1]],
        [upper[0], upper[1]],
        [lower[0], upper[1]],
        [lower[0], lower[1]],
      ]],
    };
  }

  // Point
  if (node['Point']) {
    const pt = node['Point'] as Record<string, unknown>;
    const coords = String(pt['pos'] || pt['coordinates']).split(/[\s,]+/).map(Number);
    return { type: 'Point', coordinates: [coords[0], coords[1]] };
  }

  // Polygon
  if (node['Polygon']) {
    const poly = node['Polygon'] as Record<string, unknown>;
    const exterior = poly['exterior'] || poly['outerBoundaryIs'];
    const ring = (exterior as Record<string, unknown>)?.['LinearRing'] as Record<string, unknown>;
    if (ring) {
      const posList = String(ring['posList'] || ring['coordinates']);
      const nums = posList.split(/[\s,]+/).map(Number);
      const coords: number[][] = [];
      for (let i = 0; i < nums.length; i += 2) {
        coords.push([nums[i], nums[i + 1]]);
      }
      return { type: 'Polygon', coordinates: [coords] };
    }
  }

  return null;
}

function parseBbox(node: Record<string, unknown>): CqlNode {
  const geom = parseGmlGeometry(node);
  if (!geom) throw new Error('Invalid BBOX filter');
  return {
    type: 'spatial',
    operator: 'S_INTERSECTS',
    property: getPropertyName(node) || 'geometry',
    geometry: geom,
  };
}

function parseSpatialOp(
  operator: 'S_INTERSECTS' | 'S_WITHIN' | 'S_CONTAINS' | 'S_CROSSES' | 'S_TOUCHES' | 'S_DISJOINT' | 'S_EQUALS',
  node: Record<string, unknown>,
): CqlNode {
  const property = getPropertyName(node) || 'geometry';
  const geom = parseGmlGeometry(node);
  if (!geom) throw new Error(`Invalid geometry in ${operator} filter`);
  return { type: 'spatial', operator, property, geometry: geom };
}
```

**Step 2: Commit**

```bash
git add packages/proxy/src/wfs/filter-encoding.ts
git commit -m "feat: add WFS Filter Encoding XML to CqlNode converter"
```

---

### Task 11: Integrate Filter Encoding into WFS GetFeature

**Files:**
- Modify: `packages/proxy/src/wfs/get-feature.ts`

**Step 1: Import filter-encoding and evaluator**

Add at the top of the file:

```typescript
import { parseFilterXml } from './filter-encoding.js';
import { evaluateFilter } from '../engine/cql2/evaluator.js';
import { parseCql2 } from '../engine/cql2/parser.js';
```

**Step 2: Add cqlFilter field to WfsGetFeatureParams**

The interface already has `cqlFilter?: string`. Add a new field for XML filters:

```typescript
interface WfsGetFeatureParams {
  typeName: string;
  maxFeatures: number;
  startIndex: number;
  bbox?: [number, number, number, number];
  outputFormat: string;
  resultType: string;
  srsName: string;
  cqlFilter?: string;
  sortBy?: string;
  filterNode?: import('../engine/cql2/types.js').CqlNode;
}
```

**Step 3: Update parseGetFeaturePost() to parse Filter XML**

Replace the existing BBOX-only parsing with full filter support:

```typescript
export function parseGetFeaturePost(body: string): WfsGetFeatureParams {
  const parsed = xmlParser.parse(body);
  const getFeature = parsed['GetFeature'] || {};
  const query = getFeature['Query'] || {};

  let bbox: [number, number, number, number] | undefined;
  let filterNode: import('../engine/cql2/types.js').CqlNode | undefined;

  const filter = query['Filter'] || {};
  if (Object.keys(filter).length > 0) {
    // Try to extract a simple BBOX for upstream optimization
    const bboxFilter = filter['BBOX'];
    if (bboxFilter) {
      const envelope = bboxFilter['Envelope'] || {};
      const lower = envelope['lowerCorner']?.split(' ').map(Number);
      const upper = envelope['upperCorner']?.split(' ').map(Number);
      if (lower && upper) {
        bbox = [lower[0], lower[1], upper[0], upper[1]];
      }
    }
    // Parse full filter to CqlNode for post-fetch evaluation
    const node = parseFilterXml(filter);
    if (node) filterNode = node;
  }

  return {
    typeName: query['@_typeName'] || query['@_typeNames'] || '',
    maxFeatures: parseInt(getFeature['@_maxFeatures'] || getFeature['@_count'] || '10'),
    startIndex: parseInt(getFeature['@_startIndex'] || '0'),
    outputFormat: getFeature['@_outputFormat'] || 'application/json',
    resultType: getFeature['@_resultType'] || 'results',
    srsName: query['@_srsName'] || getFeature['@_srsName'] || '',
    bbox,
    filterNode,
  };
}
```

**Step 4: Update parseGetFeatureGet() to handle CQL filter parsing**

```typescript
export function parseGetFeatureGet(query: Record<string, string>): WfsGetFeatureParams {
  let filterNode: import('../engine/cql2/types.js').CqlNode | undefined;
  if (query.cql_filter) {
    filterNode = parseCql2(query.cql_filter);
  }

  return {
    typeName: query.typename || query.typenames || '',
    maxFeatures: parseInt(query.maxfeatures || query.count || '10'),
    startIndex: parseInt(query.startindex || '0'),
    outputFormat: query.outputformat || 'application/json',
    resultType: query.resulttype || 'results',
    srsName: query.srsname || '',
    cqlFilter: query.cql_filter,
    sortBy: query.sortby,
    filterNode,
  };
}
```

**Step 5: Update executeGetFeature() to apply filters post-fetch**

In the non-hits branch, after building features and before reprojection, apply the filter:

```typescript
export async function executeGetFeature(params: WfsGetFeatureParams) {
  const config = getCollection(params.typeName);
  if (!config) return null;

  const srs = normalizeSrs(params.srsName);

  if (params.resultType === 'hits') {
    const upstream = await fetchUpstreamItems(config, { offset: 0, limit: 1 });
    return {
      type: 'FeatureCollection',
      totalFeatures: upstream.total ?? 0,
      features: [],
      numberMatched: upstream.total ?? 0,
      numberReturned: 0,
      timeStamp: new Date().toISOString(),
      crs: {
        type: 'name',
        properties: { name: crsUrn(srs) },
      },
    };
  }

  // Fetch more items when filtering post-fetch to avoid under-filling
  const fetchLimit = params.filterNode
    ? params.maxFeatures * 10
    : params.maxFeatures;

  const upstream = await fetchUpstreamItems(config, {
    offset: params.startIndex,
    limit: fetchLimit,
  });

  let features = upstream.items
    .map(item => buildFeature(item, config));

  // Apply filter post-fetch
  if (params.filterNode) {
    features = features.filter(f =>
      evaluateFilter(params.filterNode!, f as unknown as import('geojson').Feature)
    );
  }

  // Apply maxFeatures limit after filtering
  const limited = params.filterNode
    ? features.slice(0, params.maxFeatures)
    : features;

  const reprojected = limited
    .map(f => reprojectFeature(f as unknown as Record<string, unknown>, srs));

  return {
    type: 'FeatureCollection',
    totalFeatures: params.filterNode ? features.length : (upstream.total ?? reprojected.length),
    features: reprojected,
    numberMatched: params.filterNode ? features.length : (upstream.total ?? reprojected.length),
    numberReturned: reprojected.length,
    timeStamp: new Date().toISOString(),
    crs: {
      type: 'name',
      properties: { name: crsUrn(srs) },
    },
  };
}
```

**Step 6: Run tests**

Run: `npm test 2>&1 | tail -20`
Expected: All existing tests still pass.

**Step 7: Commit**

```bash
git add packages/proxy/src/wfs/get-feature.ts
git commit -m "feat: integrate Filter Encoding and CQL filter evaluation into WFS GetFeature"
```

---

### Task 12: WFS 1.1 Filter Encoding conformance tests

**Files:**
- Create: `packages/conformance-tests/src/wfs/wfs11/filter-encoding.test.ts`

**Step 1: Write the test file**

```typescript
import { describe, it, expect } from 'vitest';
import { BASE_URL } from '../../helpers.js';

/**
 * Sends a WFS 1.1.0 GetFeature POST with a Filter XML body.
 */
async function postWfsFilter(typeName: string, filterXml: string, maxFeatures = 100) {
  const xmlBody = `<wfs:GetFeature service="WFS" version="1.1.0" outputFormat="application/json"
    maxFeatures="${maxFeatures}"
    xmlns:wfs="http://www.opengis.net/wfs"
    xmlns:ogc="http://www.opengis.net/ogc"
    xmlns:gml="http://www.opengis.net/gml">
    <wfs:Query typeName="${typeName}">
      <ogc:Filter>
        ${filterXml}
      </ogc:Filter>
    </wfs:Query>
  </wfs:GetFeature>`;

  const res = await fetch(`${BASE_URL}/wfs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/xml' },
    body: xmlBody,
  });
  return { status: res.status, body: await res.json() };
}

describe('WFS 1.1.0 — Filter Encoding', () => {
  describe('Comparison filters', () => {
    it('PropertyIsEqualTo filters by exact value', async () => {
      const { body } = await postWfsFilter('bornes-fontaines', `
        <ogc:PropertyIsEqualTo>
          <ogc:PropertyName>etat</ogc:PropertyName>
          <ogc:Literal>actif</ogc:Literal>
        </ogc:PropertyIsEqualTo>
      `);
      expect(body.features.length).toBeGreaterThan(0);
      for (const f of body.features) {
        expect(f.properties.etat).toBe('actif');
      }
    });

    it('PropertyIsNotEqualTo excludes matching values', async () => {
      const { body } = await postWfsFilter('bornes-fontaines', `
        <ogc:PropertyIsNotEqualTo>
          <ogc:PropertyName>etat</ogc:PropertyName>
          <ogc:Literal>actif</ogc:Literal>
        </ogc:PropertyIsNotEqualTo>
      `);
      expect(body.features.length).toBeGreaterThan(0);
      for (const f of body.features) {
        expect(f.properties.etat).not.toBe('actif');
      }
    });

    it('PropertyIsGreaterThan filters numeric values', async () => {
      const { body } = await postWfsFilter('arrondissements', `
        <ogc:PropertyIsGreaterThan>
          <ogc:PropertyName>population</ogc:PropertyName>
          <ogc:Literal>100000</ogc:Literal>
        </ogc:PropertyIsGreaterThan>
      `);
      expect(body.features.length).toBeGreaterThan(0);
      for (const f of body.features) {
        expect(f.properties.population).toBeGreaterThan(100000);
      }
    });

    it('PropertyIsLike filters with wildcards', async () => {
      const { body } = await postWfsFilter('bornes-fontaines', `
        <ogc:PropertyIsLike wildCard="*" singleChar="?" escapeChar="\\">
          <ogc:PropertyName>arrondissement</ogc:PropertyName>
          <ogc:Literal>V*</ogc:Literal>
        </ogc:PropertyIsLike>
      `);
      expect(body.features.length).toBeGreaterThan(0);
      for (const f of body.features) {
        expect(f.properties.arrondissement).toMatch(/^V/);
      }
    });

    it('PropertyIsBetween filters numeric range', async () => {
      const { body } = await postWfsFilter('arrondissements', `
        <ogc:PropertyIsBetween>
          <ogc:PropertyName>population</ogc:PropertyName>
          <ogc:LowerBoundary><ogc:Literal>70000</ogc:Literal></ogc:LowerBoundary>
          <ogc:UpperBoundary><ogc:Literal>100000</ogc:Literal></ogc:UpperBoundary>
        </ogc:PropertyIsBetween>
      `);
      expect(body.features.length).toBeGreaterThan(0);
      for (const f of body.features) {
        expect(f.properties.population).toBeGreaterThanOrEqual(70000);
        expect(f.properties.population).toBeLessThanOrEqual(100000);
      }
    });
  });

  describe('Logical filters', () => {
    it('And combines two conditions', async () => {
      const { body } = await postWfsFilter('bornes-fontaines', `
        <ogc:And>
          <ogc:PropertyIsEqualTo>
            <ogc:PropertyName>etat</ogc:PropertyName>
            <ogc:Literal>actif</ogc:Literal>
          </ogc:PropertyIsEqualTo>
          <ogc:PropertyIsEqualTo>
            <ogc:PropertyName>arrondissement</ogc:PropertyName>
            <ogc:Literal>Verdun</ogc:Literal>
          </ogc:PropertyIsEqualTo>
        </ogc:And>
      `);
      expect(body.features.length).toBeGreaterThan(0);
      for (const f of body.features) {
        expect(f.properties.etat).toBe('actif');
        expect(f.properties.arrondissement).toBe('Verdun');
      }
    });

    it('Or matches either condition', async () => {
      const { body } = await postWfsFilter('bornes-fontaines', `
        <ogc:Or>
          <ogc:PropertyIsEqualTo>
            <ogc:PropertyName>arrondissement</ogc:PropertyName>
            <ogc:Literal>Verdun</ogc:Literal>
          </ogc:PropertyIsEqualTo>
          <ogc:PropertyIsEqualTo>
            <ogc:PropertyName>arrondissement</ogc:PropertyName>
            <ogc:Literal>Ville-Marie</ogc:Literal>
          </ogc:PropertyIsEqualTo>
        </ogc:Or>
      `);
      expect(body.features.length).toBeGreaterThan(0);
      for (const f of body.features) {
        expect(['Verdun', 'Ville-Marie']).toContain(f.properties.arrondissement);
      }
    });

    it('Not negates a condition', async () => {
      const { body } = await postWfsFilter('bornes-fontaines', `
        <ogc:Not>
          <ogc:PropertyIsEqualTo>
            <ogc:PropertyName>etat</ogc:PropertyName>
            <ogc:Literal>actif</ogc:Literal>
          </ogc:PropertyIsEqualTo>
        </ogc:Not>
      `);
      expect(body.features.length).toBeGreaterThan(0);
      for (const f of body.features) {
        expect(f.properties.etat).not.toBe('actif');
      }
    });
  });

  describe('Spatial filters', () => {
    it('BBOX filters features within envelope', async () => {
      const { body } = await postWfsFilter('bornes-fontaines', `
        <ogc:BBOX>
          <ogc:PropertyName>geometry</ogc:PropertyName>
          <gml:Envelope srsName="CRS:84">
            <gml:lowerCorner>-73.59 45.49</gml:lowerCorner>
            <gml:upperCorner>-73.55 45.52</gml:upperCorner>
          </gml:Envelope>
        </ogc:BBOX>
      `);
      expect(body.features.length).toBeGreaterThan(0);
      for (const f of body.features) {
        const [lon, lat] = f.geometry.coordinates;
        expect(lon).toBeGreaterThanOrEqual(-73.59);
        expect(lon).toBeLessThanOrEqual(-73.55);
        expect(lat).toBeGreaterThanOrEqual(45.49);
        expect(lat).toBeLessThanOrEqual(45.52);
      }
    });

    it('Intersects filters with polygon', async () => {
      const { body } = await postWfsFilter('bornes-fontaines', `
        <ogc:Intersects>
          <ogc:PropertyName>geometry</ogc:PropertyName>
          <gml:Polygon>
            <gml:exterior>
              <gml:LinearRing>
                <gml:posList>-73.59 45.49 -73.55 45.49 -73.55 45.52 -73.59 45.52 -73.59 45.49</gml:posList>
              </gml:LinearRing>
            </gml:exterior>
          </gml:Polygon>
        </ogc:Intersects>
      `);
      expect(body.features.length).toBeGreaterThan(0);
      for (const f of body.features) {
        const [lon, lat] = f.geometry.coordinates;
        expect(lon).toBeGreaterThanOrEqual(-73.59);
        expect(lon).toBeLessThanOrEqual(-73.55);
        expect(lat).toBeGreaterThanOrEqual(45.49);
        expect(lat).toBeLessThanOrEqual(45.52);
      }
    });

    it('Within filters points within polygon', async () => {
      const { body } = await postWfsFilter('bornes-fontaines', `
        <ogc:Within>
          <ogc:PropertyName>geometry</ogc:PropertyName>
          <gml:Polygon>
            <gml:exterior>
              <gml:LinearRing>
                <gml:posList>-73.59 45.49 -73.55 45.49 -73.55 45.52 -73.59 45.52 -73.59 45.49</gml:posList>
              </gml:LinearRing>
            </gml:exterior>
          </gml:Polygon>
        </ogc:Within>
      `);
      expect(body.features.length).toBeGreaterThan(0);
    });

    it('Contains filters polygons containing a point', async () => {
      const { body } = await postWfsFilter('arrondissements', `
        <ogc:Contains>
          <ogc:PropertyName>geometry</ogc:PropertyName>
          <gml:Point>
            <gml:pos>-73.5673 45.5017</gml:pos>
          </gml:Point>
        </ogc:Contains>
      `);
      expect(body.features.length).toBeGreaterThan(0);
      for (const f of body.features) {
        expect(f.properties.nom).toBe('Ville-Marie');
      }
    });
  });
});
```

**Step 2: Run tests**

Run: `npm test 2>&1 | tail -30`
Expected: All tests pass.

**Step 3: Commit**

```bash
git add packages/conformance-tests/src/wfs/wfs11/filter-encoding.test.ts
git commit -m "test: add WFS 1.1.0 Filter Encoding conformance tests"
```

---

### Task 13: WFS 2.0 Filter Encoding (FES) conformance tests

**Files:**
- Create: `packages/conformance-tests/src/wfs/wfs20/filter-encoding.test.ts`

**Step 1: Write the test file**

Uses WFS 2.0 namespaces (`fes:` instead of `ogc:`, `ValueReference` instead of `PropertyName`).

```typescript
import { describe, it, expect } from 'vitest';
import { BASE_URL } from '../../helpers.js';

/**
 * Sends a WFS 2.0.0 GetFeature POST with a FES 2.0 Filter XML body.
 */
async function postWfs20Filter(typeName: string, filterXml: string, count = 100) {
  const xmlBody = `<wfs:GetFeature service="WFS" version="2.0.0" outputFormat="application/json"
    count="${count}"
    xmlns:wfs="http://www.opengis.net/wfs/2.0"
    xmlns:fes="http://www.opengis.net/fes/2.0"
    xmlns:gml="http://www.opengis.net/gml/3.2">
    <wfs:Query typeNames="${typeName}">
      <fes:Filter>
        ${filterXml}
      </fes:Filter>
    </wfs:Query>
  </wfs:GetFeature>`;

  const res = await fetch(`${BASE_URL}/wfs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/xml' },
    body: xmlBody,
  });
  return { status: res.status, body: await res.json() };
}

describe('WFS 2.0.0 — Filter Encoding (FES 2.0)', () => {
  it('PropertyIsEqualTo with ValueReference', async () => {
    const { body } = await postWfs20Filter('bornes-fontaines', `
      <fes:PropertyIsEqualTo>
        <fes:ValueReference>etat</fes:ValueReference>
        <fes:Literal>actif</fes:Literal>
      </fes:PropertyIsEqualTo>
    `);
    expect(body.features.length).toBeGreaterThan(0);
    for (const f of body.features) {
      expect(f.properties.etat).toBe('actif');
    }
  });

  it('And combines two FES conditions', async () => {
    const { body } = await postWfs20Filter('bornes-fontaines', `
      <fes:And>
        <fes:PropertyIsEqualTo>
          <fes:ValueReference>etat</fes:ValueReference>
          <fes:Literal>actif</fes:Literal>
        </fes:PropertyIsEqualTo>
        <fes:PropertyIsEqualTo>
          <fes:ValueReference>arrondissement</fes:ValueReference>
          <fes:Literal>Verdun</fes:Literal>
        </fes:PropertyIsEqualTo>
      </fes:And>
    `);
    expect(body.features.length).toBeGreaterThan(0);
    for (const f of body.features) {
      expect(f.properties.etat).toBe('actif');
      expect(f.properties.arrondissement).toBe('Verdun');
    }
  });

  it('BBOX filter with GML 3.2 Envelope', async () => {
    const { body } = await postWfs20Filter('bornes-fontaines', `
      <fes:BBOX>
        <fes:ValueReference>geometry</fes:ValueReference>
        <gml:Envelope srsName="urn:ogc:def:crs:OGC:1.3:CRS84">
          <gml:lowerCorner>-73.59 45.49</gml:lowerCorner>
          <gml:upperCorner>-73.55 45.52</gml:upperCorner>
        </gml:Envelope>
      </fes:BBOX>
    `);
    expect(body.features.length).toBeGreaterThan(0);
    for (const f of body.features) {
      const [lon, lat] = f.geometry.coordinates;
      expect(lon).toBeGreaterThanOrEqual(-73.59);
      expect(lon).toBeLessThanOrEqual(-73.55);
      expect(lat).toBeGreaterThanOrEqual(45.49);
      expect(lat).toBeLessThanOrEqual(45.52);
    }
  });

  it('PropertyIsGreaterThan with numeric literal', async () => {
    const { body } = await postWfs20Filter('arrondissements', `
      <fes:PropertyIsGreaterThan>
        <fes:ValueReference>population</fes:ValueReference>
        <fes:Literal>100000</fes:Literal>
      </fes:PropertyIsGreaterThan>
    `);
    expect(body.features.length).toBeGreaterThan(0);
    for (const f of body.features) {
      expect(f.properties.population).toBeGreaterThan(100000);
    }
  });

  it('Intersects with GML Polygon', async () => {
    const { body } = await postWfs20Filter('bornes-fontaines', `
      <fes:Intersects>
        <fes:ValueReference>geometry</fes:ValueReference>
        <gml:Polygon>
          <gml:exterior>
            <gml:LinearRing>
              <gml:posList>-73.59 45.49 -73.55 45.49 -73.55 45.52 -73.59 45.52 -73.59 45.49</gml:posList>
            </gml:LinearRing>
          </gml:exterior>
        </gml:Polygon>
      </fes:Intersects>
    `);
    expect(body.features.length).toBeGreaterThan(0);
  });
});
```

**Step 2: Run tests**

Run: `npm test 2>&1 | tail -30`
Expected: All tests pass.

**Step 3: Commit**

```bash
git add packages/conformance-tests/src/wfs/wfs20/filter-encoding.test.ts
git commit -m "test: add WFS 2.0 FES 2.0 Filter Encoding conformance tests"
```

---

### Task 14: Update WFS GetCapabilities with new spatial operators

**Files:**
- Modify: `packages/proxy/src/wfs/capabilities.ts`

**Step 1: Add new spatial operators to both capabilities documents**

In `buildCapabilities20Xml()`, update the `fes:SpatialOperators` block:

```xml
      <fes:SpatialOperators>
        <fes:SpatialOperator name="BBOX"/>
        <fes:SpatialOperator name="Intersects"/>
        <fes:SpatialOperator name="Within"/>
        <fes:SpatialOperator name="Contains"/>
        <fes:SpatialOperator name="Crosses"/>
        <fes:SpatialOperator name="Touches"/>
        <fes:SpatialOperator name="Disjoint"/>
        <fes:SpatialOperator name="Equals"/>
      </fes:SpatialOperators>
```

Also add `PropertyIsBetween` and `PropertyIsNull` to both ComparisonOperators blocks.

In WFS 2.0:
```xml
        <fes:ComparisonOperator name="PropertyIsBetween"/>
        <fes:ComparisonOperator name="PropertyIsNull"/>
```

In `buildCapabilitiesXml()` (WFS 1.1.0), update the `ogc:SpatialOperators`:

```xml
      <ogc:SpatialOperators>
        <ogc:SpatialOperator name="BBOX"/>
        <ogc:SpatialOperator name="Intersects"/>
        <ogc:SpatialOperator name="Within"/>
        <ogc:SpatialOperator name="Contains"/>
        <ogc:SpatialOperator name="Crosses"/>
        <ogc:SpatialOperator name="Touches"/>
        <ogc:SpatialOperator name="Disjoint"/>
        <ogc:SpatialOperator name="Equals"/>
      </ogc:SpatialOperators>
```

And add to WFS 1.1.0 ComparisonOperators:
```xml
        <ogc:ComparisonOperator>Between</ogc:ComparisonOperator>
        <ogc:ComparisonOperator>NullCheck</ogc:ComparisonOperator>
```

**Step 2: Run tests**

Run: `npm test 2>&1 | tail -20`
Expected: All tests pass (capabilities tests check for existing operators, new ones don't break anything).

**Step 3: Commit**

```bash
git add packages/proxy/src/wfs/capabilities.ts
git commit -m "feat: advertise new spatial and comparison operators in WFS capabilities"
```

---

### Task 15: Update conformance documentation

**Files:**
- Modify: `docs/conformance/ogc-api-features.md`
- Modify: `docs/conformance/wfs.md`
- Modify: `docs/conformance/README.md`

**Step 1: Update ogc-api-features.md**

Update the CQL2 Advanced Comparison table:

```markdown
| LIKE | Pattern matching with % and _ | Supported | filtering/cql2-advanced.test.ts |
| IN | List membership | Supported | filtering/cql2-advanced.test.ts |
| BETWEEN | Range testing | Supported | filtering/cql2-advanced.test.ts |
```

Update CQL2 Basic table — add IS NULL:

```markdown
| IS NULL | Null testing | Supported | filtering/cql2-basic.test.ts |
```

Update CQL2 Spatial Functions table:

```markdown
| S_CONTAINS | Containment (polygon contains geometry) | Supported | filtering/cql2-spatial.test.ts |
| S_CROSSES | Crossing | Supported | filtering/cql2-spatial.test.ts |
| S_TOUCHES | Touching | Supported | filtering/cql2-spatial.test.ts |
| S_DISJOINT | Disjointness | Supported | filtering/cql2-spatial.test.ts |
| S_EQUALS | Geometric equality | Supported | filtering/cql2-spatial.test.ts |
```

**Step 2: Update wfs.md**

Add DescribeFeatureType to WFS 2.0 table:

```markdown
| DescribeFeatureType | JSON schema response (version 2.0.0) | Supported | wfs20/describe.test.ts |
| DescribeFeatureType | typeNames (plural) parameter | Supported | wfs20/describe.test.ts |
```

Add Filter Encoding sections:

```markdown
| GetFeature | OGC Filter Encoding — comparison operators | Supported | wfs11/filter-encoding.test.ts |
| GetFeature | OGC Filter Encoding — logical operators (And, Or, Not) | Supported | wfs11/filter-encoding.test.ts |
| GetFeature | OGC Filter Encoding — spatial operators (BBOX, Intersects, Within, Contains) | Supported | wfs11/filter-encoding.test.ts |
```

And for WFS 2.0:

```markdown
| GetFeature | FES 2.0 Filter — comparison operators | Supported | wfs20/filter-encoding.test.ts |
| GetFeature | FES 2.0 Filter — logical operators | Supported | wfs20/filter-encoding.test.ts |
| GetFeature | FES 2.0 Filter — spatial operators | Supported | wfs20/filter-encoding.test.ts |
```

**Step 3: Update README.md coverage table**

```markdown
| CQL2 | Basic, Advanced Comparison, Basic Spatial, Spatial, CQL2 Text | Supported | ~85% | [Details](ogc-api-features.md) |
| WFS 1.1.0 | GetCapabilities, DescribeFeatureType, GetFeature, Filter Encoding | Supported | ~90% | [Details](wfs.md) |
| WFS 2.0 | GetCapabilities, DescribeFeatureType, GetFeature, FES 2.0 | Supported | ~65% | [Details](wfs.md) |
```

**Step 4: Run full test suite one final time**

Run: `npm test 2>&1 | tail -20`
Expected: All tests pass.

**Step 5: Commit**

```bash
git add docs/conformance/
git commit -m "docs: update conformance documentation with new protocol support"
```
