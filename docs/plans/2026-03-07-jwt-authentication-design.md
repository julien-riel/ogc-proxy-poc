# JWT Authentication Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add JWT authentication to the OGC proxy using `@villedemontreal/jwt-validator`, protecting data endpoints while leaving discovery endpoints open.

**Architecture:** JWT validation middleware from `@villedemontreal/jwt-validator` is initialized at startup with config from `collections.yaml`. A wrapper middleware is applied to collection and WFS routes. Discovery endpoints (landing, api, conformance) and health remain unprotected. When JWT is disabled in config, the middleware is a no-op.

**Tech Stack:** `@villedemontreal/jwt-validator`, `@villedemontreal/logger`, `@villedemontreal/correlation-id`, Express middleware

---

### Task 1: Install Dependencies

**Files:**
- Modify: `packages/proxy/package.json`

**Step 1: Install the three VDM libraries**

```bash
cd packages/proxy
npm install @villedemontreal/jwt-validator @villedemontreal/logger @villedemontreal/correlation-id
```

**Step 2: Verify installation**

```bash
node -e "require('@villedemontreal/jwt-validator')"
```

Expected: No errors

**Step 3: Commit**

```bash
git add packages/proxy/package.json package-lock.json
git commit -m "feat: add jwt-validator and VDM dependencies"
```

---

### Task 2: Add Security Types to Registry Config

**Files:**
- Modify: `packages/proxy/src/engine/types.ts:71-79`

**Step 1: Write the failing test**

Create test in `packages/proxy/src/engine/registry.test.ts` (append to existing tests):

```typescript
it('should parse security config from YAML', () => {
  const config = loadRegistry(resolve(__dirname, '../config/collections.yaml'));
  // security section may or may not exist in the test config
  // but the type should allow it
  expect(config.security).toBeDefined();
});
```

**Step 2: Run test to verify it fails**

```bash
cd packages/proxy && npx vitest run src/engine/registry.test.ts
```

Expected: FAIL — `security` property doesn't exist on `RegistryConfig`

**Step 3: Add types to `packages/proxy/src/engine/types.ts`**

After the `DefaultsConfig` interface (line 74), add:

```typescript
export interface JwtConfig {
  enabled: boolean;
  host: string;
  endpoint?: string;
}

export interface SecurityConfig {
  jwt?: JwtConfig;
}
```

Update `RegistryConfig` to include:

```typescript
export interface RegistryConfig {
  defaults?: DefaultsConfig;
  security?: SecurityConfig;
  collections: Record<string, CollectionConfig>;
}
```

**Step 4: Add security section to `packages/proxy/src/config/collections.yaml`**

Add at the top, before `defaults:`:

```yaml
security:
  jwt:
    enabled: false
    host: "${JWT_HOST}"
    endpoint: "${JWT_ENDPOINT}"
```

**Step 5: Run test to verify it passes**

```bash
cd packages/proxy && npx vitest run src/engine/registry.test.ts
```

Expected: PASS

**Step 6: Commit**

```bash
git add packages/proxy/src/engine/types.ts packages/proxy/src/config/collections.yaml packages/proxy/src/engine/registry.test.ts
git commit -m "feat: add SecurityConfig and JwtConfig types to registry"
```

---

### Task 3: Create JWT Auth Module

**Files:**
- Create: `packages/proxy/src/auth/jwt.ts`
- Create: `packages/proxy/src/auth/jwt.test.ts`

**Step 1: Write the failing test**

Create `packages/proxy/src/auth/jwt.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { createJwtMiddleware } from './jwt.js';

describe('createJwtMiddleware', () => {
  it('should return a no-op middleware when JWT is disabled', async () => {
    const middleware = createJwtMiddleware({ enabled: false, host: '' });

    let nextCalled = false;
    const req = {} as any;
    const res = {} as any;
    const next = () => { nextCalled = true; };

    middleware(req, res, next);
    expect(nextCalled).toBe(true);
  });

  it('should return a no-op middleware when config is undefined', async () => {
    const middleware = createJwtMiddleware(undefined);

    let nextCalled = false;
    const req = {} as any;
    const res = {} as any;
    const next = () => { nextCalled = true; };

    middleware(req, res, next);
    expect(nextCalled).toBe(true);
  });
});
```

