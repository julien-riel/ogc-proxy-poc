# Phase 2 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add plugin system, CQL2 filters, spatial operations (Turf.js + WFS pass-through), sorting, download limits, `/queryables`, and a real WFS upstream collection (PAVICS Ouranos).

**Architecture:** The proxy pipeline becomes hookable via async plugins. A CQL2 parser produces an AST that is either translated to upstream params (pass-through) or evaluated post-fetch (Turf.js for spatial, JS for scalar). A built-in `wfs-upstream` plugin handles WFS upstream collections with full filter/sort pass-through.

**Tech Stack:** Node.js, Express, TypeScript, Vitest, Turf.js (`@turf/boolean-intersects`, `@turf/boolean-within`, `@turf/distance`, `@turf/bbox`), existing `fast-xml-parser` for WFS XML generation.

**Design doc:** `docs/plans/2026-03-05-phase2-phase3-design.md`

---

## Task 1: Extend types for Phase 2 config

**Files:**
- Modify: `packages/proxy/src/engine/types.ts`
- Test: `packages/proxy/src/engine/registry.test.ts`

**Step 1: Update PropertyConfig and CollectionConfig types**

Replace the content of `packages/proxy/src/engine/types.ts`:

```typescript
export interface UpstreamPropertyMapping {
  param?: string;
  operators?: string[];
  sortParam?: string;
  sortDesc?: string;
}

export interface PropertyConfig {
  name: string;
  type: string;
  filterable?: boolean;
  sortable?: boolean;
  upstream?: UpstreamPropertyMapping;
}

export interface OffsetLimitPagination {
  type: 'offset-limit';
  offsetParam: string;
  limitParam: string;
}

export interface PagePagination {
  type: 'page-pageSize';
  pageParam: string;
  pageSizeParam: string;
}

export interface CursorPagination {
  type: 'cursor';
  cursorParam: string;
  limitParam: string;
  nextCursorField: string;
}

export type PaginationConfig = OffsetLimitPagination | PagePagination | CursorPagination;

export interface CollectionConfig {
  title: string;
  description?: string;
  plugin?: string;
  maxPageSize?: number;
  maxFeatures?: number;
  upstream: {
    type?: 'rest' | 'wfs';
    baseUrl: string;
    method: string;
    pagination: PaginationConfig;
    responseMapping: {
      items: string;
      total: string | null;
      item: string;
    };
    spatialCapabilities?: string[];
    // WFS-specific
    typeName?: string;
    version?: string;
  };
  geometry: {
    type: 'Point' | 'LineString' | 'Polygon';
    xField?: string;
    yField?: string;
    coordsField?: string;
    wktField?: string;
  };
  idField: string;
  properties: PropertyConfig[];
}

export interface DefaultsConfig {
  maxPageSize?: number;
  maxFeatures?: number;
}

export interface RegistryConfig {
  defaults?: DefaultsConfig;
  collections: Record<string, CollectionConfig>;
}
```

**Step 2: Run existing tests to verify no regressions**

Run: `cd packages/proxy && npx vitest run`
Expected: All existing tests PASS (types are structural, existing YAML still conforms)

**Step 3: Commit**

```bash
git add packages/proxy/src/engine/types.ts
git commit -m "feat: extend types for Phase 2 (plugin, filters, sort, limits)"
```

---

## Task 2: Plugin system — interface and loader

**Files:**
- Create: `packages/proxy/src/engine/plugin.ts`
- Test: `packages/proxy/src/engine/plugin.test.ts`

**Step 1: Write the failing test**

Create `packages/proxy/src/engine/plugin.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { loadPlugin, runHook, type CollectionPlugin } from './plugin.js';

describe('Plugin system', () => {
  describe('loadPlugin', () => {
    it('returns null for undefined plugin config', async () => {
      const plugin = await loadPlugin(undefined);
      expect(plugin).toBeNull();
    });

    it('loads a built-in plugin by name', async () => {
      // 'noop' is a test built-in that does nothing
      const plugin = await loadPlugin('noop');
      expect(plugin).toBeDefined();
    });

    it('returns null for unknown built-in name', async () => {
      const plugin = await loadPlugin('unknown-plugin-name');
      expect(plugin).toBeNull();
    });
  });

  describe('runHook', () => {
    it('returns input unchanged when plugin is null', async () => {
      const input = { foo: 'bar' };
      const result = await runHook(null, 'transformRequest', input);
      expect(result).toBe(input);
    });

    it('returns input unchanged when hook is not defined on plugin', async () => {
      const plugin: CollectionPlugin = {};
      const input = { foo: 'bar' };
      const result = await runHook(plugin, 'transformRequest', input);
      expect(result).toBe(input);
    });

    it('calls the hook and returns its result', async () => {
      const plugin: CollectionPlugin = {
        transformRequest: async (req) => ({ ...req, modified: true }),
      };
      const result = await runHook(plugin, 'transformRequest', { original: true });
      expect(result).toEqual({ original: true, modified: true });
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd packages/proxy && npx vitest run src/engine/plugin.test.ts`
Expected: FAIL — module `./plugin.js` not found

**Step 3: Write the implementation**

Create `packages/proxy/src/engine/plugin.ts`:

```typescript
import type { Feature } from 'geojson';

export interface OgcRequest {
  collectionId: string;
  limit: number;
  offset: number;
  bbox?: [number, number, number, number];
  filter?: string;
  filterLang?: string;
  sortby?: string;
  queryParams: Record<string, string>;
}

export interface UpstreamRequest {
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: string;
}

export interface OgcResponse {
  type: 'FeatureCollection';
  features: Feature[];
  links: Array<{ href: string; rel: string; type: string }>;
  numberMatched?: number;
  numberReturned: number;
  timeStamp: string;
}

export interface CollectionPlugin {
  skipGeojsonBuilder?: boolean;
  transformRequest?(req: OgcRequest): Promise<OgcRequest>;
  buildUpstreamRequest?(req: UpstreamRequest): Promise<UpstreamRequest>;
  transformUpstreamResponse?(raw: unknown): Promise<unknown>;
  transformFeature?(feature: Feature): Promise<Feature>;
  transformFeatures?(features: Feature[]): Promise<Feature[]>;
  transformResponse?(res: OgcResponse): Promise<OgcResponse>;
}

const builtinPlugins: Record<string, CollectionPlugin> = {
  noop: {},
};

/**
 * Register a built-in plugin by name.
 */
export function registerBuiltinPlugin(name: string, plugin: CollectionPlugin): void {
  builtinPlugins[name] = plugin;
}

/**
 * Load a plugin by name (built-in) or file path (custom).
 * Returns null if no plugin is configured or not found.
 */
export async function loadPlugin(pluginRef: string | undefined): Promise<CollectionPlugin | null> {
  if (!pluginRef) return null;

  // Built-in plugin
  if (!pluginRef.startsWith('./') && !pluginRef.startsWith('/')) {
    return builtinPlugins[pluginRef] ?? null;
  }

  // Custom plugin from file path
  try {
    const mod = await import(pluginRef);
    return (mod.default ?? mod) as CollectionPlugin;
  } catch {
    return null;
  }
}

type HookName = keyof Omit<CollectionPlugin, 'skipGeojsonBuilder'>;

/**
 * Run a plugin hook if it exists, otherwise return input unchanged.
 */
export async function runHook<T>(
  plugin: CollectionPlugin | null,
  hookName: HookName,
  input: T,
): Promise<T> {
  if (!plugin) return input;
  const hook = plugin[hookName] as ((input: T) => Promise<T>) | undefined;
  if (!hook) return input;
  return hook(input);
}
```

**Step 4: Run test to verify it passes**

Run: `cd packages/proxy && npx vitest run src/engine/plugin.test.ts`
Expected: PASS

**Step 5: Run all existing tests**

Run: `cd packages/proxy && npx vitest run`
Expected: All PASS

**Step 6: Commit**

```bash
git add packages/proxy/src/engine/plugin.ts packages/proxy/src/engine/plugin.test.ts
git commit -m "feat: add plugin system with async hooks and built-in registry"
```

---

## Task 3: Plugin loader integration into registry

**Files:**
- Modify: `packages/proxy/src/engine/registry.ts`
- Test: `packages/proxy/src/engine/registry.test.ts`

**Step 1: Write the failing test**

Add to `packages/proxy/src/engine/registry.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { getCollectionPlugin } from './registry.js';

describe('Registry — Plugin loading', () => {
  it('returns null for a collection with no plugin', async () => {
    const plugin = await getCollectionPlugin('bornes-fontaines');
    expect(plugin).toBeNull();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd packages/proxy && npx vitest run src/engine/registry.test.ts`
Expected: FAIL — `getCollectionPlugin` not exported

**Step 3: Implement plugin cache in registry**

Add to `packages/proxy/src/engine/registry.ts` (after existing exports):

```typescript
import { loadPlugin, type CollectionPlugin } from './plugin.js';

const pluginCache = new Map<string, CollectionPlugin | null>();

export async function getCollectionPlugin(collectionId: string): Promise<CollectionPlugin | null> {
  if (pluginCache.has(collectionId)) {
    return pluginCache.get(collectionId)!;
  }
  const config = getCollection(collectionId);
  const plugin = await loadPlugin(config?.plugin);
  pluginCache.set(collectionId, plugin);
  return plugin;
}
```

**Step 4: Run test to verify it passes**

Run: `cd packages/proxy && npx vitest run src/engine/registry.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/proxy/src/engine/registry.ts packages/proxy/src/engine/registry.test.ts
git commit -m "feat: integrate plugin loader into registry with caching"
```

---

## Task 4: Download limits (maxPageSize + maxFeatures)

**Files:**
- Create: `packages/proxy/src/engine/limits.ts`
- Test: `packages/proxy/src/engine/limits.test.ts`
- Modify: `packages/proxy/src/config/collections.yaml` (add defaults section)

**Step 1: Write the failing test**

Create `packages/proxy/src/engine/limits.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { applyLimits, type LimitsResult } from './limits.js';
import type { CollectionConfig, DefaultsConfig } from './types.js';

const defaults: DefaultsConfig = { maxPageSize: 1000, maxFeatures: 10000 };

describe('applyLimits', () => {
  it('caps limit to maxPageSize', () => {
    const result = applyLimits({ limit: 5000, offset: 0 }, { maxPageSize: 500 }, defaults);
    expect(result.limit).toBe(500);
    expect(result.capped).toBe(true);
  });

  it('uses collection maxPageSize over defaults', () => {
    const result = applyLimits({ limit: 800, offset: 0 }, { maxPageSize: 200 }, defaults);
    expect(result.limit).toBe(200);
  });

  it('uses default maxPageSize when collection has none', () => {
    const result = applyLimits({ limit: 5000, offset: 0 }, {}, defaults);
    expect(result.limit).toBe(1000);
  });

  it('does not cap limit when under maxPageSize', () => {
    const result = applyLimits({ limit: 10, offset: 0 }, {}, defaults);
    expect(result.limit).toBe(10);
    expect(result.capped).toBe(false);
  });

  it('rejects offset beyond maxFeatures', () => {
    const result = applyLimits({ limit: 10, offset: 15000 }, {}, defaults);
    expect(result.rejected).toBe(true);
  });

  it('signals suppressNext when offset + limit >= maxFeatures', () => {
    const result = applyLimits({ limit: 100, offset: 9950 }, {}, defaults);
    expect(result.suppressNext).toBe(true);
  });

  it('does not suppress next when within maxFeatures', () => {
    const result = applyLimits({ limit: 100, offset: 0 }, {}, defaults);
    expect(result.suppressNext).toBe(false);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd packages/proxy && npx vitest run src/engine/limits.test.ts`
Expected: FAIL — module not found

**Step 3: Implement limits**

Create `packages/proxy/src/engine/limits.ts`:

```typescript
import type { DefaultsConfig } from './types.js';

interface LimitsInput {
  limit: number;
  offset: number;
}

export interface LimitsResult {
  limit: number;
  offset: number;
  capped: boolean;
  rejected: boolean;
  suppressNext: boolean;
  maxPageSize: number;
  maxFeatures: number;
}

interface CollectionLimits {
  maxPageSize?: number;
  maxFeatures?: number;
}

export function applyLimits(
  input: LimitsInput,
  collection: CollectionLimits,
  defaults: DefaultsConfig,
): LimitsResult {
  const maxPageSize = collection.maxPageSize ?? defaults.maxPageSize ?? 1000;
  const maxFeatures = collection.maxFeatures ?? defaults.maxFeatures ?? 10000;

  const capped = input.limit > maxPageSize;
  const limit = Math.min(input.limit, maxPageSize);
  const rejected = input.offset >= maxFeatures;
  const suppressNext = input.offset + limit >= maxFeatures;

  return {
    limit,
    offset: input.offset,
    capped,
    rejected,
    suppressNext,
    maxPageSize,
    maxFeatures,
  };
}
```

**Step 4: Run test to verify it passes**

Run: `cd packages/proxy && npx vitest run src/engine/limits.test.ts`
Expected: PASS

**Step 5: Add defaults to collections.yaml**

Add at the top of `packages/proxy/src/config/collections.yaml` (before `collections:`):

```yaml
defaults:
  maxPageSize: 1000
  maxFeatures: 10000

collections:
  # ... existing collections unchanged
```

**Step 6: Run all tests**

Run: `cd packages/proxy && npx vitest run`
Expected: All PASS

**Step 7: Commit**

```bash
git add packages/proxy/src/engine/limits.ts packages/proxy/src/engine/limits.test.ts packages/proxy/src/config/collections.yaml
git commit -m "feat: add download limits (maxPageSize + maxFeatures)"
```

---

## Task 5: CQL2 parser — lexer and AST types

**Files:**
- Create: `packages/proxy/src/engine/cql2/types.ts`
- Create: `packages/proxy/src/engine/cql2/lexer.ts`
- Test: `packages/proxy/src/engine/cql2/lexer.test.ts`

**Step 1: Create AST types**

Create `packages/proxy/src/engine/cql2/types.ts`:

```typescript
export type CqlNode =
  | CqlComparison
  | CqlLogical
  | CqlSpatial
  | CqlLike
  | CqlNot;

export interface CqlComparison {
  type: 'comparison';
  property: string;
  operator: '=' | '<>' | '<' | '>' | '<=' | '>=';
  value: string | number;
}

export interface CqlLike {
  type: 'like';
  property: string;
  pattern: string;
}

export interface CqlLogical {
  type: 'logical';
  operator: 'AND' | 'OR';
  left: CqlNode;
  right: CqlNode;
}

export interface CqlNot {
  type: 'not';
  operand: CqlNode;
}

export interface CqlSpatial {
  type: 'spatial';
  operator: 'S_INTERSECTS' | 'S_WITHIN' | 'S_DWITHIN';
  property: string;
  geometry: GeoJSON.Geometry;
  distance?: number;
  distanceUnits?: string;
}

export type Token =
  | { type: 'PROPERTY'; value: string }
  | { type: 'STRING'; value: string }
  | { type: 'NUMBER'; value: number }
  | { type: 'OPERATOR'; value: string }
  | { type: 'KEYWORD'; value: string }
  | { type: 'LPAREN' }
  | { type: 'RPAREN' }
  | { type: 'COMMA' }
  | { type: 'EOF' };
```

**Step 2: Write the failing lexer test**

Create `packages/proxy/src/engine/cql2/lexer.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { tokenize } from './lexer.js';

describe('CQL2 Lexer', () => {
  it('tokenizes a simple comparison', () => {
    const tokens = tokenize("etat='actif'");
    expect(tokens).toEqual([
      { type: 'PROPERTY', value: 'etat' },
      { type: 'OPERATOR', value: '=' },
      { type: 'STRING', value: 'actif' },
      { type: 'EOF' },
    ]);
  });

  it('tokenizes numeric comparison', () => {
    const tokens = tokenize('population>50000');
    expect(tokens).toEqual([
      { type: 'PROPERTY', value: 'population' },
      { type: 'OPERATOR', value: '>' },
      { type: 'NUMBER', value: 50000 },
      { type: 'EOF' },
    ]);
  });

  it('tokenizes AND/OR keywords', () => {
    const tokens = tokenize("etat='actif' AND population>100");
    expect(tokens[0]).toEqual({ type: 'PROPERTY', value: 'etat' });
    expect(tokens[3]).toEqual({ type: 'KEYWORD', value: 'AND' });
    expect(tokens[4]).toEqual({ type: 'PROPERTY', value: 'population' });
  });

  it('tokenizes LIKE keyword', () => {
    const tokens = tokenize("nom LIKE 'Rose%'");
    expect(tokens[1]).toEqual({ type: 'KEYWORD', value: 'LIKE' });
    expect(tokens[2]).toEqual({ type: 'STRING', value: 'Rose%' });
  });

  it('tokenizes spatial function call', () => {
    const tokens = tokenize("S_INTERSECTS(geometry,POINT(-73.5 45.5))");
    expect(tokens[0]).toEqual({ type: 'KEYWORD', value: 'S_INTERSECTS' });
    expect(tokens[1]).toEqual({ type: 'LPAREN' });
    expect(tokens[2]).toEqual({ type: 'PROPERTY', value: 'geometry' });
    expect(tokens[3]).toEqual({ type: 'COMMA' });
  });

  it('tokenizes <> operator', () => {
    const tokens = tokenize("etat<>'inactif'");
    expect(tokens[1]).toEqual({ type: 'OPERATOR', value: '<>' });
  });

  it('tokenizes <= and >= operators', () => {
    const tokens = tokenize('pop>=100 AND pop<=500');
    expect(tokens[1]).toEqual({ type: 'OPERATOR', value: '>=' });
    expect(tokens[5]).toEqual({ type: 'OPERATOR', value: '<=' });
  });

  it('tokenizes negative numbers', () => {
    const tokens = tokenize('x>-73.5');
    expect(tokens[2]).toEqual({ type: 'NUMBER', value: -73.5 });
  });

  it('tokenizes NOT keyword', () => {
    const tokens = tokenize("NOT etat='inactif'");
    expect(tokens[0]).toEqual({ type: 'KEYWORD', value: 'NOT' });
  });
});
```

**Step 3: Run test to verify it fails**

Run: `cd packages/proxy && npx vitest run src/engine/cql2/lexer.test.ts`
Expected: FAIL — module not found

**Step 4: Implement the lexer**

Create `packages/proxy/src/engine/cql2/lexer.ts`:

```typescript
import type { Token } from './types.js';

const KEYWORDS = new Set([
  'AND', 'OR', 'NOT', 'LIKE',
  'S_INTERSECTS', 'S_WITHIN', 'S_DWITHIN',
  'POINT', 'LINESTRING', 'POLYGON',
]);

const OPERATORS = ['<>', '<=', '>=', '=', '<', '>'];

export function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;

  while (i < input.length) {
    // Skip whitespace
    if (/\s/.test(input[i])) {
      i++;
      continue;
    }

    // String literal
    if (input[i] === "'") {
      i++;
      let str = '';
      while (i < input.length && input[i] !== "'") {
        if (input[i] === "'" && input[i + 1] === "'") {
          str += "'";
          i += 2;
        } else {
          str += input[i];
          i++;
        }
      }
      i++; // closing quote
      tokens.push({ type: 'STRING', value: str });
      continue;
    }

    // Parentheses and comma
    if (input[i] === '(') { tokens.push({ type: 'LPAREN' }); i++; continue; }
    if (input[i] === ')') { tokens.push({ type: 'RPAREN' }); i++; continue; }
    if (input[i] === ',') { tokens.push({ type: 'COMMA' }); i++; continue; }

    // Operators (check multi-char first)
    const opMatch = OPERATORS.find(op => input.slice(i, i + op.length) === op);
    if (opMatch) {
      // Check if this is a negative number: operator followed by digit with no space
      if ((opMatch === '>' || opMatch === '<' || opMatch === '=') &&
          input[i + opMatch.length] === '-' &&
          /\d/.test(input[i + opMatch.length + 1])) {
        tokens.push({ type: 'OPERATOR', value: opMatch });
        i += opMatch.length;
        // Fall through to number parsing below
      } else {
        tokens.push({ type: 'OPERATOR', value: opMatch });
        i += opMatch.length;
        continue;
      }
    }

    // Number (including negative)
    if (/[-\d]/.test(input[i]) && (input[i] !== '-' || /\d/.test(input[i + 1]))) {
      // Check that '-' is a negative sign, not a property name character
      if (input[i] === '-') {
        // Only treat as number if previous token is an operator
        const prev = tokens[tokens.length - 1];
        if (prev && (prev.type === 'OPERATOR' || prev.type === 'COMMA' || prev.type === 'LPAREN')) {
          let num = '';
          num += input[i]; i++;
          while (i < input.length && /[\d.]/.test(input[i])) {
            num += input[i]; i++;
          }
          tokens.push({ type: 'NUMBER', value: parseFloat(num) });
          continue;
        }
      } else {
        let num = '';
        while (i < input.length && /[\d.]/.test(input[i])) {
          num += input[i]; i++;
        }
        tokens.push({ type: 'NUMBER', value: parseFloat(num) });
        continue;
      }
    }

    // Word (keyword or property name)
    if (/[a-zA-Z_]/.test(input[i])) {
      let word = '';
      while (i < input.length && /[a-zA-Z0-9_]/.test(input[i])) {
        word += input[i]; i++;
      }
      if (KEYWORDS.has(word.toUpperCase())) {
        tokens.push({ type: 'KEYWORD', value: word.toUpperCase() });
      } else {
        tokens.push({ type: 'PROPERTY', value: word });
      }
      continue;
    }

    // Unknown character — skip
    i++;
  }

  tokens.push({ type: 'EOF' });
  return tokens;
}
```

**Step 5: Run test to verify it passes**

Run: `cd packages/proxy && npx vitest run src/engine/cql2/lexer.test.ts`
Expected: PASS

**Step 6: Commit**

```bash
git add packages/proxy/src/engine/cql2/
git commit -m "feat: add CQL2 lexer with support for comparisons, keywords, spatial functions"
```

---

## Task 6: CQL2 parser — AST generation

**Files:**
- Create: `packages/proxy/src/engine/cql2/parser.ts`
- Test: `packages/proxy/src/engine/cql2/parser.test.ts`

**Step 1: Write the failing test**

