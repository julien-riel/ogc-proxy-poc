# OGC Proxy POC — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a proof-of-concept proxy that exposes internal REST APIs as OGC API Features + WFS services, validated with QGIS and MapStore.

**Architecture:** Mono-repo with 3 packages (mock-api, proxy, conformance-tests). The proxy reads a YAML registry, uses a generic adapter to fetch upstream APIs, transforms responses to GeoJSON, and serves them via OGC API Features routes (`/ogc/*`) and a WFS 1.1.0 facade (`/wfs`). Both interfaces share the same mapping engine.

**Tech Stack:** Node.js, Express, TypeScript, YAML registry, Vitest, fast-xml-parser (WFS POST), Docker Compose (MapStore)

---

## Task 1: Mono-repo Scaffolding ✅ DONE

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `.gitignore`
- Create: `packages/mock-api/package.json`
- Create: `packages/mock-api/tsconfig.json`
- Create: `packages/proxy/package.json`
- Create: `packages/proxy/tsconfig.json`
- Create: `packages/proxy/vitest.config.ts`
- Create: `packages/conformance-tests/package.json`
- Create: `packages/conformance-tests/tsconfig.json`
- Create: `packages/conformance-tests/vitest.config.ts`

**Step 1: Create root package.json**

```json
{
  "name": "ogc-proxy-poc",
  "private": true,
  "workspaces": ["packages/*"],
  "scripts": {
    "dev:mock": "npm run dev -w packages/mock-api",
    "dev:proxy": "npm run dev -w packages/proxy",
    "dev": "npm run dev:mock & npm run dev:proxy",
    "test": "npm run test:unit && npm run test:conformance",
    "test:unit": "npm test -w packages/proxy",
    "test:conformance": "npm test -w packages/conformance-tests",
    "build": "npm run build --workspaces"
  }
}
```

**Step 2: Create root tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "Node16",
    "moduleResolution": "Node16",
    "esModuleInterop": true,
    "strict": true,
    "outDir": "dist",
    "declaration": true,
    "sourceMap": true,
    "skipLibCheck": true,
    "resolveJsonModule": true
  }
}
```

**Step 3: Create .gitignore**

```
node_modules/
dist/
*.js.map
.env
```

**Step 4: Create packages/mock-api/package.json**

```json
{
  "name": "@ogc-proxy/mock-api",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "src/app.ts",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js"
  },
  "dependencies": {
    "express": "^4.21.0"
  },
  "devDependencies": {
    "@types/express": "^5.0.0",
    "tsx": "^4.19.0",
    "typescript": "^5.7.0"
  }
}
```

**Step 5: Create packages/mock-api/tsconfig.json**

```json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"]
}
```

**Step 6: Create packages/proxy/package.json**

```json
{
  "name": "@ogc-proxy/proxy",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "src/app.ts",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js",
    "test": "vitest run"
  },
  "dependencies": {
    "cors": "^2.8.5",
    "express": "^4.21.0",
    "fast-xml-parser": "^4.5.0",
    "yaml": "^2.6.0"
  },
  "devDependencies": {
    "@types/cors": "^2.8.17",
    "@types/express": "^5.0.0",
    "tsx": "^4.19.0",
    "typescript": "^5.7.0",
    "vitest": "^3.0.0"
  }
}
```

**Step 7: Create packages/proxy/tsconfig.json**

```json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"]
}
```

**Step 8: Create packages/proxy/vitest.config.ts**

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
  },
});
```

**Step 9: Create packages/conformance-tests/package.json**

```json
{
  "name": "@ogc-proxy/conformance-tests",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "vitest run"
  },
  "devDependencies": {
    "tsx": "^4.19.0",
    "typescript": "^5.7.0",
    "vitest": "^3.0.0"
  }
}
```

**Step 10: Create packages/conformance-tests/tsconfig.json**

```json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"]
}
```

**Step 11: Create packages/conformance-tests/vitest.config.ts**

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    globalSetup: './src/global-setup.ts',
    testTimeout: 15000,
  },
});
```

**Step 12: Install dependencies**

Run: `npm install`

**Step 13: Commit**

```bash
git add -A
git commit -m "feat: scaffold mono-repo with npm workspaces"
```

---

## Task 2: Mock API — Data + Routes + Server ✅ DONE

**Files:**
- Create: `packages/mock-api/src/data/bornes-fontaines.ts`
- Create: `packages/mock-api/src/data/pistes-cyclables.ts`
- Create: `packages/mock-api/src/data/arrondissements.ts`
- Create: `packages/mock-api/src/routes/bornes.ts`
- Create: `packages/mock-api/src/routes/pistes.ts`
- Create: `packages/mock-api/src/routes/arrondissements.ts`
- Create: `packages/mock-api/src/app.ts`
- Create: `packages/mock-api/src/index.ts`

**Step 1: Create bornes-fontaines data**

File: `packages/mock-api/src/data/bornes-fontaines.ts`

Each item has `id`, `x` (longitude), `y` (latitude), `etat`, `arrondissement`. Coordinates are in Montreal (EPSG:4326). Include 15 items.

```typescript
export const bornesFontaines = [
  { id: 1, x: -73.5673, y: 45.5017, etat: "actif", arrondissement: "Ville-Marie" },
  { id: 2, x: -73.5612, y: 45.5088, etat: "actif", arrondissement: "Ville-Marie" },
  { id: 3, x: -73.5789, y: 45.4956, etat: "inactif", arrondissement: "Ville-Marie" },
  { id: 4, x: -73.5824, y: 45.5205, etat: "actif", arrondissement: "Le Plateau-Mont-Royal" },
  { id: 5, x: -73.5741, y: 45.5263, etat: "actif", arrondissement: "Le Plateau-Mont-Royal" },
  { id: 6, x: -73.5698, y: 45.5311, etat: "inactif", arrondissement: "Le Plateau-Mont-Royal" },
  { id: 7, x: -73.5856, y: 45.5378, etat: "actif", arrondissement: "Le Plateau-Mont-Royal" },
  { id: 8, x: -73.5934, y: 45.5456, etat: "actif", arrondissement: "Rosemont-La Petite-Patrie" },
  { id: 9, x: -73.5812, y: 45.5523, etat: "actif", arrondissement: "Rosemont-La Petite-Patrie" },
  { id: 10, x: -73.5743, y: 45.5589, etat: "inactif", arrondissement: "Rosemont-La Petite-Patrie" },
  { id: 11, x: -73.5667, y: 45.4634, etat: "actif", arrondissement: "Verdun" },
  { id: 12, x: -73.5712, y: 45.4589, etat: "actif", arrondissement: "Verdun" },
  { id: 13, x: -73.5856, y: 45.4712, etat: "actif", arrondissement: "Le Sud-Ouest" },
  { id: 14, x: -73.5923, y: 45.4778, etat: "inactif", arrondissement: "Le Sud-Ouest" },
  { id: 15, x: -73.5534, y: 45.5145, etat: "actif", arrondissement: "Ville-Marie" },
];
```

**Step 2: Create pistes-cyclables data**

File: `packages/mock-api/src/data/pistes-cyclables.ts`

Each item has `id`, `geometry.coords` (array of `[lon, lat]`), `nom`, `type`, `longueur`. Structures intentionally differ from bornes-fontaines.

```typescript
export const pistesCyclables = [
  {
    id: 1,
    geometry: {
      coords: [[-73.5856, 45.4712], [-73.5789, 45.4801], [-73.5723, 45.4889], [-73.5673, 45.4956], [-73.5612, 45.5034]]
    },
    nom: "Piste du Canal de Lachine",
    type: "bidirectionnelle",
    longueur: 14.5
  },
  {
    id: 2,
    geometry: {
      coords: [[-73.5934, 45.5205], [-73.5856, 45.5205], [-73.5789, 45.5205], [-73.5712, 45.5205], [-73.5634, 45.5205]]
    },
    nom: "De Maisonneuve",
    type: "bidirectionnelle",
    longueur: 12.0
  },
  {
    id: 3,
    geometry: {
      coords: [[-73.5612, 45.5017], [-73.5612, 45.5088], [-73.5612, 45.5145], [-73.5612, 45.5205]]
    },
    nom: "Berri",
    type: "unidirectionnelle",
    longueur: 4.2
  },
  {
    id: 4,
    geometry: {
      coords: [[-73.5824, 45.5311], [-73.5789, 45.5378], [-73.5756, 45.5456], [-73.5723, 45.5523]]
    },
    nom: "Boyer",
    type: "bande cyclable",
    longueur: 3.8
  },
  {
    id: 5,
    geometry: {
      coords: [[-73.5667, 45.4634], [-73.5623, 45.4712], [-73.5578, 45.4789], [-73.5534, 45.4867]]
    },
    nom: "Piste de la Commune",
    type: "bidirectionnelle",
    longueur: 5.1
  },
  {
    id: 6,
    geometry: {
      coords: [[-73.5934, 45.5456], [-73.5856, 45.5456], [-73.5789, 45.5456], [-73.5712, 45.5456]]
    },
    nom: "Rachel",
    type: "bidirectionnelle",
    longueur: 6.3
  },
  {
    id: 7,
    geometry: {
      coords: [[-73.5741, 45.5017], [-73.5741, 45.5088], [-73.5741, 45.5145]]
    },
    nom: "Clark",
    type: "bande cyclable",
    longueur: 2.1
  },
  {
    id: 8,
    geometry: {
      coords: [[-73.5923, 45.4778], [-73.5856, 45.4845], [-73.5789, 45.4912], [-73.5723, 45.4978]]
    },
    nom: "Saint-Patrick",
    type: "bidirectionnelle",
    longueur: 4.7
  },
];
```

**Step 3: Create arrondissements data**

File: `packages/mock-api/src/data/arrondissements.ts`

Each item has `code`, `nom`, `wkt` (POLYGON WKT), `population`. No total count provided (intentionally). Simplified rectangular boundaries.

```typescript
export const arrondissements = [
  {
    code: "VM",
    nom: "Ville-Marie",
    wkt: "POLYGON((-73.59 45.49, -73.55 45.49, -73.55 45.52, -73.59 45.52, -73.59 45.49))",
    population: 89170
  },
  {
    code: "LPMR",
    nom: "Le Plateau-Mont-Royal",
    wkt: "POLYGON((-73.59 45.52, -73.56 45.52, -73.56 45.54, -73.59 45.54, -73.59 45.52))",
    population: 104000
  },
  {
    code: "RPP",
    nom: "Rosemont-La Petite-Patrie",
    wkt: "POLYGON((-73.60 45.54, -73.57 45.54, -73.57 45.57, -73.60 45.57, -73.60 45.54))",
    population: 139590
  },
  {
    code: "LSO",
    nom: "Le Sud-Ouest",
    wkt: "POLYGON((-73.60 45.47, -73.57 45.47, -73.57 45.49, -73.60 45.49, -73.60 45.47))",
    population: 78151
  },
  {
    code: "VER",
    nom: "Verdun",
    wkt: "POLYGON((-73.58 45.45, -73.55 45.45, -73.55 45.47, -73.58 45.47, -73.58 45.45))",
    population: 69229
  },
];
```

**Step 4: Create routes for each API**

Each endpoint uses a **different pagination mechanism** to demonstrate the adapter's normalization power.

File: `packages/mock-api/src/routes/bornes.ts`

**Pagination: offset/limit.** Response: `{ data: [...], total: N }`.

```typescript
import { Router } from 'express';
import { bornesFontaines } from '../data/bornes-fontaines.js';