**Step 2: Run test to verify it fails**

```bash
cd packages/proxy && npx vitest run src/auth/jwt.test.ts
```

Expected: FAIL — module not found

**Step 3: Implement `packages/proxy/src/auth/jwt.ts`**

```typescript
import type { RequestHandler } from 'express';
import type { JwtConfig } from '../engine/types.js';

const noopMiddleware: RequestHandler = (_req, _res, next) => next();

/**
 * Initializes JWT validation and returns configured middleware.
 * When JWT is disabled or config is absent, returns a passthrough middleware.
 */
export function createJwtMiddleware(config: JwtConfig | undefined): RequestHandler {
  if (!config?.enabled) {
    return noopMiddleware;
  }

  // Lazy import to avoid loading VDM libs when JWT is disabled
  const { init } = require('@villedemontreal/jwt-validator');
  const { createLogger } = require('@villedemontreal/logger');
  const { correlationIdService } = require('@villedemontreal/correlation-id');

  init(
    createLogger,
    () => correlationIdService.getId(),
    config.host,
    config.endpoint
  );

  const { jwtValidationMiddleware } = require('@villedemontreal/jwt-validator');
  return jwtValidationMiddleware();
}
```

**Step 4: Run test to verify it passes**

```bash
cd packages/proxy && npx vitest run src/auth/jwt.test.ts
```