Create `packages/proxy/src/engine/cql2/parser.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { parseCql2 } from './parser.js';

describe('CQL2 Parser', () => {
  it('parses simple equality', () => {
    const ast = parseCql2("etat='actif'");
    expect(ast).toEqual({
      type: 'comparison',
      property: 'etat',
      operator: '=',
      value: 'actif',
    });
  });

  it('parses numeric comparison', () => {
    const ast = parseCql2('population>50000');
    expect(ast).toEqual({
      type: 'comparison',
      property: 'population',
      operator: '>',
      value: 50000,
    });
  });

  it('parses AND expression', () => {
    const ast = parseCql2("etat='actif' AND population>100");
    expect(ast.type).toBe('logical');
    if (ast.type === 'logical') {
      expect(ast.operator).toBe('AND');
      expect(ast.left.type).toBe('comparison');
      expect(ast.right.type).toBe('comparison');
    }
  });

  it('parses OR expression', () => {
    const ast = parseCql2("etat='actif' OR etat='maintenance'");
    expect(ast.type).toBe('logical');
    if (ast.type === 'logical') {
      expect(ast.operator).toBe('OR');
    }
  });

  it('parses NOT expression', () => {
    const ast = parseCql2("NOT etat='inactif'");
    expect(ast.type).toBe('not');
    if (ast.type === 'not') {
      expect(ast.operand.type).toBe('comparison');
    }
  });

  it('parses LIKE expression', () => {
    const ast = parseCql2("nom LIKE 'Rose%'");
    expect(ast).toEqual({
      type: 'like',
      property: 'nom',
      pattern: 'Rose%',
    });
  });

  it('parses S_INTERSECTS with POINT', () => {
    const ast = parseCql2('S_INTERSECTS(geometry,POINT(-73.5 45.5))');
    expect(ast.type).toBe('spatial');
    if (ast.type === 'spatial') {
      expect(ast.operator).toBe('S_INTERSECTS');
      expect(ast.property).toBe('geometry');
      expect(ast.geometry).toEqual({
        type: 'Point',
        coordinates: [-73.5, 45.5],
      });
    }
  });

  it('parses S_WITHIN with POLYGON', () => {
    const ast = parseCql2(
      'S_WITHIN(geometry,POLYGON((-73.6 45.4,-73.5 45.4,-73.5 45.5,-73.6 45.5,-73.6 45.4)))'
    );
    expect(ast.type).toBe('spatial');
    if (ast.type === 'spatial') {
      expect(ast.operator).toBe('S_WITHIN');
      expect(ast.geometry.type).toBe('Polygon');
    }
  });

  it('parses S_DWITHIN with distance', () => {
    const ast = parseCql2('S_DWITHIN(geometry,POINT(-73.5 45.5),1000,meters)');
    expect(ast.type).toBe('spatial');
    if (ast.type === 'spatial') {
      expect(ast.operator).toBe('S_DWITHIN');
      expect(ast.distance).toBe(1000);
      expect(ast.distanceUnits).toBe('meters');
    }
  });

  it('parses AND with three terms (left-associative)', () => {
    const ast = parseCql2("a='1' AND b='2' AND c='3'");
    expect(ast.type).toBe('logical');
    if (ast.type === 'logical') {
      expect(ast.left.type).toBe('logical');
      expect(ast.right.type).toBe('comparison');
    }
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd packages/proxy && npx vitest run src/engine/cql2/parser.test.ts`
Expected: FAIL — module not found

**Step 3: Implement the parser**

Create `packages/proxy/src/engine/cql2/parser.ts`:

```typescript
import { tokenize } from './lexer.js';
import type { Token, CqlNode, CqlSpatial } from './types.js';

class Parser {
  private tokens: Token[];
  private pos = 0;

  constructor(tokens: Token[]) {
    this.tokens = tokens;
  }

  private peek(): Token {
    return this.tokens[this.pos];
  }

  private advance(): Token {
    return this.tokens[this.pos++];
  }

  private expect(type: string): Token {
    const t = this.advance();
    if (t.type !== type) {
      throw new Error(`Expected ${type}, got ${t.type}`);
    }
    return t;
  }

  parse(): CqlNode {
    const node = this.parseOr();
    return node;
  }

  private parseOr(): CqlNode {
    let left = this.parseAnd();
    while (this.peek().type === 'KEYWORD' && (this.peek() as any).value === 'OR') {
      this.advance();
      const right = this.parseAnd();
      left = { type: 'logical', operator: 'OR', left, right };
    }
    return left;
  }

  private parseAnd(): CqlNode {
    let left = this.parseUnary();
    while (this.peek().type === 'KEYWORD' && (this.peek() as any).value === 'AND') {
      this.advance();
      const right = this.parseUnary();
      left = { type: 'logical', operator: 'AND', left, right };
    }
    return left;
  }

  private parseUnary(): CqlNode {
    if (this.peek().type === 'KEYWORD' && (this.peek() as any).value === 'NOT') {
      this.advance();
      const operand = this.parsePrimary();
      return { type: 'not', operand };
    }
    return this.parsePrimary();
  }

  private parsePrimary(): CqlNode {
    const token = this.peek();

    // Spatial function
    if (token.type === 'KEYWORD' && ['S_INTERSECTS', 'S_WITHIN', 'S_DWITHIN'].includes(token.value)) {
      return this.parseSpatial();
    }

    // Parenthesized expression
    if (token.type === 'LPAREN') {
      this.advance();
      const node = this.parseOr();
      this.expect('RPAREN');
      return node;
    }

    // Property-based expression (comparison or LIKE)
    if (token.type === 'PROPERTY') {
      const property = (this.advance() as { value: string }).value;

      // LIKE
      if (this.peek().type === 'KEYWORD' && (this.peek() as any).value === 'LIKE') {
        this.advance();
        const pattern = (this.expect('STRING') as { value: string }).value;
        return { type: 'like', property, pattern };
      }

      // Comparison
      const op = (this.expect('OPERATOR') as { value: string }).value;
      const valToken = this.advance();
      const value = valToken.type === 'STRING'
        ? (valToken as { value: string }).value
        : (valToken as { value: number }).value;
      return {
        type: 'comparison',
        property,
        operator: op as any,
        value,
      };
    }

    throw new Error(`Unexpected token: ${JSON.stringify(token)}`);
  }

  private parseSpatial(): CqlSpatial {
    const opToken = this.advance() as { value: string };
    const operator = opToken.value as CqlSpatial['operator'];
    this.expect('LPAREN');
    const property = (this.expect('PROPERTY') as { value: string }).value;
    this.expect('COMMA');
    const geometry = this.parseGeometry();

    let distance: number | undefined;
    let distanceUnits: string | undefined;
    if (operator === 'S_DWITHIN' && this.peek().type === 'COMMA') {
      this.advance(); // comma
      distance = (this.expect('NUMBER') as { value: number }).value;
      this.expect('COMMA');
      distanceUnits = (this.expect('PROPERTY') as { value: string }).value;
    }

    this.expect('RPAREN');
    return { type: 'spatial', operator, property, geometry, distance, distanceUnits };
  }

  private parseGeometry(): GeoJSON.Geometry {
    const token = this.peek();
    if (token.type !== 'KEYWORD') {
      throw new Error(`Expected geometry type, got ${token.type}`);
    }

    const geomType = (this.advance() as { value: string }).value;

    switch (geomType) {
      case 'POINT': return this.parsePoint();
      case 'POLYGON': return this.parsePolygon();
      case 'LINESTRING': return this.parseLineString();
      default: throw new Error(`Unsupported geometry type: ${geomType}`);
    }
  }

  private parsePoint(): GeoJSON.Geometry {
    this.expect('LPAREN');
    const x = (this.expect('NUMBER') as { value: number }).value;
    const y = (this.expect('NUMBER') as { value: number }).value;
    this.expect('RPAREN');
    return { type: 'Point', coordinates: [x, y] };
  }

  private parseCoordList(): number[][] {
    const coords: number[][] = [];
    const x = (this.expect('NUMBER') as { value: number }).value;
    const y = (this.expect('NUMBER') as { value: number }).value;
    coords.push([x, y]);

    while (this.peek().type === 'COMMA') {
      this.advance();
      // Check if next is a number (coordinate) or something else (end of coords)
      if (this.peek().type !== 'NUMBER') break;
      const cx = (this.expect('NUMBER') as { value: number }).value;
      const cy = (this.expect('NUMBER') as { value: number }).value;
      coords.push([cx, cy]);
    }
    return coords;
  }

  private parseLineString(): GeoJSON.Geometry {
    this.expect('LPAREN');
    const coords = this.parseCoordList();
    this.expect('RPAREN');
    return { type: 'LineString', coordinates: coords };
  }

  private parsePolygon(): GeoJSON.Geometry {
    this.expect('LPAREN');
    this.expect('LPAREN');
    const ring = this.parseCoordList();
    this.expect('RPAREN');
    this.expect('RPAREN');
    return { type: 'Polygon', coordinates: [ring] };
  }
}

export function parseCql2(input: string): CqlNode {
  const tokens = tokenize(input);
  const parser = new Parser(tokens);
  return parser.parse();
}
```

**Step 4: Run test to verify it passes**

Run: `cd packages/proxy && npx vitest run src/engine/cql2/parser.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/proxy/src/engine/cql2/parser.ts packages/proxy/src/engine/cql2/parser.test.ts
git commit -m "feat: add CQL2 parser with comparison, logical, spatial, LIKE support"
```

---

## Task 7: CQL2 evaluator — post-fetch filtering

**Files:**
- Create: `packages/proxy/src/engine/cql2/evaluator.ts`
- Test: `packages/proxy/src/engine/cql2/evaluator.test.ts`

**Step 1: Install Turf.js dependencies**

Run: `cd packages/proxy && npm install @turf/boolean-intersects @turf/boolean-within @turf/distance @turf/bbox @turf/helpers`

**Step 2: Write the failing test**

Create `packages/proxy/src/engine/cql2/evaluator.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { evaluateFilter } from './evaluator.js';
import { parseCql2 } from './parser.js';
import type { Feature, Point, Polygon } from 'geojson';

function makePoint(lon: number, lat: number, props: Record<string, unknown> = {}): Feature<Point> {
  return {
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [lon, lat] },
    properties: props,
  };
}

describe('CQL2 Evaluator', () => {
  describe('Comparison operators', () => {
    it('evaluates = on string', () => {
      const ast = parseCql2("etat='actif'");
      const feature = makePoint(0, 0, { etat: 'actif' });
      expect(evaluateFilter(ast, feature)).toBe(true);
    });

    it('evaluates = on string (no match)', () => {
      const ast = parseCql2("etat='actif'");
      const feature = makePoint(0, 0, { etat: 'inactif' });
      expect(evaluateFilter(ast, feature)).toBe(false);
    });

    it('evaluates > on number', () => {
      const ast = parseCql2('population>50000');
      expect(evaluateFilter(ast, makePoint(0, 0, { population: 100000 }))).toBe(true);
      expect(evaluateFilter(ast, makePoint(0, 0, { population: 30000 }))).toBe(false);
    });

    it('evaluates <> (not equal)', () => {
      const ast = parseCql2("etat<>'inactif'");
      expect(evaluateFilter(ast, makePoint(0, 0, { etat: 'actif' }))).toBe(true);
      expect(evaluateFilter(ast, makePoint(0, 0, { etat: 'inactif' }))).toBe(false);
    });
  });

  describe('Logical operators', () => {
    it('evaluates AND', () => {
      const ast = parseCql2("etat='actif' AND population>50000");
      expect(evaluateFilter(ast, makePoint(0, 0, { etat: 'actif', population: 100000 }))).toBe(true);
      expect(evaluateFilter(ast, makePoint(0, 0, { etat: 'actif', population: 30000 }))).toBe(false);
    });

    it('evaluates OR', () => {
      const ast = parseCql2("etat='actif' OR etat='maintenance'");
      expect(evaluateFilter(ast, makePoint(0, 0, { etat: 'maintenance' }))).toBe(true);
      expect(evaluateFilter(ast, makePoint(0, 0, { etat: 'inactif' }))).toBe(false);
    });

    it('evaluates NOT', () => {
      const ast = parseCql2("NOT etat='inactif'");
      expect(evaluateFilter(ast, makePoint(0, 0, { etat: 'actif' }))).toBe(true);
      expect(evaluateFilter(ast, makePoint(0, 0, { etat: 'inactif' }))).toBe(false);
    });
  });

  describe('LIKE', () => {
    it('matches with % wildcard', () => {
      const ast = parseCql2("nom LIKE 'Rose%'");
      expect(evaluateFilter(ast, makePoint(0, 0, { nom: 'Rosemont-La Petite-Patrie' }))).toBe(true);
      expect(evaluateFilter(ast, makePoint(0, 0, { nom: 'Verdun' }))).toBe(false);
    });
  });

  describe('Spatial — S_INTERSECTS', () => {
    it('matches a point inside a polygon', () => {
      const ast = parseCql2(
        'S_INTERSECTS(geometry,POLYGON((-74 45,-73 45,-73 46,-74 46,-74 45)))'
      );
      expect(evaluateFilter(ast, makePoint(-73.5, 45.5))).toBe(true);
    });

    it('rejects a point outside a polygon', () => {
      const ast = parseCql2(
        'S_INTERSECTS(geometry,POLYGON((-74 45,-73 45,-73 46,-74 46,-74 45)))'
      );
      expect(evaluateFilter(ast, makePoint(-75, 45.5))).toBe(false);
    });
  });

  describe('Spatial — S_DWITHIN', () => {
    it('matches a point within distance', () => {
      const ast = parseCql2('S_DWITHIN(geometry,POINT(-73.5 45.5),50000,meters)');
      expect(evaluateFilter(ast, makePoint(-73.55, 45.52))).toBe(true);
    });

    it('rejects a point beyond distance', () => {
      const ast = parseCql2('S_DWITHIN(geometry,POINT(-73.5 45.5),1,meters)');
      expect(evaluateFilter(ast, makePoint(-75, 47))).toBe(false);
    });
  });
});
```