const router = Router();

router.get('/', (req, res) => {
  const offset = parseInt(req.query.offset as string) || 0;
  const limit = parseInt(req.query.limit as string) || 10;
  const page = bornesFontaines.slice(offset, offset + limit);
  res.json({ data: page, total: bornesFontaines.length });
});

router.get('/:id', (req, res) => {
  const item = bornesFontaines.find(b => b.id === parseInt(req.params.id));
  if (!item) return res.status(404).json({ error: 'Not found' });
  res.json({ data: item });
});

export default router;
```

File: `packages/mock-api/src/routes/pistes.ts`

**Pagination: page/pageSize.** Response: `{ results: [...], count: N, page: P, totalPages: T }`.

```typescript
import { Router } from 'express';
import { pistesCyclables } from '../data/pistes-cyclables.js';

const router = Router();

router.get('/', (req, res) => {
  const page = parseInt(req.query.page as string) || 1;
  const pageSize = parseInt(req.query.pageSize as string) || 10;
  const start = (page - 1) * pageSize;
  const items = pistesCyclables.slice(start, start + pageSize);
  res.json({
    results: items,
    count: pistesCyclables.length,
    page,
    totalPages: Math.ceil(pistesCyclables.length / pageSize),
  });
});

router.get('/:id', (req, res) => {
  const item = pistesCyclables.find(p => p.id === parseInt(req.params.id));
  if (!item) return res.status(404).json({ error: 'Not found' });
  res.json({ result: item });
});

export default router;
```

File: `packages/mock-api/src/routes/arrondissements.ts`

**Pagination: cursor-based.** Response: `{ items: [...], nextCursor: "CODE" | null }`. The cursor is the `code` of the last item. No total count available.

```typescript
import { Router } from 'express';
import { arrondissements } from '../data/arrondissements.js';

const router = Router();

router.get('/', (req, res) => {
  const cursor = req.query.cursor as string | undefined;
  const limit = parseInt(req.query.limit as string) || 10;

  let startIndex = 0;
  if (cursor) {
    const cursorIndex = arrondissements.findIndex(a => a.code === cursor);
    startIndex = cursorIndex >= 0 ? cursorIndex + 1 : 0;
  }

  const items = arrondissements.slice(startIndex, startIndex + limit);
  const hasMore = startIndex + limit < arrondissements.length;
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

**Step 5: Create app.ts and index.ts**

File: `packages/mock-api/src/app.ts`

```typescript
import express from 'express';
import bornesRouter from './routes/bornes.js';
import pistesRouter from './routes/pistes.js';
import arrondissementsRouter from './routes/arrondissements.js';

export function createApp() {
  const app = express();
  app.use('/api/bornes-fontaines', bornesRouter);
  app.use('/api/pistes-cyclables', pistesRouter);
  app.use('/api/arrondissements', arrondissementsRouter);
  app.get('/health', (_req, res) => res.json({ status: 'ok' }));
  return app;
}
```

File: `packages/mock-api/src/index.ts`

```typescript
import { createApp } from './app.js';

const PORT = process.env.PORT || 3001;
createApp().listen(PORT, () => {
  console.log(`Mock API running on port ${PORT}`);
});
```

**Step 6: Verify mock API starts**

Run: `npm run dev:mock`
Expected: "Mock API running on port 3001"

Test: `curl http://localhost:3001/api/bornes-fontaines?limit=2`
Expected: `{ "data": [...], "total": 15 }`

**Step 7: Commit**

```bash
git add packages/mock-api/
git commit -m "feat: add mock API with 3 heterogeneous endpoints"
```

---

## Task 3: Proxy Engine — Registry (TDD) ✅ DONE

**Files:**
- Create: `packages/proxy/src/config/collections.yaml`
- Create: `packages/proxy/src/engine/types.ts`
- Create: `packages/proxy/src/engine/registry.test.ts`
- Create: `packages/proxy/src/engine/registry.ts`

**Step 1: Create collections.yaml**

File: `packages/proxy/src/config/collections.yaml`

```yaml
collections:
  bornes-fontaines:
    title: "Bornes-fontaines"
    description: "Bornes-fontaines municipales"
    upstream:
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
    geometry:
      type: Point
      xField: "x"
      yField: "y"
    idField: "id"
    properties:
      - name: "etat"
        type: "string"
      - name: "arrondissement"
        type: "string"

  pistes-cyclables:
    title: "Pistes cyclables"
    description: "Réseau cyclable municipal"
    upstream:
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
    geometry:
      type: LineString
      coordsField: "geometry.coords"
    idField: "id"
    properties:
      - name: "nom"
        type: "string"
      - name: "type"
        type: "string"
      - name: "longueur"
        type: "double"

  arrondissements:
    title: "Arrondissements"
    description: "Arrondissements de la ville"
    upstream:
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
    geometry:
      type: Polygon
      wktField: "wkt"
    idField: "code"
    properties:
      - name: "nom"
        type: "string"
      - name: "population"
        type: "int"
```

**Step 2: Create types.ts**

File: `packages/proxy/src/engine/types.ts`

```typescript
export interface PropertyConfig {
  name: string;
  type: string;
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
  upstream: {
    baseUrl: string;
    method: string;
    pagination: PaginationConfig;
    responseMapping: {
      items: string;
      total: string | null;
      item: string;
    };
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

export interface RegistryConfig {
  collections: Record<string, CollectionConfig>;
}
```

**Step 3: Write the failing test**

File: `packages/proxy/src/engine/registry.test.ts`

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { loadRegistry, getCollection, getCollectionIds } from './registry.js';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const configPath = resolve(__dirname, '../config/collections.yaml');

describe('Registry', () => {
  beforeEach(() => {
    process.env.UPSTREAM_HOST = 'http://localhost:3001';
  });

  it('loads all collections from YAML', () => {
    const registry = loadRegistry(configPath);
    expect(Object.keys(registry.collections)).toHaveLength(3);
  });

  it('substitutes environment variables in URLs', () => {
    const registry = loadRegistry(configPath);
    const bornes = registry.collections['bornes-fontaines'];
    expect(bornes.upstream.baseUrl).toBe('http://localhost:3001/api/bornes-fontaines');
  });

  it('returns collection by id', () => {
    loadRegistry(configPath);
    const col = getCollection('bornes-fontaines');
    expect(col).toBeDefined();
    expect(col!.title).toBe('Bornes-fontaines');
    expect(col!.geometry.type).toBe('Point');
  });

  it('returns undefined for unknown collection', () => {
    loadRegistry(configPath);
    expect(getCollection('unknown')).toBeUndefined();
  });

  it('returns all collection ids', () => {
    loadRegistry(configPath);
    const ids = getCollectionIds();
    expect(ids).toContain('bornes-fontaines');
    expect(ids).toContain('pistes-cyclables');
    expect(ids).toContain('arrondissements');
  });

  it('handles null total mapping', () => {
    loadRegistry(configPath);
    const arr = getCollection('arrondissements');
    expect(arr!.upstream.responseMapping.total).toBeNull();
  });
});
```

**Step 4: Run test to verify it fails**

Run: `cd packages/proxy && npx vitest run src/engine/registry.test.ts`
Expected: FAIL — module `./registry.js` not found

**Step 5: Implement registry.ts**

File: `packages/proxy/src/engine/registry.ts`

```typescript
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { parse } from 'yaml';
import type { RegistryConfig, CollectionConfig } from './types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

function substituteEnvVars(value: unknown): unknown {
  if (typeof value === 'string') {
    return value.replace(/\$\{(\w+)\}/g, (_, key) => process.env[key] || '');
  }
  if (Array.isArray(value)) {
    return value.map(substituteEnvVars);
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, substituteEnvVars(v)])
    );
  }
  return value;
}

let registry: RegistryConfig | null = null;

export function loadRegistry(configPath?: string): RegistryConfig {
  const path = configPath || resolve(__dirname, '../config/collections.yaml');
  const raw = readFileSync(path, 'utf-8');
  const parsed = parse(raw);
  registry = substituteEnvVars(parsed) as RegistryConfig;
  return registry;
}

export function getRegistry(): RegistryConfig {
  if (!registry) {
    registry = loadRegistry();
  }
  return registry;
}

export function getCollection(id: string): CollectionConfig | undefined {
  return getRegistry().collections[id];
}

export function getCollectionIds(): string[] {
  return Object.keys(getRegistry().collections);
}
```

**Step 6: Run test to verify it passes**

Run: `cd packages/proxy && npx vitest run src/engine/registry.test.ts`
Expected: All 6 tests PASS

**Step 7: Commit**

```bash
git add packages/proxy/src/config/ packages/proxy/src/engine/types.ts packages/proxy/src/engine/registry.ts packages/proxy/src/engine/registry.test.ts
git commit -m "feat: add YAML registry with env var substitution (TDD)"
```

---

## Task 4: Proxy Engine — GeoJSON Builder (TDD) ✅ DONE

**Files:**
- Create: `packages/proxy/src/engine/geojson-builder.test.ts`
- Create: `packages/proxy/src/engine/geojson-builder.ts`

**Step 1: Write the failing test**

File: `packages/proxy/src/engine/geojson-builder.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import { buildFeature, buildFeatureCollection } from './geojson-builder.js';
import type { CollectionConfig } from './types.js';

const pointConfig: CollectionConfig = {
  title: 'Test Points',
  upstream: { baseUrl: '', method: 'GET', responseMapping: { items: '', total: '', item: '' } },
  geometry: { type: 'Point', xField: 'x', yField: 'y' },
  idField: 'id',
  properties: [{ name: 'etat', type: 'string' }],
};

const lineConfig: CollectionConfig = {
  title: 'Test Lines',
  upstream: { baseUrl: '', method: 'GET', responseMapping: { items: '', total: '', item: '' } },
  geometry: { type: 'LineString', coordsField: 'geometry.coords' },
  idField: 'id',
  properties: [{ name: 'nom', type: 'string' }],
};

const polygonConfig: CollectionConfig = {
  title: 'Test Polygons',
  upstream: { baseUrl: '', method: 'GET', responseMapping: { items: '', total: '', item: '' } },
  geometry: { type: 'Polygon', wktField: 'wkt' },
  idField: 'code',
  properties: [{ name: 'nom', type: 'string' }],
};