Expected: PASS (disabled/undefined cases don't import VDM libs)

**Step 5: Commit**

```bash
git add packages/proxy/src/auth/jwt.ts packages/proxy/src/auth/jwt.test.ts
git commit -m "feat: create JWT auth module with createJwtMiddleware"
```

---

### Task 4: Wire JWT Middleware into OGC Router

**Files:**
- Modify: `packages/proxy/src/ogc/router.ts`

**Step 1: Refactor router to accept middleware parameter**

Update `packages/proxy/src/ogc/router.ts` to export a factory function:

```typescript
import { Router, type RequestHandler } from 'express';
import { landing } from './landing.js';
import { conformance } from './conformance.js';
import { listCollections, getCollectionById } from './collections.js';
import { getItems, getItem } from './items.js';
import { getQueryables } from './queryables.js';

export function createOgcRouter(jwtMiddleware: RequestHandler): Router {
  const router = Router();

  // Discovery endpoints — no auth
  router.get('/', landing);
  router.get('/api', (_req, res) => {
    res.json({
      openapi: '3.0.0',
      info: { title: 'OGC Proxy Municipal', version: '0.1.0' },
      paths: {},
    });
  });
  router.get('/conformance', conformance);

  // Data endpoints — JWT protected
  router.get('/collections', jwtMiddleware, listCollections);
  router.get('/collections/:collectionId', jwtMiddleware, getCollectionById);
  router.get('/collections/:collectionId/queryables', jwtMiddleware, getQueryables);
  router.get('/collections/:collectionId/items', jwtMiddleware, getItems);
  router.get('/collections/:collectionId/items/:featureId', jwtMiddleware, getItem);

  return router;
}
```

**Step 2: Verify no compilation errors**

```bash
cd packages/proxy && npx tsc --noEmit
```

Expected: May show errors in `app.ts` (addressed in Task 6)

**Step 3: Commit**

```bash
git add packages/proxy/src/ogc/router.ts
git commit -m "refactor: OGC router accepts JWT middleware parameter"
```

---

### Task 5: Wire JWT Middleware into WFS Router

**Files:**
- Modify: `packages/proxy/src/wfs/router.ts`

**Step 1: Refactor WFS router to accept middleware parameter**

Update `packages/proxy/src/wfs/router.ts` — wrap the existing router in a factory:

```typescript
import { Router, type RequestHandler } from 'express';
import express from 'express';
import { buildCapabilitiesXml } from './capabilities.js';
import { buildDescribeFeatureType } from './describe.js';
import { parseGetFeatureGet, parseGetFeaturePost, executeGetFeature } from './get-feature.js';

function normalizeQuery(query: Record<string, unknown>): Record<string, string> {
  const normalized: Record<string, string> = {};
  for (const [key, value] of Object.entries(query)) {
    normalized[key.toLowerCase()] = String(value);
  }
  return normalized;
}

export function createWfsRouter(jwtMiddleware: RequestHandler): Router {
  const router = Router();

  router.use(express.text({ type: ['application/xml', 'text/xml'] }));
  router.use(jwtMiddleware);

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

  return router;
}
```

**Step 2: Commit**

```bash
git add packages/proxy/src/wfs/router.ts
git commit -m "refactor: WFS router accepts JWT middleware parameter"
```

---

### Task 6: Update App to Initialize and Wire JWT

**Files:**
- Modify: `packages/proxy/src/app.ts`

**Step 1: Update `packages/proxy/src/app.ts`**

```typescript
import express from 'express';
import cors from 'cors';
import { createOgcRouter } from './ogc/router.js';
import { createWfsRouter } from './wfs/router.js';
import { loadRegistry, getRegistry } from './engine/registry.js';
import { createJwtMiddleware } from './auth/jwt.js';

export function createApp() {
  loadRegistry();

  const jwtMiddleware = createJwtMiddleware(getRegistry().security?.jwt);

  const app = express();
  app.use(cors());
  app.use('/ogc', createOgcRouter(jwtMiddleware));
  app.use('/wfs', createWfsRouter(jwtMiddleware));
  app.get('/health', (_req, res) => res.json({ status: 'ok' }));
  return app;
}
```

**Step 2: Verify compilation**

```bash
cd packages/proxy && npx tsc --noEmit
```

Expected: PASS — no type errors

**Step 3: Run all unit tests**

```bash
cd packages/proxy && npx vitest run
```

Expected: All tests pass (JWT is disabled in config so middleware is a no-op)

**Step 4: Commit**

```bash
git add packages/proxy/src/app.ts
git commit -m "feat: wire JWT middleware into app startup"
```

---

### Task 7: Update Conformance Tests

**Files:**
- Modify: `packages/conformance-tests/src/ogc/items.test.ts` (if needed)

**Step 1: Run conformance tests with JWT disabled**

```bash
npm run test:conformance
```

Expected: All pass — JWT is disabled by default

**Step 2: Commit (if any test adjustments were needed)**

```bash
git commit -m "test: ensure conformance tests pass with JWT disabled"
```

---

### Task 8: Manual Integration Test

**Step 1: Start the proxy with JWT disabled**

```bash
npm run dev
```

**Step 2: Verify open endpoints work**

```bash
curl http://localhost:3000/health
curl http://localhost:3000/ogc/
curl http://localhost:3000/ogc/conformance
```

Expected: All return 200

**Step 3: Verify data endpoints work (JWT disabled = no auth required)**

```bash
curl http://localhost:3000/ogc/collections
curl http://localhost:3000/ogc/collections/bornes-fontaines/items?limit=1
```

Expected: All return 200

**Step 4: Enable JWT and verify rejection**

Set in `collections.yaml`:
```yaml
security:
  jwt:
    enabled: true
    host: "https://auth.example.com"
```

Restart proxy and try:
```bash
curl http://localhost:3000/ogc/collections
```

Expected: 401 Unauthorized (no Bearer token provided)

**Step 5: Revert config to disabled, commit**

```bash
git add -A
git commit -m "feat: JWT authentication integration complete"
```