**Step 3: Run test to verify it fails**

Run: `cd packages/proxy && npx vitest run src/engine/cql2/evaluator.test.ts`
Expected: FAIL — module not found

**Step 4: Implement the evaluator**

Create `packages/proxy/src/engine/cql2/evaluator.ts`:

```typescript
import type { Feature } from 'geojson';
import type { CqlNode } from './types.js';
import booleanIntersects from '@turf/boolean-intersects';
import booleanWithin from '@turf/boolean-within';
import turfDistance from '@turf/distance';
import { point as turfPoint } from '@turf/helpers';

function getPropertyValue(feature: Feature, property: string): unknown {
  if (property === 'geometry') return feature.geometry;
  return feature.properties?.[property];
}

function likeToRegex(pattern: string): RegExp {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/%/g, '.*')
    .replace(/_/g, '.');
  return new RegExp(`^${escaped}$`, 'i');
}

export function evaluateFilter(node: CqlNode, feature: Feature): boolean {
  switch (node.type) {
    case 'comparison': {
      const val = getPropertyValue(feature, node.property);
      const target = node.value;
      switch (node.operator) {
        case '=': return val == target;
        case '<>': return val != target;
        case '<': return (val as number) < (target as number);
        case '>': return (val as number) > (target as number);
        case '<=': return (val as number) <= (target as number);
        case '>=': return (val as number) >= (target as number);
        default: return false;
      }
    }

    case 'like': {
      const val = String(getPropertyValue(feature, node.property) ?? '');
      return likeToRegex(node.pattern).test(val);
    }

    case 'logical': {
      const left = evaluateFilter(node.left, feature);
      const right = evaluateFilter(node.right, feature);
      return node.operator === 'AND' ? left && right : left || right;
    }

    case 'not':
      return !evaluateFilter(node.operand, feature);

    case 'spatial': {
      const geom = feature.geometry;
      if (!geom) return false;

      switch (node.operator) {
        case 'S_INTERSECTS':
          return booleanIntersects(feature, node.geometry);

        case 'S_WITHIN':
          return booleanWithin(feature, node.geometry as any);

        case 'S_DWITHIN': {
          if (!node.distance) return false;
          const refCoords = (node.geometry as GeoJSON.Point).coordinates;
          const featureCoords = geom.type === 'Point'
            ? (geom as GeoJSON.Point).coordinates
            : null;
          if (!featureCoords) return false;

          const units = node.distanceUnits === 'meters' ? 'kilometers' : 'kilometers';
          const threshold = node.distanceUnits === 'meters'
            ? node.distance / 1000
            : node.distance;
          const d = turfDistance(
            turfPoint(featureCoords),
            turfPoint(refCoords),
            { units },
          );
          return d <= threshold;
        }

        default:
          return false;
      }
    }

    default:
      return false;
  }
}
```

**Step 5: Run test to verify it passes**

Run: `cd packages/proxy && npx vitest run src/engine/cql2/evaluator.test.ts`
Expected: PASS

**Step 6: Create index barrel export**

Create `packages/proxy/src/engine/cql2/index.ts`:

```typescript
export { parseCql2 } from './parser.js';
export { evaluateFilter } from './evaluator.js';
export type { CqlNode, CqlSpatial } from './types.js';
```

**Step 7: Commit**

```bash
git add packages/proxy/src/engine/cql2/
git commit -m "feat: add CQL2 evaluator with Turf.js spatial operations"
```

---

## Task 8: CQL2-to-bbox extractor for upstream optimization

**Files:**
- Create: `packages/proxy/src/engine/cql2/bbox-extractor.ts`
- Test: `packages/proxy/src/engine/cql2/bbox-extractor.test.ts`

**Step 1: Write the failing test**

Create `packages/proxy/src/engine/cql2/bbox-extractor.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { extractBboxFromAst } from './bbox-extractor.js';
import { parseCql2 } from './parser.js';

describe('extractBboxFromAst', () => {
  it('extracts bbox from S_INTERSECTS with POLYGON', () => {
    const ast = parseCql2(
      'S_INTERSECTS(geometry,POLYGON((-74 45,-73 45,-73 46,-74 46,-74 45)))'
    );
    const bbox = extractBboxFromAst(ast);
    expect(bbox).toEqual([-74, 45, -73, 46]);
  });

  it('extracts bbox from S_WITHIN with POLYGON', () => {
    const ast = parseCql2(
      'S_WITHIN(geometry,POLYGON((-73.6 45.4,-73.5 45.4,-73.5 45.5,-73.6 45.5,-73.6 45.4)))'
    );
    const bbox = extractBboxFromAst(ast);
    expect(bbox).toEqual([-73.6, 45.4, -73.5, 45.5]);
  });

  it('extracts bbox from S_DWITHIN with POINT (buffer)', () => {
    const ast = parseCql2('S_DWITHIN(geometry,POINT(-73.5 45.5),1000,meters)');
    const bbox = extractBboxFromAst(ast);
    expect(bbox).toBeDefined();
    // ~0.009 degrees per km at this latitude
    expect(bbox![0]).toBeLessThan(-73.5);
    expect(bbox![2]).toBeGreaterThan(-73.5);
  });

  it('returns null for non-spatial filter', () => {
    const ast = parseCql2("etat='actif'");
    expect(extractBboxFromAst(ast)).toBeNull();
  });

  it('extracts bbox from spatial inside AND', () => {
    const ast = parseCql2(
      "etat='actif' AND S_INTERSECTS(geometry,POLYGON((-74 45,-73 45,-73 46,-74 46,-74 45)))"
    );
    const bbox = extractBboxFromAst(ast);
    expect(bbox).toEqual([-74, 45, -73, 46]);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd packages/proxy && npx vitest run src/engine/cql2/bbox-extractor.test.ts`
Expected: FAIL — module not found

**Step 3: Implement the extractor**

Create `packages/proxy/src/engine/cql2/bbox-extractor.ts`:

```typescript
import turfBbox from '@turf/bbox';
import { point as turfPoint } from '@turf/helpers';
import type { CqlNode } from './types.js';

/**
 * Walk the AST and extract a bounding box from the first spatial predicate found.
 * For S_DWITHIN, buffers the point by the distance.
 * Returns [minLon, minLat, maxLon, maxLat] or null.
 */
export function extractBboxFromAst(node: CqlNode): [number, number, number, number] | null {
  switch (node.type) {
    case 'spatial': {
      if (node.operator === 'S_DWITHIN' && node.geometry.type === 'Point' && node.distance) {
        const [lon, lat] = node.geometry.coordinates;
        const distKm = node.distanceUnits === 'meters'
          ? node.distance / 1000
          : node.distance;
        // Approximate degrees from km
        const latDelta = distKm / 111.32;
        const lonDelta = distKm / (111.32 * Math.cos((lat * Math.PI) / 180));
        return [lon - lonDelta, lat - latDelta, lon + lonDelta, lat + latDelta];
      }
      const bbox = turfBbox(node.geometry);
      return [bbox[0], bbox[1], bbox[2], bbox[3]];
    }

    case 'logical': {
      const left = extractBboxFromAst(node.left);
      if (left) return left;
      return extractBboxFromAst(node.right);
    }

    case 'not':
      return extractBboxFromAst(node.operand);

    default:
      return null;
  }
}
```

**Step 4: Run test to verify it passes**

Run: `cd packages/proxy && npx vitest run src/engine/cql2/bbox-extractor.test.ts`
Expected: PASS

**Step 5: Update barrel export**

Add to `packages/proxy/src/engine/cql2/index.ts`:

```typescript
export { extractBboxFromAst } from './bbox-extractor.js';
```

**Step 6: Commit**

```bash
git add packages/proxy/src/engine/cql2/
git commit -m "feat: add bbox extractor from CQL2 AST for upstream optimization"
```

---

## Task 9: Add filter support to mock API

**Files:**
- Modify: `packages/mock-api/src/routes/bornes.ts`
- Modify: `packages/mock-api/src/routes/pistes.ts`
- Modify: `packages/mock-api/src/routes/arrondissements.ts`

The mock API needs to support attribute filtering and bbox for pass-through testing.

**Step 1: Update bornes-fontaines route**

Replace `packages/mock-api/src/routes/bornes.ts`:

```typescript
import { Router } from 'express';
import { bornesFontaines } from '../data/bornes-fontaines.js';

const router = Router();

router.get('/', (req, res) => {
  const offset = parseInt(req.query.offset as string) || 0;
  const limit = parseInt(req.query.limit as string) || 10;

  let filtered = bornesFontaines;

  // Attribute filters
  const { etat, arrondissement } = req.query;
  if (etat) filtered = filtered.filter(b => b.etat === etat);
  if (arrondissement) filtered = filtered.filter(b => b.arrondissement === arrondissement);

  // Bbox filter: bbox=minLon,minLat,maxLon,maxLat
  const bboxStr = req.query.bbox as string | undefined;
  if (bboxStr) {
    const [minLon, minLat, maxLon, maxLat] = bboxStr.split(',').map(Number);
    filtered = filtered.filter(b =>
      b.x >= minLon && b.x <= maxLon && b.y >= minLat && b.y <= maxLat
    );
  }

  // Sort support: sort_by=field or sort_by=-field
  const sortBy = req.query.sort_by as string | undefined;
  if (sortBy) {
    const desc = sortBy.startsWith('-');
    const field = desc ? sortBy.slice(1) : sortBy;
    filtered = [...filtered].sort((a, b) => {
      const va = (a as any)[field];
      const vb = (b as any)[field];
      if (va < vb) return desc ? 1 : -1;
      if (va > vb) return desc ? -1 : 1;
      return 0;
    });
  }

  const page = filtered.slice(offset, offset + limit);
  res.json({ data: page, total: filtered.length });
});

router.get('/:id', (req, res) => {
  const item = bornesFontaines.find(b => b.id === parseInt(req.params.id));
  if (!item) return res.status(404).json({ error: 'Not found' });
  res.json({ data: item });
});

export default router;
```

**Step 2: Update pistes-cyclables route**

Replace `packages/mock-api/src/routes/pistes.ts`:

```typescript
import { Router } from 'express';
import { pistesCyclables } from '../data/pistes-cyclables.js';

const router = Router();

router.get('/', (req, res) => {
  const page = parseInt(req.query.page as string) || 1;
  const pageSize = parseInt(req.query.pageSize as string) || 10;

  let filtered = pistesCyclables;

  // Attribute filters
  const { nom, type: typeFilter } = req.query;
  if (nom) filtered = filtered.filter(p => p.nom === nom);
  if (typeFilter) filtered = filtered.filter(p => p.type === typeFilter);

  const start = (page - 1) * pageSize;
  const items = filtered.slice(start, start + pageSize);
  res.json({
    results: items,
    count: filtered.length,
    page,
    totalPages: Math.ceil(filtered.length / pageSize),
  });
});

router.get('/:id', (req, res) => {
  const item = pistesCyclables.find(p => p.id === parseInt(req.params.id));
  if (!item) return res.status(404).json({ error: 'Not found' });
  res.json({ result: item });
});

export default router;
```

**Step 3: Update arrondissements route**

Replace `packages/mock-api/src/routes/arrondissements.ts`:

```typescript
import { Router } from 'express';
import { arrondissements } from '../data/arrondissements.js';

const router = Router();

router.get('/', (req, res) => {
  const cursor = req.query.cursor as string | undefined;
  const limit = parseInt(req.query.limit as string) || 10;

  let filtered = arrondissements;

  // Attribute filters
  const { nom } = req.query;
  if (nom) filtered = filtered.filter(a => a.nom === nom);

  let startIndex = 0;
  if (cursor) {
    const cursorIndex = filtered.findIndex(a => a.code === cursor);
    startIndex = cursorIndex >= 0 ? cursorIndex + 1 : 0;
  }

  const items = filtered.slice(startIndex, startIndex + limit);
  const hasMore = startIndex + limit < filtered.length;
  const nextCursor = hasMore ? items[items.length - 1].code : null;

  res.json({ items, nextCursor });
});

router.get('/:code', (req, res) => {
  const item = arrondissements.find(a => a.code === req.params.code);
  if (!item) return res.status(404).json({ error: 'Not found' });
  res.json({ item });
});

export default router;
```

**Step 4: Run existing conformance tests**

Run: `npm run test:conformance`
Expected: All PASS (new params are optional, don't break existing behavior)

**Step 5: Commit**

```bash
git add packages/mock-api/src/routes/
git commit -m "feat: add attribute filter, bbox, and sort support to mock API"
```

---

## Task 10: Update YAML config with filter/sort metadata

**Files:**
- Modify: `packages/proxy/src/config/collections.yaml`

**Step 1: Update collections.yaml**

Replace `packages/proxy/src/config/collections.yaml`:

```yaml
defaults:
  maxPageSize: 1000
  maxFeatures: 10000

collections:
  bornes-fontaines:
    title: "Bornes-fontaines"
    description: "Bornes-fontaines municipales"
    upstream:
      type: "rest"
      baseUrl: "${UPSTREAM_HOST}/api/bornes-fontaines"
      method: GET
      pagination:
        type: "offset-limit"
        offsetParam: "offset"
        limitParam: "limit"
      responseMapping:
        items: "data"
        total: "total"
        item: "data"
      spatialCapabilities:
        - "bbox"
    geometry:
      type: Point
      xField: "x"
      yField: "y"
    idField: "id"
    properties:
      - name: "etat"
        type: "string"
        filterable: true
        upstream:
          param: "etat"
          operators: ["="]
      - name: "arrondissement"
        type: "string"
        filterable: true
        upstream:
          param: "arrondissement"
          operators: ["="]

  pistes-cyclables:
    title: "Pistes cyclables"
    description: "Reseau cyclable municipal"
    upstream:
      type: "rest"
      baseUrl: "${UPSTREAM_HOST}/api/pistes-cyclables"
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
      coordsField: "geometry.coords"
    idField: "id"
    properties:
      - name: "nom"
        type: "string"
        filterable: true
        upstream:
          param: "nom"
          operators: ["="]
      - name: "type"
        type: "string"
        filterable: true
        upstream:
          param: "type"
          operators: ["="]
      - name: "longueur"
        type: "double"
        filterable: true

  arrondissements:
    title: "Arrondissements"
    description: "Arrondissements de la ville"
    upstream:
      type: "rest"
      baseUrl: "${UPSTREAM_HOST}/api/arrondissements"
      method: GET
      pagination:
        type: "cursor"
        cursorParam: "cursor"
        limitParam: "limit"
        nextCursorField: "nextCursor"
      responseMapping:
        items: "items"
        total: null
        item: "item"
      spatialCapabilities:
        - "bbox"
    geometry:
      type: Polygon
      wktField: "wkt"
    idField: "code"
    properties:
      - name: "nom"
        type: "string"
        filterable: true
        upstream:
          param: "nom"
          operators: ["="]
      - name: "population"
        type: "int"
        filterable: true
        sortable: true

  mrc-quebec:
    title: "MRC du Quebec"
    description: "Municipalites regionales de comte du Quebec (PAVICS Ouranos)"
    plugin: "wfs-upstream"
    upstream:
      type: "wfs"
      baseUrl: "https://pavics.ouranos.ca/geoserver/wfs"
      typeName: "public:quebec_mrc_boundaries"
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
        - "within"
        - "dwithin"
    geometry:
      type: Polygon
    idField: "id"
    properties:
      - name: "NOM_MRC"
        type: "string"
        filterable: true
        sortable: true
      - name: "RES_CO_MRC"
        type: "string"
        filterable: true
```

**Step 2: Run existing tests**

Run: `cd packages/proxy && npx vitest run`
Expected: All PASS

**Step 3: Commit**

```bash
git add packages/proxy/src/config/collections.yaml
git commit -m "feat: update YAML with filter/sort metadata and mrc-quebec WFS collection"
```

---

## Task 11: Integrate filters, limits, and plugins into OGC items endpoint

**Files:**
- Modify: `packages/proxy/src/ogc/items.ts`
- Modify: `packages/proxy/src/engine/adapter.ts`

This is the core integration task. The items endpoint needs to:
1. Apply download limits
2. Parse simple query string filters and CQL2
3. Build upstream request with pass-through filters
4. Run plugin hooks
5. Evaluate remaining filters post-fetch with CQL2 evaluator
6. Apply spatial filtering via Turf.js

**Step 1: Update adapter to support filter pass-through**

Add to `packages/proxy/src/engine/adapter.ts`, modify the `FetchParams` interface and `fetchOffsetLimit`:

In `packages/proxy/src/engine/adapter.ts`, replace the `FetchParams` interface:

```typescript
interface FetchParams {
  offset: number;
  limit: number;
  bbox?: [number, number, number, number];
  upstreamParams?: Record<string, string>;
}
```

Then update `fetchOffsetLimit` to apply upstream params:

```typescript
async function fetchOffsetLimit(config: CollectionConfig, params: FetchParams): Promise<UpstreamPage> {
  const pagination = config.upstream.pagination as { offsetParam: string; limitParam: string };
  const url = new URL(config.upstream.baseUrl);
  url.searchParams.set(pagination.offsetParam, String(params.offset));
  url.searchParams.set(pagination.limitParam, String(params.limit));

  if (params.bbox) {
    url.searchParams.set('bbox', params.bbox.join(','));
  }
  if (params.upstreamParams) {
    for (const [key, value] of Object.entries(params.upstreamParams)) {
      url.searchParams.set(key, value);
    }
  }

  const body = await fetchJson(url.toString());
  return { items: extractItems(body, config), total: extractTotal(body, config) };
}
```

Apply the same `upstreamParams` and `bbox` pattern to `fetchPageBased` and `fetchCursorBased`.

**Step 2: Rewrite items.ts with full pipeline**

Replace `packages/proxy/src/ogc/items.ts`:

```typescript
import type { Request, Response } from 'express';
import { getCollection, getCollectionPlugin } from '../engine/registry.js';
import { getRegistry } from '../engine/registry.js';
import { fetchUpstreamItems, fetchUpstreamItem, UpstreamError } from '../engine/adapter.js';
import { buildFeatureCollection, buildFeature } from '../engine/geojson-builder.js';
import { applyLimits } from '../engine/limits.js';
import { parseCql2, evaluateFilter, extractBboxFromAst } from '../engine/cql2/index.js';
import { runHook } from '../engine/plugin.js';
import type { CqlNode } from '../engine/cql2/types.js';
import type { PropertyConfig } from '../engine/types.js';

function getBaseUrl(req: Request): string {
  return process.env.BASE_URL || `${req.protocol}://${req.get('host')}/ogc`;
}

function parseBbox(bboxStr: string): [number, number, number, number] | undefined {
  const parts = bboxStr.split(',').map(Number);
  if (parts.length === 4 && parts.every(n => !isNaN(n))) {
    return parts as [number, number, number, number];
  }
  return undefined;
}

function isInBbox(feature: GeoJSON.Feature, bbox: [number, number, number, number]): boolean {
  const [minLon, minLat, maxLon, maxLat] = bbox;
  const geom = feature.geometry;
  if (!geom) return false;

  const coords: number[][] = [];
  if (geom.type === 'Point') {
    coords.push(geom.coordinates as number[]);
  } else if (geom.type === 'LineString') {
    coords.push(...(geom.coordinates as number[][]));
  } else if (geom.type === 'Polygon') {
    coords.push(...(geom.coordinates as number[][][])[0]);
  }

  return coords.some(([lon, lat]) =>
    lon >= minLon && lon <= maxLon && lat >= minLat && lat <= maxLat
  );
}

/**
 * Build upstream query params from simple query string filters.
 * Only passes through properties that are filterable with upstream mapping.
 */
function buildUpstreamFilters(
  queryParams: Record<string, string>,
  properties: PropertyConfig[],
): Record<string, string> {
  const params: Record<string, string> = {};
  for (const prop of properties) {
    if (!prop.filterable || !prop.upstream?.param) continue;
    const value = queryParams[prop.name];
    if (value !== undefined) {
      params[prop.upstream.param] = value;
    }
  }
  return params;
}

/**
 * Build simple query string filters as CQL2 AST for post-fetch evaluation.
 * Only includes properties that are NOT passed through to upstream.
 */
function buildPostFetchSimpleFilters(
  queryParams: Record<string, string>,
  properties: PropertyConfig[],
): CqlNode | null {
  const nodes: CqlNode[] = [];
  for (const prop of properties) {
    if (!prop.filterable) continue;
    const value = queryParams[prop.name];
    if (value === undefined) continue;
    // Skip if already passed to upstream
    if (prop.upstream?.param && prop.upstream.operators?.includes('=')) continue;
    nodes.push({
      type: 'comparison',
      property: prop.name,
      operator: '=',
      value: isNaN(Number(value)) ? value : Number(value),
    });
  }
  if (nodes.length === 0) return null;
  return nodes.reduce((acc, node) => ({
    type: 'logical' as const,
    operator: 'AND' as const,
    left: acc,
    right: node,
  }));
}

export async function getItems(req: Request, res: Response) {
  const { collectionId } = req.params;
  const config = getCollection(collectionId);

  if (!config) {
    return res.status(404).json({ code: 'NotFound', description: `Collection '${collectionId}' not found` });
  }

  const registry = getRegistry();
  const defaults = registry.defaults ?? {};

  // Apply limits
  const rawLimit = parseInt(req.query.limit as string) || 10;
  const rawOffset = parseInt(req.query.offset as string) || 0;
  const limits = applyLimits({ limit: rawLimit, offset: rawOffset }, config, defaults);

  if (limits.rejected) {
    return res.status(400).json({
      code: 'LimitExceeded',
      description: `Offset ${rawOffset} exceeds maxFeatures (${limits.maxFeatures})`,
    });
  }

  const limit = limits.limit;
  const offset = limits.offset;

  // Parse bbox
  const bboxStr = req.query.bbox as string | undefined;
  let bbox = bboxStr ? parseBbox(bboxStr) : undefined;

  // Parse CQL2 filter
  const filterStr = req.query.filter as string | undefined;
  let cqlAst: CqlNode | null = null;
  if (filterStr) {
    try {
      cqlAst = parseCql2(filterStr);
      // Extract bbox from spatial predicates for upstream optimization
      if (!bbox) {
        bbox = extractBboxFromAst(cqlAst) ?? undefined;
      }
    } catch (err) {
      return res.status(400).json({
        code: 'InvalidFilter',
        description: err instanceof Error ? err.message : 'Invalid CQL2 filter',
      });
    }
  }

  // Build upstream params from simple query string filters
  const queryParams: Record<string, string> = {};
  for (const [key, val] of Object.entries(req.query)) {
    if (typeof val === 'string') queryParams[key] = val;
  }
  const upstreamParams = buildUpstreamFilters(queryParams, config.properties);

  // Build post-fetch filter for simple params not passed to upstream
  const postFetchSimpleAst = buildPostFetchSimpleFilters(queryParams, config.properties);

  // Load plugin
  const plugin = await getCollectionPlugin(collectionId);

  try {
    // Hook: transformRequest
    let ogcReq = {
      collectionId,
      limit,
      offset,
      bbox,
      filter: filterStr,
      filterLang: req.query['filter-lang'] as string,
      sortby: req.query.sortby as string,
      queryParams,
    };
    ogcReq = await runHook(plugin, 'transformRequest', ogcReq);

    // Fetch upstream
    const upstream = await fetchUpstreamItems(config, {
      offset: ogcReq.offset,
      limit: ogcReq.limit,
      bbox: ogcReq.bbox,
      upstreamParams,
    });

    // Hook: transformUpstreamResponse
    let rawItems = await runHook(plugin, 'transformUpstreamResponse', upstream.items);

    // Build features (skip if plugin says so)
    let features: GeoJSON.Feature[];
    if (plugin?.skipGeojsonBuilder) {
      features = rawItems as unknown as GeoJSON.Feature[];
    } else {
      features = (rawItems as Record<string, unknown>[]).map(item => buildFeature(item, config));
    }

    // Hook: transformFeatures (batch)
    if (plugin?.transformFeatures) {
      features = await plugin.transformFeatures(features);
    }

    // Hook: transformFeature (per-item)
    if (plugin?.transformFeature) {
      features = await Promise.all(features.map(f => plugin.transformFeature!(f)));
    }

    // Post-fetch bbox filter (for REST upstreams that don't support bbox)
    if (bbox && config.upstream.type !== 'wfs') {
      features = features.filter(f => isInBbox(f, bbox!));
    }

    // Post-fetch CQL2 filter
    if (cqlAst) {
      features = features.filter(f => evaluateFilter(cqlAst!, f));
    }

    // Post-fetch simple filters not passed to upstream
    if (postFetchSimpleAst) {
      features = features.filter(f => evaluateFilter(postFetchSimpleAst, f));
    }

    // Build response
    let fc = buildFeatureCollection(
      [], // We pass features directly below
      config,
      { baseUrl: getBaseUrl(req), collectionId, offset, limit, total: upstream.total },
    );
    fc = { ...fc, features, numberReturned: features.length };

    // Suppress next link if at maxFeatures
    if (limits.suppressNext) {
      fc = { ...fc, links: fc.links.filter(l => l.rel !== 'next') };
    }

    // Hook: transformResponse
    fc = await runHook(plugin, 'transformResponse', fc);

    if (limits.capped) {
      res.set('OGC-maxPageSize', String(limits.maxPageSize));
    }
    res.set('Content-Type', 'application/geo+json');
    res.json(fc);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(502).json({ code: 'UpstreamError', description: message });
  }
}