describe('GeoJSON Builder', () => {
  describe('buildFeature', () => {
    it('builds a Point feature from x/y fields', () => {
      const raw = { id: 1, x: -73.56, y: 45.50, etat: 'actif' };
      const feature = buildFeature(raw, pointConfig);
      expect(feature.type).toBe('Feature');
      expect(feature.id).toBe(1);
      expect(feature.geometry).toEqual({ type: 'Point', coordinates: [-73.56, 45.50] });
      expect(feature.properties).toEqual({ etat: 'actif' });
    });

    it('builds a LineString feature from coords field', () => {
      const raw = { id: 2, geometry: { coords: [[-73.5, 45.5], [-73.6, 45.6]] }, nom: 'Test' };
      const feature = buildFeature(raw, lineConfig);
      expect(feature.geometry).toEqual({ type: 'LineString', coordinates: [[-73.5, 45.5], [-73.6, 45.6]] });
      expect(feature.properties).toEqual({ nom: 'Test' });
    });

    it('builds a Polygon feature from WKT', () => {
      const raw = { code: 'VM', nom: 'Ville-Marie', wkt: 'POLYGON((-73.59 45.49, -73.55 45.49, -73.55 45.52, -73.59 45.52, -73.59 45.49))' };
      const feature = buildFeature(raw, polygonConfig);
      expect(feature.id).toBe('VM');
      expect(feature.geometry.type).toBe('Polygon');
      expect((feature.geometry as any).coordinates[0]).toHaveLength(5);
      expect(feature.properties).toEqual({ nom: 'Ville-Marie' });
    });

    it('only includes declared properties', () => {
      const raw = { id: 1, x: -73.5, y: 45.5, etat: 'actif', secret: 'hidden' };
      const feature = buildFeature(raw, pointConfig);
      expect(feature.properties).toEqual({ etat: 'actif' });
      expect(feature.properties).not.toHaveProperty('secret');
    });
  });

  describe('buildFeatureCollection', () => {
    it('builds a FeatureCollection with links and counts', () => {
      const items = [
        { id: 1, x: -73.5, y: 45.5, etat: 'actif' },
        { id: 2, x: -73.6, y: 45.6, etat: 'inactif' },
      ];
      const fc = buildFeatureCollection(items, pointConfig, {
        baseUrl: 'http://localhost:3000/ogc',
        collectionId: 'test',
        offset: 0,
        limit: 10,
        total: 2,
      });
      expect(fc.type).toBe('FeatureCollection');
      expect(fc.features).toHaveLength(2);
      expect(fc.numberReturned).toBe(2);
      expect(fc.numberMatched).toBe(2);
    });

    it('includes next link when more items exist', () => {
      const items = [{ id: 1, x: -73.5, y: 45.5, etat: 'actif' }];
      const fc = buildFeatureCollection(items, pointConfig, {
        baseUrl: 'http://localhost:3000/ogc',
        collectionId: 'test',
        offset: 0,
        limit: 1,
        total: 5,
      });
      const nextLink = fc.links.find((l: any) => l.rel === 'next');
      expect(nextLink).toBeDefined();
      expect(nextLink!.href).toContain('offset=1');
      expect(nextLink!.href).toContain('limit=1');
    });

    it('omits next link on last page', () => {
      const items = [{ id: 1, x: -73.5, y: 45.5, etat: 'actif' }];
      const fc = buildFeatureCollection(items, pointConfig, {
        baseUrl: 'http://localhost:3000/ogc',
        collectionId: 'test',
        offset: 4,
        limit: 1,
        total: 5,
      });
      const nextLink = fc.links.find((l: any) => l.rel === 'next');
      expect(nextLink).toBeUndefined();
    });

    it('omits numberMatched when total is undefined', () => {
      const items = [{ id: 1, x: -73.5, y: 45.5, etat: 'actif' }];
      const fc = buildFeatureCollection(items, pointConfig, {
        baseUrl: 'http://localhost:3000/ogc',
        collectionId: 'test',
        offset: 0,
        limit: 10,
        total: undefined,
      });
      expect(fc.numberMatched).toBeUndefined();
      expect(fc.numberReturned).toBe(1);
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd packages/proxy && npx vitest run src/engine/geojson-builder.test.ts`
Expected: FAIL — module `./geojson-builder.js` not found

**Step 3: Implement geojson-builder.ts**

File: `packages/proxy/src/engine/geojson-builder.ts`

```typescript
import type { CollectionConfig } from './types.js';

/**
 * Resolves a dot-notation path on an object.
 * Example: getByPath({ a: { b: 1 } }, 'a.b') => 1
 */
export function getByPath(obj: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce<unknown>((o, key) => {
    if (o && typeof o === 'object') return (o as Record<string, unknown>)[key];
    return undefined;
  }, obj);
}

function parseWkt(wkt: string): GeoJSON.Geometry {
  const trimmed = wkt.trim();

  const pointMatch = trimmed.match(/^POINT\s*\(\s*([-\d.]+)\s+([-\d.]+)\s*\)$/i);
  if (pointMatch) {
    return { type: 'Point', coordinates: [parseFloat(pointMatch[1]), parseFloat(pointMatch[2])] };
  }

  const polygonMatch = trimmed.match(/^POLYGON\s*\(\((.+)\)\)$/i);
  if (polygonMatch) {
    const ring = polygonMatch[1].split(',').map(pair => {
      const [x, y] = pair.trim().split(/\s+/).map(Number);
      return [x, y];
    });
    return { type: 'Polygon', coordinates: [ring] };
  }

  throw new Error(`Unsupported WKT: ${wkt}`);
}

function buildGeometry(raw: Record<string, unknown>, config: CollectionConfig): GeoJSON.Geometry {
  const { geometry } = config;

  switch (geometry.type) {
    case 'Point': {
      const x = raw[geometry.xField!] as number;
      const y = raw[geometry.yField!] as number;
      return { type: 'Point', coordinates: [x, y] };
    }
    case 'LineString': {
      const coords = getByPath(raw, geometry.coordsField!) as number[][];
      return { type: 'LineString', coordinates: coords };
    }
    case 'Polygon': {
      const wkt = raw[geometry.wktField!] as string;
      return parseWkt(wkt);
    }
    default:
      throw new Error(`Unsupported geometry type: ${geometry.type}`);
  }
}

function buildProperties(raw: Record<string, unknown>, config: CollectionConfig): Record<string, unknown> {
  const props: Record<string, unknown> = {};
  for (const prop of config.properties) {
    if (prop.name in raw) {
      props[prop.name] = raw[prop.name];
    }
  }
  return props;
}

export function buildFeature(raw: Record<string, unknown>, config: CollectionConfig): GeoJSON.Feature {
  return {
    type: 'Feature',
    id: raw[config.idField] as string | number,
    geometry: buildGeometry(raw, config),
    properties: buildProperties(raw, config),
  };
}

interface PaginationContext {
  baseUrl: string;
  collectionId: string;
  offset: number;
  limit: number;
  total?: number;
}

interface OgcFeatureCollection {
  type: 'FeatureCollection';
  features: GeoJSON.Feature[];
  links: Array<{ href: string; rel: string; type: string }>;
  numberMatched?: number;
  numberReturned: number;
  timeStamp: string;
}

export function buildFeatureCollection(
  items: Record<string, unknown>[],
  config: CollectionConfig,
  ctx: PaginationContext,
): OgcFeatureCollection {
  const features = items.map(item => buildFeature(item, config));
  const itemsUrl = `${ctx.baseUrl}/collections/${ctx.collectionId}/items`;

  const links: Array<{ href: string; rel: string; type: string }> = [
    { href: `${itemsUrl}?offset=${ctx.offset}&limit=${ctx.limit}`, rel: 'self', type: 'application/geo+json' },
  ];

  if (ctx.total !== undefined && ctx.offset + ctx.limit < ctx.total) {
    links.push({
      href: `${itemsUrl}?offset=${ctx.offset + ctx.limit}&limit=${ctx.limit}`,
      rel: 'next',
      type: 'application/geo+json',
    });
  }

  if (ctx.offset > 0) {
    const prevOffset = Math.max(0, ctx.offset - ctx.limit);
    links.push({
      href: `${itemsUrl}?offset=${prevOffset}&limit=${ctx.limit}`,
      rel: 'prev',
      type: 'application/geo+json',
    });
  }

  const result: OgcFeatureCollection = {
    type: 'FeatureCollection',
    features,
    links,
    numberReturned: features.length,
    timeStamp: new Date().toISOString(),
  };

  if (ctx.total !== undefined) {
    result.numberMatched = ctx.total;
  }

  return result;
}
```

**Step 4: Run test to verify it passes**

Run: `cd packages/proxy && npx vitest run src/engine/geojson-builder.test.ts`
Expected: All 7 tests PASS

**Step 5: Commit**

```bash
git add packages/proxy/src/engine/geojson-builder.ts packages/proxy/src/engine/geojson-builder.test.ts
git commit -m "feat: add GeoJSON builder with Point, LineString, Polygon support (TDD)"
```

---

## Task 5: Proxy Engine — Adapter (TDD) ✅ DONE

**Files:**
- Create: `packages/proxy/src/engine/adapter.test.ts`
- Create: `packages/proxy/src/engine/adapter.ts`

**Step 1: Write the failing test**

File: `packages/proxy/src/engine/adapter.test.ts`

Tests use `vi.fn()` to mock `fetch`. The adapter translates OGC offset/limit to the upstream's native pagination format, calls fetch, extracts items/total via responseMapping, and returns the raw items + total. Tests cover all 3 pagination strategies.

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchUpstreamItems, fetchUpstreamItem } from './adapter.js';
import type { CollectionConfig } from './types.js';

const offsetLimitConfig: CollectionConfig = {
  title: 'Test Offset/Limit',
  upstream: {
    baseUrl: 'http://mock:3001/api/test',
    method: 'GET',
    pagination: { type: 'offset-limit', offsetParam: 'offset', limitParam: 'limit' },
    responseMapping: { items: 'data', total: 'total', item: 'data' },
  },
  geometry: { type: 'Point', xField: 'x', yField: 'y' },
  idField: 'id',
  properties: [{ name: 'name', type: 'string' }],
};

const pageConfig: CollectionConfig = {
  title: 'Test Page/PageSize',
  upstream: {
    baseUrl: 'http://mock:3001/api/pistes',
    method: 'GET',
    pagination: { type: 'page-pageSize', pageParam: 'page', pageSizeParam: 'pageSize' },
    responseMapping: { items: 'results', total: 'count', item: 'result' },
  },
  geometry: { type: 'LineString', coordsField: 'geometry.coords' },
  idField: 'id',
  properties: [{ name: 'nom', type: 'string' }],
};

const cursorConfig: CollectionConfig = {
  title: 'Test Cursor',
  upstream: {
    baseUrl: 'http://mock:3001/api/arr',
    method: 'GET',
    pagination: { type: 'cursor', cursorParam: 'cursor', limitParam: 'limit', nextCursorField: 'nextCursor' },
    responseMapping: { items: 'items', total: null, item: 'item' },
  },
  geometry: { type: 'Polygon', wktField: 'wkt' },
  idField: 'code',
  properties: [{ name: 'nom', type: 'string' }],
};

describe('Adapter', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('offset/limit pagination', () => {
    it('passes offset and limit to upstream', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ data: [{ id: 1 }], total: 10 }),
      }));

      const result = await fetchUpstreamItems(offsetLimitConfig, { offset: 5, limit: 3 });

      expect(fetch).toHaveBeenCalledWith(expect.stringContaining('offset=5'));
      expect(fetch).toHaveBeenCalledWith(expect.stringContaining('limit=3'));
      expect(result.items).toEqual([{ id: 1 }]);
      expect(result.total).toBe(10);
    });
  });

  describe('page/pageSize pagination', () => {
    it('converts offset/limit to page/pageSize', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ results: [{ id: 1 }], count: 8 }),
      }));

      // offset=6, limit=3 → page=3, pageSize=3
      const result = await fetchUpstreamItems(pageConfig, { offset: 6, limit: 3 });

      expect(fetch).toHaveBeenCalledWith(expect.stringContaining('page=3'));
      expect(fetch).toHaveBeenCalledWith(expect.stringContaining('pageSize=3'));
      expect(result.items).toEqual([{ id: 1 }]);
      expect(result.total).toBe(8);
    });

    it('page 1 when offset is 0', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ results: [{ id: 1 }], count: 8 }),
      }));

      await fetchUpstreamItems(pageConfig, { offset: 0, limit: 5 });
      expect(fetch).toHaveBeenCalledWith(expect.stringContaining('page=1'));
    });
  });

  describe('cursor pagination', () => {
    it('fetches first page when offset is 0', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ items: [{ code: 'A' }, { code: 'B' }], nextCursor: 'B' }),
      }));

      const result = await fetchUpstreamItems(cursorConfig, { offset: 0, limit: 2 });

      // No cursor param on first request
      const calledUrl = (fetch as any).mock.calls[0][0] as string;
      expect(calledUrl).not.toContain('cursor=');
      expect(result.items).toEqual([{ code: 'A' }, { code: 'B' }]);
      expect(result.total).toBeUndefined();
    });

    it('iterates pages to reach offset', async () => {
      const fetchMock = vi.fn()
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ items: [{ code: 'A' }, { code: 'B' }], nextCursor: 'B' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ items: [{ code: 'C' }, { code: 'D' }], nextCursor: 'D' }),
        });
      vi.stubGlobal('fetch', fetchMock);

      // offset=2, limit=2 → skip first 2 items, return next 2
      const result = await fetchUpstreamItems(cursorConfig, { offset: 2, limit: 2 });

      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(result.items).toEqual([{ code: 'C' }, { code: 'D' }]);
    });
  });

  describe('single item', () => {
    it('fetches a single item by id', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ data: { id: 1, name: 'A' } }),
      }));

      const result = await fetchUpstreamItem(offsetLimitConfig, '1');
      expect(fetch).toHaveBeenCalledWith('http://mock:3001/api/test/1');
      expect(result).toEqual({ id: 1, name: 'A' });
    });
  });

  describe('error handling', () => {
    it('throws on upstream error', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: false, status: 500, statusText: 'Internal Server Error',
      }));

      await expect(fetchUpstreamItems(offsetLimitConfig, { offset: 0, limit: 10 }))
        .rejects.toThrow('Upstream error: 500');
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd packages/proxy && npx vitest run src/engine/adapter.test.ts`
Expected: FAIL — module `./adapter.js` not found

**Step 3: Implement adapter.ts**

File: `packages/proxy/src/engine/adapter.ts`

The adapter translates OGC-standard offset/limit pagination into the upstream API's native pagination mechanism (offset/limit, page/pageSize, or cursor).

```typescript
import type { CollectionConfig, PaginationConfig } from './types.js';
import { getByPath } from './geojson-builder.js';

interface FetchParams {
  offset: number;
  limit: number;
  bbox?: [number, number, number, number];
}

export interface UpstreamPage {
  items: Record<string, unknown>[];
  total?: number;
}

async function fetchJson(url: string): Promise<Record<string, unknown>> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Upstream error: ${response.status}`);
  }
  return response.json() as Promise<Record<string, unknown>>;
}

function extractItems(body: Record<string, unknown>, config: CollectionConfig): Record<string, unknown>[] {
  return (getByPath(body, config.upstream.responseMapping.items) as Record<string, unknown>[]) || [];
}

function extractTotal(body: Record<string, unknown>, config: CollectionConfig): number | undefined {
  const { total } = config.upstream.responseMapping;
  return total ? (getByPath(body, total) as number | undefined) : undefined;
}

async function fetchOffsetLimit(config: CollectionConfig, params: FetchParams): Promise<UpstreamPage> {
  const pagination = config.upstream.pagination as { offsetParam: string; limitParam: string };
  const url = new URL(config.upstream.baseUrl);
  url.searchParams.set(pagination.offsetParam, String(params.offset));
  url.searchParams.set(pagination.limitParam, String(params.limit));

  const body = await fetchJson(url.toString());
  return { items: extractItems(body, config), total: extractTotal(body, config) };
}

async function fetchPageBased(config: CollectionConfig, params: FetchParams): Promise<UpstreamPage> {
  const pagination = config.upstream.pagination as { pageParam: string; pageSizeParam: string };
  const page = Math.floor(params.offset / params.limit) + 1;

  const url = new URL(config.upstream.baseUrl);
  url.searchParams.set(pagination.pageParam, String(page));
  url.searchParams.set(pagination.pageSizeParam, String(params.limit));

  const body = await fetchJson(url.toString());
  return { items: extractItems(body, config), total: extractTotal(body, config) };
}

async function fetchCursorBased(config: CollectionConfig, params: FetchParams): Promise<UpstreamPage> {
  const pagination = config.upstream.pagination as {
    cursorParam: string;
    limitParam: string;
    nextCursorField: string;
  };

  let cursor: string | undefined;
  let collected: Record<string, unknown>[] = [];

  while (collected.length < params.offset + params.limit) {
    const url = new URL(config.upstream.baseUrl);
    url.searchParams.set(pagination.limitParam, String(params.limit));
    if (cursor) {
      url.searchParams.set(pagination.cursorParam, cursor);
    }

    const body = await fetchJson(url.toString());
    const items = extractItems(body, config);
    collected.push(...items);

    const nextCursor = getByPath(body, pagination.nextCursorField) as string | null;
    if (!nextCursor || items.length === 0) break;
    cursor = nextCursor;
  }

  return {
    items: collected.slice(params.offset, params.offset + params.limit),
    total: undefined,
  };
}

export async function fetchUpstreamItems(
  config: CollectionConfig,
  params: FetchParams,
): Promise<UpstreamPage> {
  switch (config.upstream.pagination.type) {
    case 'offset-limit':
      return fetchOffsetLimit(config, params);
    case 'page-pageSize':
      return fetchPageBased(config, params);
    case 'cursor':
      return fetchCursorBased(config, params);
    default:
      throw new Error(`Unknown pagination type: ${(config.upstream.pagination as any).type}`);
  }
}

export async function fetchUpstreamItem(
  config: CollectionConfig,
  itemId: string,
): Promise<Record<string, unknown>> {
  const url = `${config.upstream.baseUrl}/${itemId}`;
  const body = await fetchJson(url);
  return getByPath(body, config.upstream.responseMapping.item) as Record<string, unknown>;
}
```

**Step 4: Run test to verify it passes**

Run: `cd packages/proxy && npx vitest run src/engine/adapter.test.ts`
Expected: All 4 tests PASS

**Step 5: Commit**

```bash
git add packages/proxy/src/engine/adapter.ts packages/proxy/src/engine/adapter.test.ts
git commit -m "feat: add upstream adapter with item/list fetching (TDD)"
```

---

## Task 6: Proxy — OGC API Features Routes ✅ DONE

**Files:**
- Create: `packages/proxy/src/ogc/landing.ts`
- Create: `packages/proxy/src/ogc/conformance.ts`
- Create: `packages/proxy/src/ogc/collections.ts`
- Create: `packages/proxy/src/ogc/items.ts`
- Create: `packages/proxy/src/ogc/router.ts`
- Create: `packages/proxy/src/app.ts`
- Create: `packages/proxy/src/index.ts`

**Step 1: Create helper for base URL**

Add to `packages/proxy/src/ogc/landing.ts`:

```typescript
import type { Request, Response } from 'express';

function getBaseUrl(req: Request): string {
  return process.env.BASE_URL || `${req.protocol}://${req.get('host')}/ogc`;
}

export function landing(req: Request, res: Response) {
  const base = getBaseUrl(req);
  res.json({
    title: 'OGC API Proxy Municipal',
    description: 'Interface GIS commune aux APIs maison',
    links: [
      { href: `${base}/`, rel: 'self', type: 'application/json', title: 'This document' },
      { href: `${base}/api`, rel: 'service-desc', type: 'application/vnd.oai.openapi+json;version=3.0', title: 'API definition' },
      { href: `${base}/conformance`, rel: 'conformance', type: 'application/json', title: 'Conformance classes' },
      { href: `${base}/collections`, rel: 'data', type: 'application/json', title: 'Collections' },
    ],
  });
}
```

**Step 2: Create conformance.ts**

File: `packages/proxy/src/ogc/conformance.ts`

```typescript
import type { Request, Response } from 'express';

export function conformance(_req: Request, res: Response) {
  res.json({
    conformsTo: [
      'http://www.opengis.net/spec/ogcapi-features-1/1.0/conf/core',
      'http://www.opengis.net/spec/ogcapi-features-1/1.0/conf/geojson',
      'http://www.opengis.net/spec/ogcapi-features-1/1.0/conf/oas30',
    ],
  });
}
```

**Step 3: Create collections.ts**

File: `packages/proxy/src/ogc/collections.ts`

```typescript
import type { Request, Response } from 'express';
import { getRegistry, getCollection } from '../engine/registry.js';

function getBaseUrl(req: Request): string {
  return process.env.BASE_URL || `${req.protocol}://${req.get('host')}/ogc`;
}

export function listCollections(req: Request, res: Response) {
  const base = getBaseUrl(req);
  const registry = getRegistry();

  const collections = Object.entries(registry.collections).map(([id, config]) => ({
    id,
    title: config.title,
    description: config.description || '',
    links: [
      { href: `${base}/collections/${id}`, rel: 'self', type: 'application/json' },
      { href: `${base}/collections/${id}/items`, rel: 'items', type: 'application/geo+json' },
    ],
    crs: ['http://www.opengis.net/def/crs/OGC/1.3/CRS84'],
  }));

  res.json({
    links: [{ href: `${base}/collections`, rel: 'self', type: 'application/json' }],
    collections,
  });
}

export function getCollectionById(req: Request, res: Response) {
  const base = getBaseUrl(req);
  const { collectionId } = req.params;
  const config = getCollection(collectionId);

  if (!config) {
    return res.status(404).json({ code: 'NotFound', description: `Collection '${collectionId}' not found` });
  }

  res.json({
    id: collectionId,
    title: config.title,
    description: config.description || '',
    links: [
      { href: `${base}/collections/${collectionId}`, rel: 'self', type: 'application/json' },
      { href: `${base}/collections/${collectionId}/items`, rel: 'items', type: 'application/geo+json' },
    ],
    crs: ['http://www.opengis.net/def/crs/OGC/1.3/CRS84'],
  });
}
```

**Step 4: Create items.ts**

File: `packages/proxy/src/ogc/items.ts`

```typescript
import type { Request, Response } from 'express';
import { getCollection } from '../engine/registry.js';
import { fetchUpstreamItems, fetchUpstreamItem } from '../engine/adapter.js';
import { buildFeatureCollection, buildFeature } from '../engine/geojson-builder.js';

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

export async function getItems(req: Request, res: Response) {
  const { collectionId } = req.params;
  const config = getCollection(collectionId);

  if (!config) {
    return res.status(404).json({ code: 'NotFound', description: `Collection '${collectionId}' not found` });
  }

  const limit = Math.min(parseInt(req.query.limit as string) || 10, 1000);
  const offset = parseInt(req.query.offset as string) || 0;
  const bboxStr = req.query.bbox as string | undefined;
  const bbox = bboxStr ? parseBbox(bboxStr) : undefined;

  try {
    const upstream = await fetchUpstreamItems(config, { offset, limit });
    let fc = buildFeatureCollection(upstream.items, config, {
      baseUrl: getBaseUrl(req),
      collectionId,
      offset,
      limit,
      total: upstream.total,
    });

    if (bbox) {
      const filtered = fc.features.filter(f => isInBbox(f, bbox));
      fc = { ...fc, features: filtered, numberReturned: filtered.length };
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
    const raw = await fetchUpstreamItem(config, featureId);
    if (!raw) {
      return res.status(404).json({ code: 'NotFound', description: `Feature '${featureId}' not found` });
    }

    const base = getBaseUrl(req);
    const feature = buildFeature(raw, config);
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
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(502).json({ code: 'UpstreamError', description: message });
  }
}
```

**Step 5: Create OGC router**

File: `packages/proxy/src/ogc/router.ts`

```typescript
import { Router } from 'express';
import { landing } from './landing.js';
import { conformance } from './conformance.js';
import { listCollections, getCollectionById } from './collections.js';
import { getItems, getItem } from './items.js';

const router = Router();

router.get('/', landing);
router.get('/conformance', conformance);
router.get('/collections', listCollections);
router.get('/collections/:collectionId', getCollectionById);
router.get('/collections/:collectionId/items', getItems);
router.get('/collections/:collectionId/items/:featureId', getItem);

export default router;
```

**Step 6: Create app.ts and index.ts**

File: `packages/proxy/src/app.ts`

```typescript
import express from 'express';
import cors from 'cors';
import ogcRouter from './ogc/router.js';
import { loadRegistry } from './engine/registry.js';

export function createApp() {
  loadRegistry();

  const app = express();
  app.use(cors());
  app.use('/ogc', ogcRouter);
  app.get('/health', (_req, res) => res.json({ status: 'ok' }));
  return app;
}
```

File: `packages/proxy/src/index.ts`

```typescript
import { createApp } from './app.js';

const PORT = process.env.PORT || 3000;
createApp().listen(PORT, () => {
  console.log(`OGC Proxy running on port ${PORT}`);
});
```

**Step 7: Verify OGC routes work**

Run mock API and proxy in 2 terminals:
- Terminal 1: `UPSTREAM_HOST=http://localhost:3001 npm run dev:proxy`
- Terminal 2: `npm run dev:mock`

Test: `curl http://localhost:3000/ogc/ | jq .`
Expected: Landing page JSON with links

Test: `curl http://localhost:3000/ogc/collections | jq .collections[].id`
Expected: `"bornes-fontaines"`, `"pistes-cyclables"`, `"arrondissements"`

Test: `curl 'http://localhost:3000/ogc/collections/bornes-fontaines/items?limit=2' | jq .`
Expected: FeatureCollection with 2 Point features

**Step 8: Commit**

```bash
git add packages/proxy/src/
git commit -m "feat: add OGC API Features routes (landing, collections, items)"
```

---

## Task 7: Proxy — WFS 1.1.0 Facade ✅ DONE

**Files:**
- Create: `packages/proxy/src/wfs/router.ts`
- Create: `packages/proxy/src/wfs/capabilities.ts`
- Create: `packages/proxy/src/wfs/describe.ts`
- Create: `packages/proxy/src/wfs/get-feature.ts`

**Important context:** MapStore uses WFS 1.1.0 (not 2.0). GetCapabilities returns XML. DescribeFeatureType returns JSON (with `outputFormat=application/json`). GetFeature is sent as POST with XML body and returns GeoJSON (with `outputFormat=application/json`). Both GET and POST must be supported for GetFeature.

**Step 1: Create capabilities.ts**

File: `packages/proxy/src/wfs/capabilities.ts`

Generates WFS 1.1.0 GetCapabilities XML from the registry.

```typescript
import type { Request } from 'express';
import { getRegistry } from '../engine/registry.js';

function getServiceUrl(req: Request): string {
  const host = process.env.BASE_URL
    ? process.env.BASE_URL.replace('/ogc', '')
    : `${req.protocol}://${req.get('host')}`;
  return `${host}/wfs`;
}

export function buildCapabilitiesXml(req: Request): string {
  const registry = getRegistry();
  const serviceUrl = getServiceUrl(req);

  const featureTypes = Object.entries(registry.collections).map(([id, config]) => `
    <FeatureType>
      <Name>${id}</Name>
      <Title>${config.title}</Title>
      <Abstract>${config.description || ''}</Abstract>
      <DefaultSRS>urn:x-ogc:def:crs:EPSG:4326</DefaultSRS>
      <ows:WGS84BoundingBox>
        <ows:LowerCorner>-73.98 45.41</ows:LowerCorner>
        <ows:UpperCorner>-73.47 45.70</ows:UpperCorner>
      </ows:WGS84BoundingBox>
    </FeatureType>`).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<wfs:WFS_Capabilities
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xmlns="http://www.opengis.net/wfs"
  xmlns:wfs="http://www.opengis.net/wfs"
  xmlns:ows="http://www.opengis.net/ows"
  xmlns:gml="http://www.opengis.net/gml"
  xmlns:ogc="http://www.opengis.net/ogc"
  xmlns:xlink="http://www.w3.org/1999/xlink"
  version="1.1.0"
  xsi:schemaLocation="http://www.opengis.net/wfs http://schemas.opengis.net/wfs/1.1.0/wfs.xsd">

  <ows:ServiceIdentification>
    <ows:Title>OGC Proxy Municipal - WFS</ows:Title>
    <ows:Abstract>Interface GIS commune aux APIs maison</ows:Abstract>
    <ows:ServiceType>WFS</ows:ServiceType>
    <ows:ServiceTypeVersion>1.1.0</ows:ServiceTypeVersion>
  </ows:ServiceIdentification>

  <ows:OperationsMetadata>
    <ows:Operation name="GetCapabilities">
      <ows:DCP><ows:HTTP>
        <ows:Get xlink:href="${serviceUrl}"/>
        <ows:Post xlink:href="${serviceUrl}"/>
      </ows:HTTP></ows:DCP>
    </ows:Operation>
    <ows:Operation name="DescribeFeatureType">
      <ows:DCP><ows:HTTP>
        <ows:Get xlink:href="${serviceUrl}"/>
        <ows:Post xlink:href="${serviceUrl}"/>
      </ows:HTTP></ows:DCP>
      <ows:Parameter name="outputFormat">
        <ows:Value>text/xml; subtype=gml/3.1.1</ows:Value>
        <ows:Value>application/json</ows:Value>
      </ows:Parameter>
    </ows:Operation>
    <ows:Operation name="GetFeature">
      <ows:DCP><ows:HTTP>
        <ows:Get xlink:href="${serviceUrl}"/>
        <ows:Post xlink:href="${serviceUrl}"/>
      </ows:HTTP></ows:DCP>
      <ows:Parameter name="resultType">
        <ows:Value>results</ows:Value>
        <ows:Value>hits</ows:Value>
      </ows:Parameter>
      <ows:Parameter name="outputFormat">
        <ows:Value>text/xml; subtype=gml/3.1.1</ows:Value>
        <ows:Value>application/json</ows:Value>
      </ows:Parameter>
    </ows:Operation>
  </ows:OperationsMetadata>

  <FeatureTypeList>
    <Operations>
      <Operation>Query</Operation>
    </Operations>
    ${featureTypes}
  </FeatureTypeList>

  <ogc:Filter_Capabilities>
    <ogc:Spatial_Capabilities>
      <ogc:GeometryOperands>
        <ogc:GeometryOperand>gml:Envelope</ogc:GeometryOperand>
      </ogc:GeometryOperands>
      <ogc:SpatialOperators>
        <ogc:SpatialOperator name="BBOX"/>
      </ogc:SpatialOperators>
    </ogc:Spatial_Capabilities>
    <ogc:Scalar_Capabilities>
      <ogc:LogicalOperators/>
      <ogc:ComparisonOperators/>
    </ogc:Scalar_Capabilities>
    <ogc:Id_Capabilities>
      <ogc:FID/>
    </ogc:Id_Capabilities>
  </ogc:Filter_Capabilities>
</wfs:WFS_Capabilities>`;
}
```

**Step 2: Create describe.ts**

File: `packages/proxy/src/wfs/describe.ts`

Returns JSON DescribeFeatureType matching the format MapStore expects (GeoServer-compatible).

```typescript
import { getCollection } from '../engine/registry.js';

const TYPE_MAP: Record<string, { xsd: string; gml?: string }> = {
  string: { xsd: 'xsd:string' },
  int: { xsd: 'xsd:int' },
  double: { xsd: 'xsd:double' },
  boolean: { xsd: 'xsd:boolean' },
};

const GEOM_TYPE_MAP: Record<string, string> = {
  Point: 'gml:Point',
  LineString: 'gml:LineString',
  Polygon: 'gml:Polygon',
};

export function buildDescribeFeatureType(typeName: string) {
  const config = getCollection(typeName);
  if (!config) return null;

  const properties: Array<Record<string, unknown>> = [
    {
      name: 'geometry',
      maxOccurs: 1,
      minOccurs: 0,
      nillable: true,
      type: GEOM_TYPE_MAP[config.geometry.type] || 'gml:Point',
      localType: config.geometry.type,
    },
  ];

  for (const prop of config.properties) {
    const typeInfo = TYPE_MAP[prop.type] || TYPE_MAP.string;
    properties.push({
      name: prop.name,
      maxOccurs: 1,
      minOccurs: 0,
      nillable: true,
      type: typeInfo.xsd,
      localType: prop.type === 'double' ? 'double' : prop.type === 'int' ? 'int' : 'string',
    });
  }

  return {
    elementFormDefault: 'qualified',
    targetNamespace: 'http://ogc-proxy.municipal',
    targetPrefix: 'ogcproxy',
    featureTypes: [{ typeName, properties }],
  };
}
```

**Step 3: Create get-feature.ts**

File: `packages/proxy/src/wfs/get-feature.ts`

Handles both GET query params and POST XML body. Parses WFS XML to extract typeName, maxFeatures, startIndex, and optional BBOX filter.

```typescript
import { XMLParser } from 'fast-xml-parser';
import { getCollection } from '../engine/registry.js';
import { fetchUpstreamItems } from '../engine/adapter.js';
import { buildFeature } from '../engine/geojson-builder.js';

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  removeNSPrefix: true,
});

interface WfsGetFeatureParams {
  typeName: string;
  maxFeatures: number;
  startIndex: number;
  bbox?: [number, number, number, number];
  outputFormat: string;
}

export function parseGetFeatureGet(query: Record<string, string>): WfsGetFeatureParams {
  return {
    typeName: query.typeName || query.typeNames || '',
    maxFeatures: parseInt(query.maxFeatures || query.count || '10'),
    startIndex: parseInt(query.startIndex || '0'),
    outputFormat: query.outputFormat || 'application/json',
  };
}

export function parseGetFeaturePost(body: string): WfsGetFeatureParams {
  const parsed = xmlParser.parse(body);
  const getFeature = parsed['GetFeature'] || {};
  const query = getFeature['Query'] || {};

  let bbox: [number, number, number, number] | undefined;
  const filter = query['Filter'] || {};
  const bboxFilter = filter['BBOX'];
  if (bboxFilter) {
    const envelope = bboxFilter['Envelope'] || {};
    const lower = envelope['lowerCorner']?.split(' ').map(Number);
    const upper = envelope['upperCorner']?.split(' ').map(Number);
    if (lower && upper) {
      bbox = [lower[0], lower[1], upper[0], upper[1]];
    }
  }

  return {
    typeName: query['@_typeName'] || query['@_typeNames'] || '',
    maxFeatures: parseInt(getFeature['@_maxFeatures'] || getFeature['@_count'] || '10'),
    startIndex: parseInt(getFeature['@_startIndex'] || '0'),
    outputFormat: getFeature['@_outputFormat'] || 'application/json',
    bbox,
  };
}

export async function executeGetFeature(params: WfsGetFeatureParams) {
  const config = getCollection(params.typeName);
  if (!config) return null;

  const upstream = await fetchUpstreamItems(config, {
    offset: params.startIndex,
    limit: params.maxFeatures,
  });

  const features = upstream.items.map(item => buildFeature(item, config));

  return {
    type: 'FeatureCollection',
    totalFeatures: upstream.total ?? features.length,
    features,
    numberMatched: upstream.total ?? features.length,
    numberReturned: features.length,
    crs: {
      type: 'name',
      properties: { name: 'urn:ogc:def:crs:EPSG::4326' },
    },
  };
}
```

**Step 4: Create WFS router**

File: `packages/proxy/src/wfs/router.ts`

```typescript
import { Router } from 'express';
import express from 'express';
import { buildCapabilitiesXml } from './capabilities.js';
import { buildDescribeFeatureType } from './describe.js';
import { parseGetFeatureGet, parseGetFeaturePost, executeGetFeature } from './get-feature.js';

const router = Router();

router.use(express.text({ type: ['application/xml', 'text/xml'] }));

function normalizeQuery(query: Record<string, unknown>): Record<string, string> {
  const normalized: Record<string, string> = {};
  for (const [key, value] of Object.entries(query)) {
    normalized[key.toLowerCase()] = String(value);
  }
  return normalized;
}

router.get('/', async (req, res) => {
  const query = normalizeQuery(req.query as Record<string, unknown>);
  const request = query.request || '';

  switch (request.toLowerCase()) {
    case 'getcapabilities':
      res.set('Content-Type', 'application/xml');
      return res.send(buildCapabilitiesXml(req));

    case 'describefeaturetype': {
      const typeName = query.typename || query.typenames || '';
      const result = buildDescribeFeatureType(typeName);
      if (!result) return res.status(404).json({ error: `Type '${typeName}' not found` });
      return res.json(result);
    }

    case 'getfeature': {
      try {
        const params = parseGetFeatureGet(query);
        const result = await executeGetFeature(params);
        if (!result) return res.status(404).json({ error: `Type '${params.typeName}' not found` });
        return res.json(result);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        return res.status(502).json({ error: message });
      }
    }

    default:
      return res.status(400).json({ error: `Unknown request: ${request}` });
  }
});

router.post('/', async (req, res) => {
  const body = req.body as string;
  if (!body) return res.status(400).json({ error: 'Missing XML body' });

  try {
    const params = parseGetFeaturePost(body);
    const result = await executeGetFeature(params);
    if (!result) return res.status(404).json({ error: `Type '${params.typeName}' not found` });
    return res.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return res.status(502).json({ error: message });
  }
});

export default router;
```

**Step 5: Register WFS router in app.ts**

Update `packages/proxy/src/app.ts` — add import and mount:

```typescript
import express from 'express';
import cors from 'cors';
import ogcRouter from './ogc/router.js';
import wfsRouter from './wfs/router.js';
import { loadRegistry } from './engine/registry.js';

export function createApp() {
  loadRegistry();

  const app = express();
  app.use(cors());
  app.use('/ogc', ogcRouter);
  app.use('/wfs', wfsRouter);
  app.get('/health', (_req, res) => res.json({ status: 'ok' }));
  return app;
}
```

**Step 6: Verify WFS works**

Test GetCapabilities:
```bash
curl 'http://localhost:3000/wfs?service=WFS&version=1.1.0&request=GetCapabilities'
```
Expected: XML document with 3 FeatureType entries

Test DescribeFeatureType:
```bash
curl 'http://localhost:3000/wfs?service=WFS&request=DescribeFeatureType&typeName=bornes-fontaines&outputFormat=application/json'
```
Expected: JSON with featureTypes array

Test GetFeature GET:
```bash
curl 'http://localhost:3000/wfs?service=WFS&request=GetFeature&typeName=bornes-fontaines&maxFeatures=2&outputFormat=application/json'
```
Expected: GeoJSON FeatureCollection with 2 features

**Step 7: Commit**

```bash
git add packages/proxy/src/wfs/ packages/proxy/src/app.ts
git commit -m "feat: add WFS 1.1.0 facade (GetCapabilities, DescribeFeatureType, GetFeature)"
```

---

## Task 8: Conformance Tests — OGC API Features ✅ DONE

**Files:**
- Create: `packages/conformance-tests/src/global-setup.ts`
- Create: `packages/conformance-tests/src/helpers.ts`
- Create: `packages/conformance-tests/src/ogc/landing.test.ts`
- Create: `packages/conformance-tests/src/ogc/conformance.test.ts`
- Create: `packages/conformance-tests/src/ogc/collections.test.ts`
- Create: `packages/conformance-tests/src/ogc/items.test.ts`

**Step 1: Create global-setup.ts**

File: `packages/conformance-tests/src/global-setup.ts`

Starts mock-api and proxy before tests, stops them after.

```typescript
import { spawn, type ChildProcess } from 'child_process';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
let mockApi: ChildProcess;
let proxy: ChildProcess;

async function waitForServer(url: string, maxWait = 15000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < maxWait) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      // Server not ready yet
    }
    await new Promise(r => setTimeout(r, 300));
  }
  throw new Error(`Server at ${url} did not start within ${maxWait}ms`);
}

export async function setup() {
  mockApi = spawn('npx', ['tsx', 'src/index.ts'], {
    cwd: resolve(__dirname, '../../mock-api'),
    stdio: 'pipe',
    env: { ...process.env, PORT: '3001' },
  });

  proxy = spawn('npx', ['tsx', 'src/index.ts'], {
    cwd: resolve(__dirname, '../../proxy'),
    stdio: 'pipe',
    env: { ...process.env, PORT: '3000', UPSTREAM_HOST: 'http://localhost:3001' },
  });

  await waitForServer('http://localhost:3001/health');
  await waitForServer('http://localhost:3000/health');
}

export async function teardown() {
  mockApi?.kill();
  proxy?.kill();
}
```

**Step 2: Create helpers.ts**

File: `packages/conformance-tests/src/helpers.ts`

```typescript
export const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

export async function fetchJson(path: string) {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { Accept: 'application/json' },
  });
  return { status: res.status, body: await res.json() };
}

export async function fetchGeoJson(path: string) {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { Accept: 'application/geo+json' },
  });
  return { status: res.status, body: await res.json(), contentType: res.headers.get('content-type') };
}
```

**Step 3: Create landing.test.ts**

File: `packages/conformance-tests/src/ogc/landing.test.ts`

Tests OGC API Features Part 1 /req/core/root-op and /req/core/root-success.

```typescript
import { describe, it, expect } from 'vitest';
import { fetchJson } from '../helpers.js';

describe('OGC API — Landing Page (/ogc/)', () => {
  it('returns 200', async () => {
    const { status } = await fetchJson('/ogc/');
    expect(status).toBe(200);
  });

  it('has a links array', async () => {
    const { body } = await fetchJson('/ogc/');
    expect(body.links).toBeDefined();
    expect(Array.isArray(body.links)).toBe(true);
    expect(body.links.length).toBeGreaterThan(0);
  });

  it('has a service-desc or service-doc link', async () => {
    const { body } = await fetchJson('/ogc/');
    const hasServiceDesc = body.links.some((l: any) => l.rel === 'service-desc' || l.rel === 'service-doc');
    expect(hasServiceDesc).toBe(true);
  });

  it('has a conformance link', async () => {
    const { body } = await fetchJson('/ogc/');
    const link = body.links.find((l: any) => l.rel === 'conformance');
    expect(link).toBeDefined();
    expect(link.type).toBeDefined();
  });

  it('has a data link', async () => {
    const { body } = await fetchJson('/ogc/');
    const link = body.links.find((l: any) => l.rel === 'data');
    expect(link).toBeDefined();
    expect(link.type).toBeDefined();
  });

  it('every link has rel and type', async () => {
    const { body } = await fetchJson('/ogc/');
    for (const link of body.links) {
      expect(link.rel).toBeDefined();
      expect(link.type).toBeDefined();
    }
  });
});
```

**Step 4: Create conformance.test.ts**

File: `packages/conformance-tests/src/ogc/conformance.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import { fetchJson } from '../helpers.js';

describe('OGC API — Conformance (/ogc/conformance)', () => {
  it('returns 200', async () => {
    const { status } = await fetchJson('/ogc/conformance');
    expect(status).toBe(200);
  });

  it('has conformsTo array', async () => {
    const { body } = await fetchJson('/ogc/conformance');
    expect(Array.isArray(body.conformsTo)).toBe(true);
  });

  it('declares Core conformance class', async () => {
    const { body } = await fetchJson('/ogc/conformance');
    expect(body.conformsTo).toContain(
      'http://www.opengis.net/spec/ogcapi-features-1/1.0/conf/core'
    );
  });

  it('declares GeoJSON conformance class', async () => {
    const { body } = await fetchJson('/ogc/conformance');
    expect(body.conformsTo).toContain(
      'http://www.opengis.net/spec/ogcapi-features-1/1.0/conf/geojson'
    );
  });
});
```

**Step 5: Create collections.test.ts**

File: `packages/conformance-tests/src/ogc/collections.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import { fetchJson } from '../helpers.js';

describe('OGC API — Collections (/ogc/collections)', () => {
  it('returns 200', async () => {
    const { status } = await fetchJson('/ogc/collections');
    expect(status).toBe(200);
  });

  it('has links and collections arrays', async () => {
    const { body } = await fetchJson('/ogc/collections');
    expect(Array.isArray(body.links)).toBe(true);
    expect(Array.isArray(body.collections)).toBe(true);
  });

  it('has a self link with type', async () => {
    const { body } = await fetchJson('/ogc/collections');
    const selfLink = body.links.find((l: any) => l.rel === 'self');
    expect(selfLink).toBeDefined();
    expect(selfLink.type).toBeDefined();
  });

  it('contains expected collections', async () => {
    const { body } = await fetchJson('/ogc/collections');
    const ids = body.collections.map((c: any) => c.id);
    expect(ids).toContain('bornes-fontaines');
    expect(ids).toContain('pistes-cyclables');
    expect(ids).toContain('arrondissements');
  });

  it('each collection has id, title, and links', async () => {
    const { body } = await fetchJson('/ogc/collections');
    for (const col of body.collections) {
      expect(col.id).toBeDefined();
      expect(col.title).toBeDefined();
      expect(Array.isArray(col.links)).toBe(true);
    }
  });

  it('each collection has an items link', async () => {
    const { body } = await fetchJson('/ogc/collections');
    for (const col of body.collections) {
      const itemsLink = col.links.find((l: any) => l.rel === 'items');
      expect(itemsLink).toBeDefined();
      expect(itemsLink.type).toBe('application/geo+json');
    }
  });

  it('each collection declares CRS84', async () => {
    const { body } = await fetchJson('/ogc/collections');
    for (const col of body.collections) {
      expect(col.crs).toContain('http://www.opengis.net/def/crs/OGC/1.3/CRS84');
    }
  });
});

describe('OGC API — Single Collection (/ogc/collections/:id)', () => {
  it('returns 200 for existing collection', async () => {
    const { status } = await fetchJson('/ogc/collections/bornes-fontaines');
    expect(status).toBe(200);
  });

  it('returns 404 for unknown collection', async () => {
    const { status } = await fetchJson('/ogc/collections/unknown');
    expect(status).toBe(404);
  });

  it('has correct id and title', async () => {
    const { body } = await fetchJson('/ogc/collections/bornes-fontaines');
    expect(body.id).toBe('bornes-fontaines');
    expect(body.title).toBe('Bornes-fontaines');
  });
});
```

**Step 6: Create items.test.ts**

File: `packages/conformance-tests/src/ogc/items.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import { fetchGeoJson, fetchJson } from '../helpers.js';

describe('OGC API — Items (/ogc/collections/:id/items)', () => {
  it('returns 200 with FeatureCollection', async () => {
    const { status, body } = await fetchGeoJson('/ogc/collections/bornes-fontaines/items');
    expect(status).toBe(200);
    expect(body.type).toBe('FeatureCollection');
  });

  it('returns application/geo+json content type', async () => {
    const { contentType } = await fetchGeoJson('/ogc/collections/bornes-fontaines/items');
    expect(contentType).toContain('application/geo+json');
  });

  it('has features array', async () => {
    const { body } = await fetchGeoJson('/ogc/collections/bornes-fontaines/items');
    expect(Array.isArray(body.features)).toBe(true);
    expect(body.features.length).toBeGreaterThan(0);
  });

  it('each feature has valid GeoJSON structure', async () => {
    const { body } = await fetchGeoJson('/ogc/collections/bornes-fontaines/items');
    for (const feature of body.features) {
      expect(feature.type).toBe('Feature');
      expect(feature.geometry).toBeDefined();
      expect(feature.geometry.type).toBeDefined();
      expect(feature.geometry.coordinates).toBeDefined();
      expect(feature.properties).toBeDefined();
      expect(feature.id).toBeDefined();
    }
  });

  it('has self link with type', async () => {
    const { body } = await fetchGeoJson('/ogc/collections/bornes-fontaines/items');
    const selfLink = body.links.find((l: any) => l.rel === 'self');
    expect(selfLink).toBeDefined();
    expect(selfLink.type).toBe('application/geo+json');
  });

  it('has numberReturned matching features count', async () => {
    const { body } = await fetchGeoJson('/ogc/collections/bornes-fontaines/items');
    expect(body.numberReturned).toBe(body.features.length);
  });

  it('has timeStamp', async () => {
    const { body } = await fetchGeoJson('/ogc/collections/bornes-fontaines/items');
    expect(body.timeStamp).toBeDefined();
  });

  describe('Pagination', () => {
    it('respects limit parameter', async () => {
      const { body } = await fetchGeoJson('/ogc/collections/bornes-fontaines/items?limit=3');
      expect(body.features).toHaveLength(3);
      expect(body.numberReturned).toBe(3);
    });

    it('includes next link when more items exist', async () => {
      const { body } = await fetchGeoJson('/ogc/collections/bornes-fontaines/items?limit=2');
      const nextLink = body.links.find((l: any) => l.rel === 'next');
      expect(nextLink).toBeDefined();
      expect(nextLink.type).toBe('application/geo+json');
    });

    it('next link returns valid FeatureCollection', async () => {
      const { body: page1 } = await fetchGeoJson('/ogc/collections/bornes-fontaines/items?limit=2');
      const nextLink = page1.links.find((l: any) => l.rel === 'next');
      expect(nextLink).toBeDefined();

      const nextUrl = new URL(nextLink.href);
      const res = await fetch(nextUrl.toString());
      const page2 = await res.json();
      expect(page2.type).toBe('FeatureCollection');
      expect(page2.features.length).toBeGreaterThan(0);
    });

    it('has numberMatched when upstream provides total', async () => {
      const { body } = await fetchGeoJson('/ogc/collections/bornes-fontaines/items');
      expect(body.numberMatched).toBeDefined();
      expect(body.numberMatched).toBe(15);
    });

    it('omits numberMatched when upstream has no total', async () => {
      const { body } = await fetchGeoJson('/ogc/collections/arrondissements/items');
      expect(body.numberMatched).toBeUndefined();
    });
  });

  describe('bbox filter', () => {
    it('filters features by bbox', async () => {
      const { body: all } = await fetchGeoJson('/ogc/collections/bornes-fontaines/items?limit=100');
      const { body: filtered } = await fetchGeoJson(
        '/ogc/collections/bornes-fontaines/items?limit=100&bbox=-73.59,45.49,-73.55,45.52'
      );
      expect(filtered.features.length).toBeLessThan(all.features.length);
      expect(filtered.features.length).toBeGreaterThan(0);
    });
  });

  describe('Geometry types', () => {
    it('returns Point geometry for bornes-fontaines', async () => {
      const { body } = await fetchGeoJson('/ogc/collections/bornes-fontaines/items?limit=1');
      expect(body.features[0].geometry.type).toBe('Point');
    });

    it('returns LineString geometry for pistes-cyclables', async () => {
      const { body } = await fetchGeoJson('/ogc/collections/pistes-cyclables/items?limit=1');
      expect(body.features[0].geometry.type).toBe('LineString');
    });

    it('returns Polygon geometry for arrondissements', async () => {
      const { body } = await fetchGeoJson('/ogc/collections/arrondissements/items?limit=1');
      expect(body.features[0].geometry.type).toBe('Polygon');
    });
  });
});

describe('OGC API — Single Feature (/ogc/collections/:id/items/:fid)', () => {
  it('returns 200 with Feature', async () => {
    const { status, body } = await fetchGeoJson('/ogc/collections/bornes-fontaines/items/1');
    expect(status).toBe(200);
    expect(body.type).toBe('Feature');
  });

  it('has self link', async () => {
    const { body } = await fetchGeoJson('/ogc/collections/bornes-fontaines/items/1');
    const selfLink = body.links.find((l: any) => l.rel === 'self');
    expect(selfLink).toBeDefined();
    expect(selfLink.type).toBe('application/geo+json');
  });

  it('has collection link', async () => {
    const { body } = await fetchGeoJson('/ogc/collections/bornes-fontaines/items/1');
    const colLink = body.links.find((l: any) => l.rel === 'collection');
    expect(colLink).toBeDefined();
    expect(colLink.type).toBe('application/json');
  });

  it('returns 404 for unknown feature', async () => {
    const { status } = await fetchJson('/ogc/collections/bornes-fontaines/items/99999');
    expect(status).toBe(404);
  });
});
```

**Step 7: Run conformance tests**

Run: `npm run test:conformance`
Expected: All OGC conformance tests PASS

**Step 8: Commit**

```bash
git add packages/conformance-tests/
git commit -m "feat: add OGC API Features conformance test suite"
```

---

## Task 9: Conformance Tests — WFS ✅ DONE

**Files:**
- Create: `packages/conformance-tests/src/wfs/capabilities.test.ts`
- Create: `packages/conformance-tests/src/wfs/describe.test.ts`
- Create: `packages/conformance-tests/src/wfs/get-feature.test.ts`

**Step 1: Create capabilities.test.ts**

File: `packages/conformance-tests/src/wfs/capabilities.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import { BASE_URL } from '../helpers.js';

describe('WFS — GetCapabilities', () => {
  it('returns XML with 200', async () => {
    const res = await fetch(`${BASE_URL}/wfs?service=WFS&version=1.1.0&request=GetCapabilities`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('application/xml');
  });

  it('contains WFS_Capabilities root element', async () => {
    const res = await fetch(`${BASE_URL}/wfs?service=WFS&version=1.1.0&request=GetCapabilities`);
    const xml = await res.text();
    expect(xml).toContain('wfs:WFS_Capabilities');
    expect(xml).toContain('version="1.1.0"');
  });

  it('lists all feature types', async () => {
    const res = await fetch(`${BASE_URL}/wfs?service=WFS&version=1.1.0&request=GetCapabilities`);
    const xml = await res.text();
    expect(xml).toContain('<Name>bornes-fontaines</Name>');
    expect(xml).toContain('<Name>pistes-cyclables</Name>');
    expect(xml).toContain('<Name>arrondissements</Name>');
  });

  it('declares application/json output format', async () => {
    const res = await fetch(`${BASE_URL}/wfs?service=WFS&version=1.1.0&request=GetCapabilities`);
    const xml = await res.text();
    expect(xml).toContain('application/json');
  });

  it('includes OperationsMetadata', async () => {
    const res = await fetch(`${BASE_URL}/wfs?service=WFS&version=1.1.0&request=GetCapabilities`);
    const xml = await res.text();
    expect(xml).toContain('ows:OperationsMetadata');
    expect(xml).toContain('GetCapabilities');
    expect(xml).toContain('DescribeFeatureType');
    expect(xml).toContain('GetFeature');
  });
});
```

**Step 2: Create describe.test.ts**

File: `packages/conformance-tests/src/wfs/describe.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import { BASE_URL } from '../helpers.js';

describe('WFS — DescribeFeatureType', () => {
  it('returns JSON with featureTypes', async () => {
    const res = await fetch(
      `${BASE_URL}/wfs?service=WFS&request=DescribeFeatureType&typeName=bornes-fontaines&outputFormat=application/json`
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.featureTypes).toBeDefined();
    expect(body.featureTypes).toHaveLength(1);
  });

  it('includes geometry property with gml type', async () => {
    const res = await fetch(
      `${BASE_URL}/wfs?service=WFS&request=DescribeFeatureType&typeName=bornes-fontaines&outputFormat=application/json`
    );
    const body = await res.json();
    const geomProp = body.featureTypes[0].properties.find((p: any) => p.name === 'geometry');
    expect(geomProp).toBeDefined();
    expect(geomProp.type).toBe('gml:Point');
    expect(geomProp.localType).toBe('Point');
  });

  it('includes attribute properties with xsd types', async () => {
    const res = await fetch(
      `${BASE_URL}/wfs?service=WFS&request=DescribeFeatureType&typeName=bornes-fontaines&outputFormat=application/json`
    );
    const body = await res.json();
    const props = body.featureTypes[0].properties;
    const etat = props.find((p: any) => p.name === 'etat');
    expect(etat).toBeDefined();
    expect(etat.type).toBe('xsd:string');
  });

  it('returns 404 for unknown type', async () => {
    const res = await fetch(
      `${BASE_URL}/wfs?service=WFS&request=DescribeFeatureType&typeName=unknown&outputFormat=application/json`
    );
    expect(res.status).toBe(404);
  });
});
```

**Step 3: Create get-feature.test.ts**

File: `packages/conformance-tests/src/wfs/get-feature.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import { BASE_URL } from '../helpers.js';

describe('WFS — GetFeature', () => {
  describe('GET', () => {
    it('returns GeoJSON FeatureCollection', async () => {
      const res = await fetch(
        `${BASE_URL}/wfs?service=WFS&request=GetFeature&typeName=bornes-fontaines&maxFeatures=5&outputFormat=application/json`
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.type).toBe('FeatureCollection');
      expect(body.features).toHaveLength(5);
    });

    it('includes totalFeatures and numberReturned', async () => {
      const res = await fetch(
        `${BASE_URL}/wfs?service=WFS&request=GetFeature&typeName=bornes-fontaines&maxFeatures=5&outputFormat=application/json`
      );
      const body = await res.json();
      expect(body.totalFeatures).toBeDefined();
      expect(body.numberReturned).toBe(5);
    });

    it('includes CRS info', async () => {
      const res = await fetch(
        `${BASE_URL}/wfs?service=WFS&request=GetFeature&typeName=bornes-fontaines&maxFeatures=1&outputFormat=application/json`
      );
      const body = await res.json();
      expect(body.crs).toBeDefined();
      expect(body.crs.properties.name).toContain('EPSG');
    });

    it('supports startIndex for pagination', async () => {
      const res1 = await fetch(
        `${BASE_URL}/wfs?service=WFS&request=GetFeature&typeName=bornes-fontaines&maxFeatures=2&startIndex=0&outputFormat=application/json`
      );
      const body1 = await res1.json();

      const res2 = await fetch(
        `${BASE_URL}/wfs?service=WFS&request=GetFeature&typeName=bornes-fontaines&maxFeatures=2&startIndex=2&outputFormat=application/json`
      );
      const body2 = await res2.json();

      expect(body1.features[0].id).not.toBe(body2.features[0].id);
    });
  });

  describe('POST (MapStore compatibility)', () => {
    it('accepts XML body and returns GeoJSON', async () => {
      const xmlBody = `<wfs:GetFeature service="WFS" version="1.1.0" outputFormat="application/json"
        maxFeatures="3" startIndex="0"
        xmlns:wfs="http://www.opengis.net/wfs">
        <wfs:Query typeName="bornes-fontaines"/>
      </wfs:GetFeature>`;

      const res = await fetch(`${BASE_URL}/wfs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/xml' },
        body: xmlBody,
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.type).toBe('FeatureCollection');
      expect(body.features).toHaveLength(3);
    });

    it('works with all geometry types via POST', async () => {
      for (const typeName of ['bornes-fontaines', 'pistes-cyclables', 'arrondissements']) {
        const xmlBody = `<wfs:GetFeature service="WFS" version="1.1.0" outputFormat="application/json"
          maxFeatures="1" xmlns:wfs="http://www.opengis.net/wfs">
          <wfs:Query typeName="${typeName}"/>
        </wfs:GetFeature>`;

        const res = await fetch(`${BASE_URL}/wfs`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/xml' },
          body: xmlBody,
        });
        const body = await res.json();
        expect(body.type).toBe('FeatureCollection');
        expect(body.features.length).toBeGreaterThan(0);
      }
    });
  });
});
```

**Step 4: Run all conformance tests**

Run: `npm run test:conformance`
Expected: All OGC + WFS conformance tests PASS

**Step 5: Commit**

```bash
git add packages/conformance-tests/src/wfs/
git commit -m "feat: add WFS conformance tests (capabilities, describe, get-feature)"
```

---

## Task 10: Docker Compose + Dockerfiles

**Files:**
- Create: `packages/mock-api/Dockerfile`
- Create: `packages/proxy/Dockerfile`
- Create: `docker-compose.yml`

**Step 1: Create mock-api Dockerfile**

File: `packages/mock-api/Dockerfile`

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package.json ./
RUN npm install --production
COPY src/ src/
COPY tsconfig.json ./
RUN npx tsc
EXPOSE 3001
CMD ["node", "dist/index.js"]
```

**Step 2: Create proxy Dockerfile**

File: `packages/proxy/Dockerfile`

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package.json ./
RUN npm install --production
COPY src/ src/
COPY tsconfig.json ./
RUN npx tsc
EXPOSE 3000
ENV UPSTREAM_HOST=http://mock-api:3001
CMD ["node", "dist/index.js"]
```

**Step 3: Create docker-compose.yml**

File: `docker-compose.yml`

```yaml
services:
  mock-api:
    build:
      context: ./packages/mock-api
    ports:
      - "3001:3001"

  proxy:
    build:
      context: ./packages/proxy
    ports:
      - "3000:3000"
    environment:
      - UPSTREAM_HOST=http://mock-api:3001
    depends_on:
      - mock-api

  mapstore:
    image: geosolutionsit/mapstore2:latest
    ports:
      - "8080:8080"
    depends_on:
      - proxy
```

**Step 4: Test Docker Compose**

Run: `docker compose up --build`
Expected: All 3 services start. Test:
- `curl http://localhost:3000/ogc/collections`
- `curl 'http://localhost:3000/wfs?service=WFS&request=GetCapabilities'`
- Open `http://localhost:8080` in browser

**Step 5: Commit**

```bash
git add packages/mock-api/Dockerfile packages/proxy/Dockerfile docker-compose.yml
git commit -m "feat: add Docker Compose with mock-api, proxy, and MapStore"
```