export async function getItem(req: Request, res: Response) {
  const { collectionId, featureId } = req.params;
  const config = getCollection(collectionId);

  if (!config) {
    return res.status(404).json({ code: 'NotFound', description: `Collection '${collectionId}' not found` });
  }

  try {
    const plugin = await getCollectionPlugin(collectionId);
    const raw = await fetchUpstreamItem(config, featureId);
    if (!raw) {
      return res.status(404).json({ code: 'NotFound', description: `Feature '${featureId}' not found` });
    }

    let feature: GeoJSON.Feature;
    if (plugin?.skipGeojsonBuilder) {
      feature = raw as unknown as GeoJSON.Feature;
    } else {
      feature = buildFeature(raw, config);
    }

    if (plugin?.transformFeature) {
      feature = await plugin.transformFeature(feature);
    }

    const base = getBaseUrl(req);
    const response = {
      ...feature,
      links: [
        { href: `${base}/collections/${collectionId}/items/${featureId}`, rel: 'self', type: 'application/geo+json' },
        { href: `${base}/collections/${collectionId}`, rel: 'collection', type: 'application/json' },
      ],
    };

    res.set('Content-Type', 'application/geo+json');
    res.json(response);
  } catch (err) {
    if (err instanceof UpstreamError && err.statusCode === 404) {
      return res.status(404).json({ code: 'NotFound', description: `Feature '${featureId}' not found` });
    }
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(502).json({ code: 'UpstreamError', description: message });
  }
}
```

**Step 3: Run all tests**

Run: `npm test`
Expected: All PASS

**Step 4: Commit**

```bash
git add packages/proxy/src/ogc/items.ts packages/proxy/src/engine/adapter.ts
git commit -m "feat: integrate CQL2 filters, limits, and plugin hooks into items endpoint"
```

---

## Task 12: `/queryables` endpoint

**Files:**
- Create: `packages/proxy/src/ogc/queryables.ts`
- Modify: `packages/proxy/src/ogc/router.ts`
- Test: `packages/conformance-tests/src/ogc/queryables.test.ts`

**Step 1: Write the failing conformance test**

Create `packages/conformance-tests/src/ogc/queryables.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { fetchJson } from '../helpers.js';

describe('OGC API — Queryables (/ogc/collections/:id/queryables)', () => {
  it('returns 200 with JSON Schema', async () => {
    const { status, body } = await fetchJson('/ogc/collections/bornes-fontaines/queryables');
    expect(status).toBe(200);
    expect(body.$schema).toContain('json-schema.org');
    expect(body.type).toBe('object');
  });

  it('includes only filterable properties', async () => {
    const { body } = await fetchJson('/ogc/collections/bornes-fontaines/queryables');
    expect(body.properties.etat).toBeDefined();
    expect(body.properties.arrondissement).toBeDefined();
  });

  it('includes geometry for spatial queries', async () => {
    const { body } = await fetchJson('/ogc/collections/bornes-fontaines/queryables');
    expect(body.properties.geometry).toBeDefined();
  });

  it('includes sortable annotation', async () => {
    const { body } = await fetchJson('/ogc/collections/arrondissements/queryables');
    expect(body.properties.population['x-ogc-sortable']).toBe(true);
  });

  it('returns 404 for unknown collection', async () => {
    const { status } = await fetchJson('/ogc/collections/unknown/queryables');
    expect(status).toBe(404);
  });
});
```

**Step 2: Implement queryables**

Create `packages/proxy/src/ogc/queryables.ts`:

```typescript
import type { Request, Response } from 'express';
import { getCollection } from '../engine/registry.js';

function getBaseUrl(req: Request): string {
  return process.env.BASE_URL || `${req.protocol}://${req.get('host')}/ogc`;
}

const TYPE_MAP: Record<string, string> = {
  string: 'string',
  int: 'integer',
  integer: 'integer',
  double: 'number',
  boolean: 'boolean',
};

const GEOM_REF: Record<string, string> = {
  Point: 'https://geojson.org/schema/Point.json',
  LineString: 'https://geojson.org/schema/LineString.json',
  Polygon: 'https://geojson.org/schema/Polygon.json',
};

export function getQueryables(req: Request, res: Response) {
  const { collectionId } = req.params;
  const config = getCollection(collectionId);

  if (!config) {
    return res.status(404).json({ code: 'NotFound', description: `Collection '${collectionId}' not found` });
  }

  const base = getBaseUrl(req);
  const properties: Record<string, Record<string, unknown>> = {};

  for (const prop of config.properties) {
    if (!prop.filterable) continue;
    const schema: Record<string, unknown> = {
      type: TYPE_MAP[prop.type] ?? 'string',
    };
    if (prop.sortable) {
      schema['x-ogc-sortable'] = true;
    }
    properties[prop.name] = schema;
  }

  // Add geometry
  properties.geometry = {
    $ref: GEOM_REF[config.geometry.type] ?? GEOM_REF.Point,
  };

  res.json({
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $id: `${base}/collections/${collectionId}/queryables`,
    type: 'object',
    title: config.title,
    properties,
  });
}
```

**Step 3: Register the route**

Add to `packages/proxy/src/ogc/router.ts`:

```typescript
import { getQueryables } from './queryables.js';
// Add after the collections/:collectionId route:
router.get('/collections/:collectionId/queryables', getQueryables);
```

**Step 4: Run conformance tests**

Run: `npm run test:conformance`
Expected: All PASS (including new queryables tests)

**Step 5: Commit**

```bash
git add packages/proxy/src/ogc/queryables.ts packages/proxy/src/ogc/router.ts packages/conformance-tests/src/ogc/queryables.test.ts
git commit -m "feat: add /queryables endpoint (OGC API Features Part 3)"
```

---

## Task 13: Sorting support

**Files:**
- Create: `packages/proxy/src/engine/sorting.ts`
- Test: `packages/proxy/src/engine/sorting.test.ts`

**Step 1: Write the failing test**

Create `packages/proxy/src/engine/sorting.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { parseSortby, buildUpstreamSort, validateSortable } from './sorting.js';
import type { PropertyConfig } from './types.js';

describe('parseSortby', () => {
  it('parses ascending field', () => {
    expect(parseSortby('population')).toEqual([{ field: 'population', order: 'asc' }]);
  });

  it('parses descending field', () => {
    expect(parseSortby('-population')).toEqual([{ field: 'population', order: 'desc' }]);
  });

  it('parses multiple fields', () => {
    const result = parseSortby('arrondissement,-population');
    expect(result).toEqual([
      { field: 'arrondissement', order: 'asc' },
      { field: 'population', order: 'desc' },
    ]);
  });
});

describe('validateSortable', () => {
  const properties: PropertyConfig[] = [
    { name: 'population', type: 'int', sortable: true, upstream: { sortParam: 'sort_by', sortDesc: '-' } },
    { name: 'nom', type: 'string', sortable: true },
    { name: 'etat', type: 'string' },
  ];

  it('returns null for sortable fields with upstream support', () => {
    const error = validateSortable([{ field: 'population', order: 'asc' }], properties);
    expect(error).toBeNull();
  });

  it('returns error for non-sortable field', () => {
    const error = validateSortable([{ field: 'etat', order: 'asc' }], properties);
    expect(error).toContain('etat');
  });

  it('returns error for sortable field without upstream support', () => {
    const error = validateSortable([{ field: 'nom', order: 'asc' }], properties);
    expect(error).toContain('nom');
  });
});