---

## Task 11: Documentation

**Files:**
- Create: `docs/qgis-setup.md`
- Create: `docs/mapstore-setup.md`

**Step 1: Create QGIS setup guide**

File: `docs/qgis-setup.md`

```markdown
# Configurer QGIS avec le proxy OGC

## Prérequis

- QGIS 3.28+
- Le proxy et le mock API doivent être démarrés (`npm run dev` ou `docker compose up`)

## Ajouter la source OGC API Features

1. Ouvrir QGIS
2. Menu **Couche** → **Ajouter une couche** → **Ajouter une couche WFS / OGC API Features**
3. Cliquer **Nouveau** pour créer une connexion
4. Remplir :
   - **Nom** : `Proxy Municipal`
   - **URL** : `http://localhost:3000/ogc`
   - **Version** : `OGC API - Features`
5. Cliquer **OK** puis **Connexion**
6. Les 3 collections apparaissent : bornes-fontaines, pistes-cyclables, arrondissements
7. Sélectionner une ou plusieurs couches et cliquer **Ajouter**

## Vérification

- Les bornes-fontaines s'affichent comme des points autour de Montréal
- Les pistes cyclables comme des lignes
- Les arrondissements comme des polygones
- La pagination fonctionne (vérifier dans le panneau de débogage réseau)

## Filtrage spatial

1. Zoomer sur un secteur de la carte
2. QGIS envoie automatiquement le bbox dans les requêtes
3. Seules les features visibles sont chargées

## Notes

- Sans authentification pour le POC
- Le CRS est EPSG:4326 (WGS84)
```

**Step 2: Create MapStore setup guide**

File: `docs/mapstore-setup.md`

```markdown
# Configurer MapStore avec le proxy WFS

## Prérequis

- Docker Compose démarré : `docker compose up`
- MapStore accessible sur `http://localhost:8080`

## Ajouter le service WFS

1. Ouvrir MapStore : `http://localhost:8080`
2. Se connecter (admin/admin par défaut)
3. Créer une nouvelle carte : **Nouvelle carte**
4. Cliquer sur le bouton **Catalogue** (icône de dossier dans la barre d'outils)
5. Cliquer **+** pour ajouter un nouveau service
6. Remplir :
   - **URL** : `http://proxy:3000/wfs`
   - **Type** : WFS
   - **Titre** : Proxy Municipal
7. Cliquer **Sauvegarder**

## Ajouter des couches

1. Dans le catalogue, sélectionner le service "Proxy Municipal"
2. Les 3 couches apparaissent : bornes-fontaines, pistes-cyclables, arrondissements
3. Cliquer **Ajouter à la carte** pour chaque couche

## Vérification

- Les features s'affichent sur la carte
- Cliquer sur une feature ouvre la popup avec les attributs
- Le zoom/pan déclenche de nouvelles requêtes GetFeature

## Dépannage

- Si le catalogue ne montre rien, vérifier que le proxy est accessible
  depuis le conteneur MapStore : `docker compose exec mapstore curl http://proxy:3000/wfs?service=WFS&request=GetCapabilities`
- Si erreur CORS, vérifier que le proxy renvoie bien les headers CORS
- Vérifier les logs : `docker compose logs proxy`

## Notes

- MapStore utilise WFS 1.1.0 avec outputFormat=application/json
- Les requêtes GetFeature sont envoyées en POST avec un body XML
- Le proxy traduit ces requêtes vers les APIs internes
```

**Step 3: Commit**

```bash
git add docs/qgis-setup.md docs/mapstore-setup.md
git commit -m "docs: add QGIS and MapStore setup guides"
```

---

## Summary

| Task | Description | Tests |
|---|---|---|
| 1 | ✅ Mono-repo scaffolding | — |
| 2 | ✅ Mock API (3 endpoints, données hétérogènes) | Manual curl |
| 3 | ✅ Registry YAML + loader | 6 unit tests |
| 4 | ✅ GeoJSON builder (Point, Line, Polygon, WKT) | 8 unit tests |
| 5 | ✅ Adapter (3 pagination strategies: offset/limit, page/pageSize, cursor) | 7 unit tests |
| 6 | ✅ OGC API Features routes | Via conformance |
| 7 | ✅ WFS 1.1.0 facade (XML caps, JSON describe, POST GetFeature) | Via conformance |
| 8 | ✅ OGC conformance tests | 40 integration tests |
| 9 | ✅ WFS conformance tests | 15 integration tests |
| 10 | Docker Compose + MapStore | Manual |
| 11 | Documentation QGIS + MapStore | — |

**Total: 11 tasks, ~57 automated tests**