describe('buildUpstreamSort', () => {
  const properties: PropertyConfig[] = [
    { name: 'population', type: 'int', sortable: true, upstream: { sortParam: 'sort_by', sortDesc: '-' } },
  ];

  it('builds ascending sort param', () => {
    const result = buildUpstreamSort([{ field: 'population', order: 'asc' }], properties);
    expect(result).toEqual({ sort_by: 'population' });
  });

  it('builds descending sort param', () => {
    const result = buildUpstreamSort([{ field: 'population', order: 'desc' }], properties);
    expect(result).toEqual({ sort_by: '-population' });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd packages/proxy && npx vitest run src/engine/sorting.test.ts`
Expected: FAIL — module not found

**Step 3: Implement sorting**

Create `packages/proxy/src/engine/sorting.ts`:

```typescript
import type { PropertyConfig } from './types.js';

export interface SortField {
  field: string;
  order: 'asc' | 'desc';
}

export function parseSortby(sortby: string): SortField[] {
  return sortby.split(',').map(part => {
    const trimmed = part.trim();
    if (trimmed.startsWith('-')) {
      return { field: trimmed.slice(1), order: 'desc' };
    }
    return { field: trimmed, order: 'asc' };
  });
}

/**
 * Validate that all sort fields are sortable and have upstream support.
 * Returns an error message or null.
 */
export function validateSortable(sortFields: SortField[], properties: PropertyConfig[]): string | null {
  for (const sf of sortFields) {
    const prop = properties.find(p => p.name === sf.field);
    if (!prop || !prop.sortable) {
      return `Property '${sf.field}' is not sortable`;
    }
    if (!prop.upstream?.sortParam) {
      return `Property '${sf.field}' is sortable but upstream does not support sorting on this field`;
    }
  }
  return null;
}

/**
 * Build upstream query params for sorting.
 */
export function buildUpstreamSort(
  sortFields: SortField[],
  properties: PropertyConfig[],
): Record<string, string> {
  const params: Record<string, string> = {};
  for (const sf of sortFields) {
    const prop = properties.find(p => p.name === sf.field);
    if (!prop?.upstream?.sortParam) continue;
    const prefix = sf.order === 'desc' ? (prop.upstream.sortDesc ?? '-') : '';
    params[prop.upstream.sortParam] = `${prefix}${sf.field}`;
  }
  return params;
}
```

**Step 4: Run test to verify it passes**

Run: `cd packages/proxy && npx vitest run src/engine/sorting.test.ts`
Expected: PASS

**Step 5: Integrate sorting into items.ts**

In `packages/proxy/src/ogc/items.ts`, add sorting logic in `getItems()` after limit parsing and before the fetch:

```typescript
import { parseSortby, validateSortable, buildUpstreamSort } from '../engine/sorting.js';

// In getItems(), after building upstreamParams:
const sortbyStr = req.query.sortby as string | undefined;
if (sortbyStr) {
  const sortFields = parseSortby(sortbyStr);
  const sortError = validateSortable(sortFields, config.properties);
  if (sortError) {
    return res.status(400).json({ code: 'InvalidSortby', description: sortError });
  }
  const sortParams = buildUpstreamSort(sortFields, config.properties);
  Object.assign(upstreamParams, sortParams);
}
```

**Step 6: Run all tests**

Run: `npm test`
Expected: All PASS

**Step 7: Commit**

```bash
git add packages/proxy/src/engine/sorting.ts packages/proxy/src/engine/sorting.test.ts packages/proxy/src/ogc/items.ts
git commit -m "feat: add sorting support (sortby parameter with upstream pass-through)"
```

---

## Task 14: `wfs-upstream` built-in plugin

**Files:**
- Create: `packages/proxy/src/plugins/wfs-upstream.ts`
- Test: `packages/proxy/src/plugins/wfs-upstream.test.ts`
- Modify: `packages/proxy/src/engine/plugin.ts` (register built-in)

**Step 1: Write the failing test**

Create `packages/proxy/src/plugins/wfs-upstream.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { buildWfsGetFeatureUrl } from './wfs-upstream.js';

describe('wfs-upstream plugin', () => {
  describe('buildWfsGetFeatureUrl', () => {
    const baseUrl = 'https://pavics.ouranos.ca/geoserver/wfs';
    const typeName = 'public:quebec_mrc_boundaries';

    it('builds basic GetFeature URL', () => {
      const url = buildWfsGetFeatureUrl(baseUrl, typeName, {
        startIndex: 0,
        count: 10,
        version: '1.1.0',
      });
      expect(url).toContain('service=WFS');
      expect(url).toContain('request=GetFeature');
      expect(url).toContain('typeName=public%3Aquebec_mrc_boundaries');
      expect(url).toContain('startIndex=0');
      expect(url).toContain('maxFeatures=10');
      expect(url).toContain('outputFormat=application%2Fjson');
    });

    it('includes sortBy when provided', () => {
      const url = buildWfsGetFeatureUrl(baseUrl, typeName, {
        startIndex: 0,
        count: 10,
        version: '1.1.0',
        sortBy: 'NOM_MRC',
      });
      expect(url).toContain('sortBy=NOM_MRC');
    });

    it('includes CQL_FILTER when provided', () => {
      const url = buildWfsGetFeatureUrl(baseUrl, typeName, {
        startIndex: 0,
        count: 10,
        version: '1.1.0',
        cqlFilter: "NOM_MRC='Acton'",
      });
      expect(url).toContain('CQL_FILTER=');
    });

    it('includes BBOX when provided', () => {
      const url = buildWfsGetFeatureUrl(baseUrl, typeName, {
        startIndex: 0,
        count: 10,
        version: '1.1.0',
        bbox: [-73.6, 45.4, -73.5, 45.5],
      });
      expect(url).toContain('BBOX=');
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd packages/proxy && npx vitest run src/plugins/wfs-upstream.test.ts`
Expected: FAIL — module not found

**Step 3: Implement the plugin**

Create `packages/proxy/src/plugins/wfs-upstream.ts`:

```typescript
import type { CollectionPlugin, OgcRequest, UpstreamRequest } from '../engine/plugin.js';
import type { Feature } from 'geojson';

interface WfsGetFeatureOptions {
  startIndex: number;
  count: number;
  version: string;
  sortBy?: string;
  cqlFilter?: string;
  bbox?: [number, number, number, number];
}

export function buildWfsGetFeatureUrl(
  baseUrl: string,
  typeName: string,
  options: WfsGetFeatureOptions,
): string {
  const url = new URL(baseUrl);
  url.searchParams.set('service', 'WFS');
  url.searchParams.set('version', options.version);
  url.searchParams.set('request', 'GetFeature');
  url.searchParams.set('typeName', typeName);
  url.searchParams.set('outputFormat', 'application/json');
  url.searchParams.set('startIndex', String(options.startIndex));
  url.searchParams.set('maxFeatures', String(options.count));

  if (options.sortBy) {
    url.searchParams.set('sortBy', options.sortBy);
  }

  if (options.cqlFilter) {
    url.searchParams.set('CQL_FILTER', options.cqlFilter);
  }

  if (options.bbox) {
    url.searchParams.set('BBOX', options.bbox.join(','));
  }

  return url.toString();
}

export const wfsUpstreamPlugin: CollectionPlugin = {
  skipGeojsonBuilder: true,

  async transformRequest(req: OgcRequest): Promise<OgcRequest> {
    // Pass through — the real work happens in buildUpstreamRequest
    return req;
  },

  async transformUpstreamResponse(raw: unknown): Promise<unknown> {
    // The WFS upstream returns GeoJSON features directly
    // raw is the parsed JSON response
    const response = raw as Record<string, unknown>;
    if (Array.isArray(response)) return response;

    // GeoServer returns { type: 'FeatureCollection', features: [...] }
    if (response.features && Array.isArray(response.features)) {
      return response.features;
    }
    return raw;
  },
};

export default wfsUpstreamPlugin;
```

**Step 4: Register in plugin.ts**

Add to `packages/proxy/src/engine/plugin.ts`, in the builtinPlugins object:

```typescript
import { wfsUpstreamPlugin } from '../plugins/wfs-upstream.js';

const builtinPlugins: Record<string, CollectionPlugin> = {
  noop: {},
  'wfs-upstream': wfsUpstreamPlugin,
};
```

Remove the `import` of wfsUpstreamPlugin from the initial builtinPlugins declaration and add it after. Actually, add the import at top and include in the initial object.

**Step 5: Run test to verify it passes**

Run: `cd packages/proxy && npx vitest run src/plugins/wfs-upstream.test.ts`
Expected: PASS

**Step 6: Run all tests**

Run: `cd packages/proxy && npx vitest run`
Expected: All PASS

**Step 7: Commit**

```bash
git add packages/proxy/src/plugins/ packages/proxy/src/engine/plugin.ts
git commit -m "feat: add wfs-upstream built-in plugin for WFS pass-through"
```

---

## Task 15: WFS upstream adapter integration in the main fetch pipeline

**Files:**
- Modify: `packages/proxy/src/engine/adapter.ts`

The adapter needs to handle WFS upstream collections differently: instead of using the pagination config to build REST URLs, it should delegate to the `wfs-upstream` plugin's URL builder.

**Step 1: Add WFS upstream support to adapter**

Add a new fetch strategy for WFS upstreams in `packages/proxy/src/engine/adapter.ts`:

```typescript
import { buildWfsGetFeatureUrl } from '../plugins/wfs-upstream.js';

async function fetchWfsUpstream(config: CollectionConfig, params: FetchParams): Promise<UpstreamPage> {
  const url = buildWfsGetFeatureUrl(
    config.upstream.baseUrl,
    config.upstream.typeName!,
    {
      startIndex: params.offset,
      count: params.limit,
      version: config.upstream.version ?? '1.1.0',
      bbox: params.bbox,
    },
  );

  const response = await fetch(url);
  if (!response.ok) {
    throw new UpstreamError(response.status);
  }
  const body = await response.json() as Record<string, unknown>;
  const features = (body.features ?? []) as Record<string, unknown>[];
  const total = body.totalFeatures as number | undefined;

  return { items: features, total };
}
```

Then in `fetchUpstreamItems`, add a check before the pagination switch:

```typescript
export async function fetchUpstreamItems(
  config: CollectionConfig,
  params: FetchParams,
): Promise<UpstreamPage> {
  if (config.upstream.type === 'wfs') {
    return fetchWfsUpstream(config, params);
  }

  switch (config.upstream.pagination.type) {
    // ... existing cases
  }
}
```

**Step 2: Run all tests**

Run: `npm test`
Expected: All PASS

**Step 3: Commit**

```bash
git add packages/proxy/src/engine/adapter.ts
git commit -m "feat: add WFS upstream fetch strategy to adapter"
```

---

## Task 16: Update conformance endpoint for Part 3

**Files:**
- Modify: `packages/proxy/src/ogc/conformance.ts`

**Step 1: Add Part 3 conformance classes**

In `packages/proxy/src/ogc/conformance.ts`, add the Part 3 conformance URIs:

```typescript
export function conformance(_req: Request, res: Response) {
  res.json({
    conformsTo: [
      'http://www.opengis.net/spec/ogcapi-features-1/1.0/conf/core',
      'http://www.opengis.net/spec/ogcapi-features-1/1.0/conf/geojson',
      'http://www.opengis.net/spec/ogcapi-features-1/1.0/conf/oas30',
      'http://www.opengis.net/spec/ogcapi-features-3/1.0/conf/filter',
      'http://www.opengis.net/spec/ogcapi-features-3/1.0/conf/features-filter',
    ],
  });
}
```

**Step 2: Run tests**

Run: `npm run test:conformance`
Expected: All PASS

**Step 3: Commit**

```bash
git add packages/proxy/src/ogc/conformance.ts
git commit -m "feat: add OGC API Features Part 3 conformance classes"
```

---

## Task 17: Update WFS capabilities for new collection and filters

**Files:**
- Modify: `packages/proxy/src/wfs/capabilities.ts`

**Step 1: Update Filter_Capabilities to declare supported operators**

Update the `Filter_Capabilities` section in `packages/proxy/src/wfs/capabilities.ts`:

```xml
<ogc:Filter_Capabilities>
  <ogc:Spatial_Capabilities>
    <ogc:GeometryOperands>
      <ogc:GeometryOperand>gml:Envelope</ogc:GeometryOperand>
      <ogc:GeometryOperand>gml:Point</ogc:GeometryOperand>
      <ogc:GeometryOperand>gml:Polygon</ogc:GeometryOperand>
    </ogc:GeometryOperands>
    <ogc:SpatialOperators>
      <ogc:SpatialOperator name="BBOX"/>
      <ogc:SpatialOperator name="Intersects"/>
      <ogc:SpatialOperator name="Within"/>
    </ogc:SpatialOperators>
  </ogc:Spatial_Capabilities>
  <ogc:Scalar_Capabilities>
    <ogc:LogicalOperators/>
    <ogc:ComparisonOperators>
      <ogc:ComparisonOperator>EqualTo</ogc:ComparisonOperator>
      <ogc:ComparisonOperator>NotEqualTo</ogc:ComparisonOperator>
      <ogc:ComparisonOperator>LessThan</ogc:ComparisonOperator>
      <ogc:ComparisonOperator>GreaterThan</ogc:ComparisonOperator>
      <ogc:ComparisonOperator>LessThanEqualTo</ogc:ComparisonOperator>
      <ogc:ComparisonOperator>GreaterThanEqualTo</ogc:ComparisonOperator>
      <ogc:ComparisonOperator>Like</ogc:ComparisonOperator>
    </ogc:ComparisonOperators>
  </ogc:Scalar_Capabilities>
  <ogc:Id_Capabilities>
    <ogc:FID/>
  </ogc:Id_Capabilities>
</ogc:Filter_Capabilities>
```

**Step 2: Run WFS conformance tests**

Run: `npm run test:conformance`
Expected: All PASS

**Step 3: Commit**

```bash
git add packages/proxy/src/wfs/capabilities.ts
git commit -m "feat: update WFS capabilities with expanded filter declarations"
```

---

## Task 18: Conformance tests for Phase 2 features

**Files:**
- Create: `packages/conformance-tests/src/ogc/filters.test.ts`
- Create: `packages/conformance-tests/src/ogc/sorting.test.ts`
- Create: `packages/conformance-tests/src/ogc/limits.test.ts`

**Step 1: Write filter conformance tests**

Create `packages/conformance-tests/src/ogc/filters.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { fetchGeoJson } from '../helpers.js';

describe('OGC API — Simple query string filters', () => {
  it('filters bornes-fontaines by etat', async () => {
    const { body } = await fetchGeoJson(
      '/ogc/collections/bornes-fontaines/items?etat=actif&limit=100'
    );
    expect(body.features.length).toBeGreaterThan(0);
    for (const f of body.features) {
      expect(f.properties.etat).toBe('actif');
    }
  });

  it('filters bornes-fontaines by arrondissement', async () => {
    const { body } = await fetchGeoJson(
      '/ogc/collections/bornes-fontaines/items?arrondissement=Verdun&limit=100'
    );
    expect(body.features.length).toBeGreaterThan(0);
    for (const f of body.features) {
      expect(f.properties.arrondissement).toBe('Verdun');
    }
  });

  it('combines two filters with AND semantics', async () => {
    const { body } = await fetchGeoJson(
      '/ogc/collections/bornes-fontaines/items?etat=actif&arrondissement=Verdun&limit=100'
    );
    for (const f of body.features) {
      expect(f.properties.etat).toBe('actif');
      expect(f.properties.arrondissement).toBe('Verdun');
    }
  });
});

describe('OGC API — CQL2 filters', () => {
  it('filters with CQL2 equality', async () => {
    const filter = encodeURIComponent("etat='actif'");
    const { body } = await fetchGeoJson(
      `/ogc/collections/bornes-fontaines/items?filter=${filter}&filter-lang=cql2-text&limit=100`
    );
    expect(body.features.length).toBeGreaterThan(0);
    for (const f of body.features) {
      expect(f.properties.etat).toBe('actif');
    }
  });

  it('filters with CQL2 numeric comparison', async () => {
    const filter = encodeURIComponent('population>100000');
    const { body } = await fetchGeoJson(
      `/ogc/collections/arrondissements/items?filter=${filter}&filter-lang=cql2-text&limit=100`
    );
    expect(body.features.length).toBeGreaterThan(0);
    for (const f of body.features) {
      expect(f.properties.population).toBeGreaterThan(100000);
    }
  });

  it('returns 400 for invalid CQL2', async () => {
    const filter = encodeURIComponent('INVALID SYNTAX !!!');
    const { status } = await fetchGeoJson(
      `/ogc/collections/bornes-fontaines/items?filter=${filter}&filter-lang=cql2-text`
    );
    expect(status).toBe(400);
  });
});

describe('OGC API — Spatial filters (CQL2)', () => {
  it('S_INTERSECTS filters points within polygon', async () => {
    const filter = encodeURIComponent(
      'S_INTERSECTS(geometry,POLYGON((-73.59 45.49,-73.55 45.49,-73.55 45.52,-73.59 45.52,-73.59 45.49)))'
    );
    const { body } = await fetchGeoJson(
      `/ogc/collections/bornes-fontaines/items?filter=${filter}&filter-lang=cql2-text&limit=100`
    );
    expect(body.features.length).toBeGreaterThan(0);
    // All returned points should be within the polygon bounds
    for (const f of body.features) {
      const [lon, lat] = f.geometry.coordinates;
      expect(lon).toBeGreaterThanOrEqual(-73.59);
      expect(lon).toBeLessThanOrEqual(-73.55);
      expect(lat).toBeGreaterThanOrEqual(45.49);
      expect(lat).toBeLessThanOrEqual(45.52);
    }
  });

  it('S_DWITHIN filters points within distance', async () => {
    const filter = encodeURIComponent(
      'S_DWITHIN(geometry,POINT(-73.5673 45.5017),500,meters)'
    );
    const { body } = await fetchGeoJson(
      `/ogc/collections/bornes-fontaines/items?filter=${filter}&filter-lang=cql2-text&limit=100`
    );
    expect(body.features.length).toBeGreaterThan(0);
  });
});
```

**Step 2: Write sorting conformance tests**

Create `packages/conformance-tests/src/ogc/sorting.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { fetchGeoJson, fetchJson } from '../helpers.js';

describe('OGC API — Sorting (sortby)', () => {
  it('returns 400 for non-sortable field', async () => {
    const { status } = await fetchGeoJson(
      '/ogc/collections/bornes-fontaines/items?sortby=etat'
    );
    expect(status).toBe(400);
  });
});
```

**Step 3: Write limits conformance tests**

Create `packages/conformance-tests/src/ogc/limits.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { fetchGeoJson } from '../helpers.js';

describe('OGC API — Download limits', () => {
  it('caps limit to maxPageSize', async () => {
    // Default maxPageSize is 1000, requesting 5000 should be capped
    const { body } = await fetchGeoJson(
      '/ogc/collections/bornes-fontaines/items?limit=5000'
    );
    // Should not return more than maxPageSize (but dataset only has 15 items)
    expect(body.features.length).toBeLessThanOrEqual(1000);
  });
});
```

**Step 4: Run all conformance tests**

Run: `npm run test:conformance`
Expected: All PASS

**Step 5: Commit**

```bash
git add packages/conformance-tests/src/ogc/filters.test.ts packages/conformance-tests/src/ogc/sorting.test.ts packages/conformance-tests/src/ogc/limits.test.ts
git commit -m "test: add conformance tests for filters, sorting, and download limits"
```

---

## Task 19: Integration test with PAVICS WFS upstream

**Files:**
- Create: `packages/conformance-tests/src/ogc/wfs-upstream.test.ts`

This test validates that the `mrc-quebec` collection works end-to-end via the PAVICS GeoServer.

**Step 1: Write integration test**

Create `packages/conformance-tests/src/ogc/wfs-upstream.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { fetchGeoJson, fetchJson } from '../helpers.js';

describe('OGC API — WFS Upstream (mrc-quebec via PAVICS)', () => {
  it('appears in collections list', async () => {
    const { body } = await fetchJson('/ogc/collections');
    const ids = body.collections.map((c: any) => c.id);
    expect(ids).toContain('mrc-quebec');
  });

  it('returns collection metadata', async () => {
    const { status, body } = await fetchJson('/ogc/collections/mrc-quebec');
    expect(status).toBe(200);
    expect(body.title).toBe('MRC du Quebec');
  });

  it('returns features from PAVICS', async () => {
    const { status, body } = await fetchGeoJson('/ogc/collections/mrc-quebec/items?limit=5');
    expect(status).toBe(200);
    expect(body.type).toBe('FeatureCollection');
    expect(body.features.length).toBeGreaterThan(0);
    expect(body.features.length).toBeLessThanOrEqual(5);
  });

  it('features have Polygon geometry', async () => {
    const { body } = await fetchGeoJson('/ogc/collections/mrc-quebec/items?limit=1');
    const feature = body.features[0];
    expect(feature.type).toBe('Feature');
    expect(feature.geometry).toBeDefined();
    // PAVICS may return Polygon or MultiPolygon
    expect(['Polygon', 'MultiPolygon']).toContain(feature.geometry.type);
  });

  it('has queryables endpoint', async () => {
    const { status, body } = await fetchJson('/ogc/collections/mrc-quebec/queryables');
    expect(status).toBe(200);
    expect(body.properties).toBeDefined();
  });
});
```

**Step 2: Run the test**

Run: `npm run test:conformance`
Expected: PASS (requires network access to PAVICS)

Note: If running in CI without network, mark these tests with a `describe.skipIf` condition.

**Step 3: Commit**

```bash
git add packages/conformance-tests/src/ogc/wfs-upstream.test.ts
git commit -m "test: add integration tests for PAVICS WFS upstream (mrc-quebec)"
```

---

## Task 20: Update WFS facade for filter pass-through

**Files:**
- Modify: `packages/proxy/src/wfs/get-feature.ts`

The WFS facade needs to pass CQL_FILTER and SortBy from incoming WFS requests to the engine.

**Step 1: Update parseGetFeatureGet to extract CQL_FILTER and sortBy**

In `packages/proxy/src/wfs/get-feature.ts`, add to `WfsGetFeatureParams`:

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
}
```

Update `parseGetFeatureGet`:

```typescript
export function parseGetFeatureGet(query: Record<string, string>): WfsGetFeatureParams {
  return {
    typeName: query.typename || query.typenames || '',
    maxFeatures: parseInt(query.maxfeatures || query.count || '10'),
    startIndex: parseInt(query.startindex || '0'),
    outputFormat: query.outputformat || 'application/json',
    resultType: query.resulttype || 'results',
    srsName: query.srsname || '',
    cqlFilter: query.cql_filter,
    sortBy: query.sortby,
  };
}
```

**Step 2: Run existing WFS tests**

Run: `npm run test:conformance`
Expected: All PASS

**Step 3: Commit**

```bash
git add packages/proxy/src/wfs/get-feature.ts
git commit -m "feat: add CQL_FILTER and SortBy support to WFS facade"
```

---

## Task 21: Update Docker Compose and documentation

**Files:**
- Modify: `docker-compose.yml` (no new services, proxy now also calls PAVICS)
- Modify: `docs/qgis-setup.md`

**Step 1: Update QGIS setup doc with filter examples**

Add to `docs/qgis-setup.md` a section on filters:

```markdown
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
```

**Step 2: Verify Docker Compose still works**

Run: `docker compose config`
Expected: Valid config (no new services needed)

**Step 3: Commit**

```bash
git add docs/qgis-setup.md
git commit -m "docs: update QGIS setup with filter examples and mrc-quebec collection"
```

---

## Task 22: Client limits behavior test (exploratory)

**Files:**
- Create: `docs/client-limits-behavior.md`

This is a manual exploratory test. Start the stack, configure a collection with low limits, and test with QGIS and MapStore.

**Step 1: Temporarily set low limits for testing**

In `collections.yaml`, add to bornes-fontaines:

```yaml
  bornes-fontaines:
    maxPageSize: 5
    maxFeatures: 10
```

**Step 2: Start the stack**

Run: `docker compose up --build -d`

**Step 3: Test with QGIS**

1. Add the OGC API Features source: `http://localhost:8080/ogc`
2. Add bornes-fontaines layer
3. Observe: How many features load? Does QGIS show a warning?
4. Check: Does pagination stop at 10 features?

**Step 4: Test with MapStore**

1. Open `http://localhost:8080/mapstore/`
2. Add WFS layer: bornes-fontaines
3. Observe: How many features appear? Any error messages?

**Step 5: Document results**

Create `docs/client-limits-behavior.md` with observations.

**Step 6: Restore normal limits and commit**

Remove the temporary low limits from collections.yaml.

```bash
git add docs/client-limits-behavior.md packages/proxy/src/config/collections.yaml
git commit -m "docs: add client limits behavior test results (QGIS + MapStore)"
```

---

## Summary

| Task | Description | Est. |
|------|-------------|------|
| 1 | Extend types for Phase 2 | 5 min |
| 2 | Plugin system — interface and loader | 15 min |
| 3 | Plugin loader integration into registry | 10 min |
| 4 | Download limits (maxPageSize + maxFeatures) | 10 min |
| 5 | CQL2 parser — lexer | 15 min |
| 6 | CQL2 parser — AST generation | 20 min |
| 7 | CQL2 evaluator with Turf.js | 20 min |
| 8 | CQL2 bbox extractor for upstream optimization | 10 min |
| 9 | Add filter support to mock API | 10 min |
| 10 | Update YAML config with filter/sort metadata | 5 min |
| 11 | Integrate filters, limits, plugins into items endpoint | 25 min |
| 12 | `/queryables` endpoint | 15 min |
| 13 | Sorting support | 15 min |
| 14 | `wfs-upstream` built-in plugin | 20 min |
| 15 | WFS upstream adapter integration | 10 min |
| 16 | Update conformance for Part 3 | 5 min |
| 17 | Update WFS capabilities | 5 min |
| 18 | Conformance tests for Phase 2 | 15 min |
| 19 | Integration test with PAVICS | 10 min |
| 20 | Update WFS facade for filters | 10 min |
| 21 | Update Docker Compose and docs | 10 min |
| 22 | Client limits exploratory test | 20 min |
