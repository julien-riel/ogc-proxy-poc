# Multi-Org Docker Distribution Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make the OGC proxy distributable as a generic Docker image on ghcr.io, consumable by multiple organizations via config volumes.

**Architecture:** Publish a single Docker image that reads `collections.yaml` from `/app/config/` and custom plugins from `/app/plugins/`. Organizations mount their config via Docker volumes. CI publishes versioned images on tag push.

**Tech Stack:** Docker, GitHub Actions, GitHub Container Registry (ghcr.io), Kubernetes YAML manifests

---

### Task 1: Registry loads config from external path

**Files:**
- Modify: `packages/proxy/src/engine/registry.ts:26-28`
- Test: `packages/proxy/src/engine/registry.test.ts`

**Step 1: Write the failing test**

Add to `packages/proxy/src/engine/registry.test.ts` inside the `describe('Registry')` block:

```typescript
it('loads config from EXTERNAL_CONFIG_PATH env var', () => {
  const tmpPath = resolve(tmpdir(), `registry-ext-${Date.now()}.yaml`);
  writeFileSync(tmpPath, stringify({
    collections: {
      external: {
        title: 'External Collection',
        upstream: {
          baseUrl: 'https://example.com/api',
          method: 'GET',
          pagination: { type: 'offset-limit', offsetParam: 'offset', limitParam: 'limit' },
          responseMapping: { items: 'data', total: null, item: 'data' },
        },
        geometry: { type: 'Point', xField: 'x', yField: 'y' },
        idField: 'id',
        properties: [],
      },
    },
  }), 'utf-8');

  process.env.CONFIG_PATH = tmpPath;
  try {
    const registry = loadRegistry();
    expect(registry.collections['external']).toBeDefined();
    expect(registry.collections['external'].title).toBe('External Collection');
  } finally {
    delete process.env.CONFIG_PATH;
    unlinkSync(tmpPath);
  }
});
```

Note: `tmpdir`, `writeFileSync`, `unlinkSync`, `stringify` are already imported in the test file.

**Step 2: Run test to verify it fails**

Run: `npm test -w packages/proxy -- --run registry`
Expected: FAIL — loads the default internal config, not the external one

**Step 3: Write minimal implementation**

In `packages/proxy/src/engine/registry.ts`, change `loadRegistry`:

```typescript
export function loadRegistry(configPath?: string): RegistryConfig {
  const path = configPath || process.env.CONFIG_PATH || resolve(__dirname, '../config/collections.yaml');
  const raw = readFileSync(path, 'utf-8');
  const parsed = parse(raw);
  const substituted = substituteEnvVars(parsed);
  registry = registryConfigSchema.parse(substituted);
  return registry;
}
```

**Step 4: Run test to verify it passes**

Run: `npm test -w packages/proxy -- --run registry`
Expected: All tests PASS

**Step 5: Commit**

```bash
git add packages/proxy/src/engine/registry.ts packages/proxy/src/engine/registry.test.ts
git commit -m "feat: support CONFIG_PATH env var for external collections.yaml"
```

---

### Task 2: Plugin loader scans external plugins directory

**Files:**
- Modify: `packages/proxy/src/engine/plugin.ts:57-69`
- Test: `packages/proxy/src/engine/plugin.test.ts`

**Step 1: Write the failing test**

Add to `packages/proxy/src/engine/plugin.test.ts` inside the `describe('loadPlugin')` block:

```typescript
it('loads a plugin from PLUGINS_DIR directory', async () => {
  const dir = resolve(tmpdir(), `plugins-test-${Date.now()}`);
  mkdirSync(dir, { recursive: true });
  writeFileSync(resolve(dir, 'my-plugin.js'), `
    export default {
      skipGeojsonBuilder: true,
    };
  `);

  process.env.PLUGINS_DIR = dir;
  try {
    const plugin = await loadPlugin('my-plugin');
    expect(plugin).toBeDefined();
    expect(plugin!.skipGeojsonBuilder).toBe(true);
  } finally {
    delete process.env.PLUGINS_DIR;
    rmSync(dir, { recursive: true });
  }
});
```

Add imports at top of file: `import { resolve } from 'path'; import { tmpdir } from 'os'; import { mkdirSync, writeFileSync, rmSync } from 'fs';`

**Step 2: Run test to verify it fails**

Run: `npm test -w packages/proxy -- --run plugin`
Expected: FAIL — `loadPlugin('my-plugin')` returns null (not a built-in, not a file path)

**Step 3: Write minimal implementation**

In `packages/proxy/src/engine/plugin.ts`, modify `loadPlugin`:

```typescript
import { existsSync } from 'fs';
import { resolve } from 'path';

export async function loadPlugin(pluginRef: string | undefined): Promise<CollectionPlugin | null> {
  if (!pluginRef) return null;

  // File path: load directly
  if (pluginRef.startsWith('./') || pluginRef.startsWith('/')) {
    try {
      const mod = await import(pluginRef);
      return (mod.default ?? mod) as CollectionPlugin;
    } catch {
      return null;
    }
  }

  // Built-in plugin
  if (builtinPlugins[pluginRef]) {
    return builtinPlugins[pluginRef];
  }

  // External plugins directory
  const pluginsDir = process.env.PLUGINS_DIR;
  if (pluginsDir) {
    const pluginPath = resolve(pluginsDir, `${pluginRef}.js`);
    if (existsSync(pluginPath)) {
      try {
        const mod = await import(pluginPath);
        return (mod.default ?? mod) as CollectionPlugin;
      } catch {
        return null;
      }
    }
  }

  return null;
}
```

**Step 4: Run test to verify it passes**

Run: `npm test -w packages/proxy -- --run plugin`
Expected: All tests PASS

**Step 5: Run full test suite**

Run: `npm run test:unit`
Expected: All tests PASS

**Step 6: Commit**

```bash
git add packages/proxy/src/engine/plugin.ts packages/proxy/src/engine/plugin.test.ts
git commit -m "feat: support PLUGINS_DIR env var for external plugins"
```

---

### Task 3: Update Dockerfile for external config and plugins

**Files:**
- Modify: `packages/proxy/Dockerfile`

**Step 1: Update the Dockerfile**

Replace `packages/proxy/Dockerfile` with:

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package.json ./
RUN npm install --production
COPY dist/ ./dist/

# Default config (overridden by volume mount)
COPY src/config/ ./config/

# External plugins directory (populated by volume mount)
RUN mkdir -p /app/plugins

ENV CONFIG_PATH=/app/config/collections.yaml
ENV PLUGINS_DIR=/app/plugins

EXPOSE 3000
CMD ["node", "dist/index.js"]
```

**Step 2: Verify Docker build works**

Run: `cd packages/proxy && npm run build && docker build -t ogc-proxy-test . && cd ../..`
Expected: Image builds successfully

**Step 3: Commit**

```bash
git add packages/proxy/Dockerfile
git commit -m "feat: add external config and plugins paths to Dockerfile"
```

---

### Task 4: Create CI publish workflow

**Files:**
- Create: `.github/workflows/publish.yml`

**Step 1: Create the workflow file**

Create `.github/workflows/publish.yml`:

```yaml
name: Publish Docker Image

on:
  push:
    tags: ['v*']

permissions:
  contents: read
  packages: write

env:
  REGISTRY: ghcr.io
  IMAGE_NAME: ${{ github.repository }}

jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm

      - run: npm ci
      - run: npm run build

      - uses: docker/login-action@v3
        with:
          registry: ${{ env.REGISTRY }}
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - uses: docker/metadata-action@v5
        id: meta
        with:
          images: ${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}
          tags: |
            type=semver,pattern={{version}}
            type=semver,pattern={{major}}.{{minor}}
            type=semver,pattern={{major}}
            type=raw,value=latest

      - uses: docker/setup-buildx-action@v3

      - uses: docker/build-push-action@v6
        with:
          context: ./packages/proxy
          push: true
          platforms: linux/amd64,linux/arm64
          tags: ${{ steps.meta.outputs.tags }}
          labels: ${{ steps.meta.outputs.labels }}
```

**Step 2: Commit**

```bash
git add .github/workflows/publish.yml
git commit -m "ci: add Docker image publish workflow on tag push"
```

---

### Task 5: Create examples/ starter kit

**Files:**
- Create: `examples/docker-compose.yml`
- Create: `examples/collections.yaml`
- Create: `examples/.env.example`
- Create: `examples/plugins/README.md`
- Create: `examples/README.md`

**Step 1: Create `examples/docker-compose.yml`**

```yaml
services:
  redis:
    image: redis:7-alpine
    restart: unless-stopped
    volumes:
      - redis-data:/data

  ogc-proxy:
    image: ghcr.io/VilledeMontreal/ogc-proxy:1
    restart: unless-stopped
    env_file: .env
    ports:
      - "3000:3000"
    volumes:
      - ./collections.yaml:/app/config/collections.yaml:ro
      - ./plugins:/app/plugins:ro
    depends_on:
      - redis

volumes:
  redis-data:
```

Note: Replace `VilledeMontreal/ogc-proxy` with the actual GitHub org/repo name. Use the `:1` tag for major-version pinning.

**Step 2: Create `examples/collections.yaml`**

```yaml
# OGC Proxy — Collection Configuration
#
# Each collection maps an upstream REST API to an OGC API Features endpoint.
# Environment variables can be used with ${VAR_NAME} syntax.
#
# Documentation: https://github.com/VilledeMontreal/ogc-proxy-poc#collections

# Optional: JWT authentication
# security:
#   jwt:
#     enabled: true
#     host: "${JWT_HOST}"
#     endpoint: "${JWT_ENDPOINT}"

# Optional: default limits
# defaults:
#   maxPageSize: 1000
#   maxFeatures: 10000

collections:
  # Example: a simple REST API with Point geometry
  my-points:
    title: "My Points of Interest"
    description: "Example point collection — replace with your API"
    extent:
      spatial: [-180, -90, 180, 90]
    upstream:
      type: "rest"
      baseUrl: "${UPSTREAM_HOST}/api/points"
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
      xField: "longitude"
      yField: "latitude"
    idField: "id"
    properties:
      - name: "name"
        type: "string"
        filterable: true
      - name: "category"
        type: "string"
        filterable: true

  # Example: a REST API with LineString geometry and page-based pagination
  # my-lines:
  #   title: "My Lines"
  #   upstream:
  #     type: "rest"
  #     baseUrl: "${UPSTREAM_HOST}/api/lines"
  #     method: GET
  #     pagination:
  #       type: "page-pageSize"
  #       pageParam: "page"
  #       pageSizeParam: "pageSize"
  #     responseMapping:
  #       items: "results"
  #       total: "count"
  #       item: "result"
  #   geometry:
  #     type: LineString
  #     coordsField: "geometry.coords"
  #   idField: "id"
  #   properties:
  #     - name: "label"
  #       type: "string"
```

**Step 3: Create `examples/.env.example`**

```bash
# ── Upstream API ───────────────────────────────────────────────
# Base URL of your internal APIs (used in collections.yaml)
UPSTREAM_HOST=https://api.your-city.com

# ── Server ─────────────────────────────────────────────────────
PORT=3000

# Public URL override (auto-detected from request if not set)
# BASE_URL=https://ogc.your-city.com

# ── Redis (required for multi-instance deployments) ────────────
REDIS_URL=redis://redis:6379
# REDIS_KEY_PREFIX=ogc:

# ── Authentication (optional) ─────────────────────────────────
# JWT_HOST=https://auth.your-city.com
# JWT_ENDPOINT=/oauth/jwks

# ── CORS (default: all origins) ───────────────────────────────
# CORS_ORIGIN=https://app.your-city.com,https://maps.your-city.com

# ── Rate Limiting ─────────────────────────────────────────────
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX=100

# ── Logging ───────────────────────────────────────────────────
# LOG_LEVEL=debug
```

**Step 4: Create `examples/plugins/README.md`**

```markdown
# Custom Plugins

Place custom plugin files (`.js`) in this directory. They will be
loaded by the proxy when referenced by name in `collections.yaml`.

## Writing a plugin

A plugin is a JavaScript ES module that exports an object implementing
the `CollectionPlugin` interface:

\`\`\`javascript
// my-transform.js
export default {
  // Skip the built-in GeoJSON builder (if upstream already returns GeoJSON)
  skipGeojsonBuilder: false,

  // Transform the OGC request before it's sent upstream
  async transformRequest(req) {
    return req;
  },

  // Transform the raw upstream response
  async transformUpstreamResponse(raw) {
    return raw;
  },

  // Transform individual features
  async transformFeature(feature) {
    return feature;
  },

  // Transform the final OGC response
  async transformResponse(res) {
    return res;
  },
};
\`\`\`

## Usage in collections.yaml

Reference the plugin by filename (without `.js`):

\`\`\`yaml
collections:
  my-collection:
    plugin: "my-transform"
    # ... rest of config
\`\`\`
```

**Step 5: Create `examples/README.md`**

```markdown
# OGC Proxy — Quick Start

Deploy your own OGC API Features proxy in 4 steps.

## Prerequisites

- Docker and Docker Compose installed
- Access to your upstream REST APIs

## Setup

1. **Copy this directory** to your project:

   \`\`\`bash
   cp -r examples/ my-ogc-proxy/
   cd my-ogc-proxy/
   \`\`\`

2. **Configure your collections** in `collections.yaml`:
   - Set the upstream API URL, pagination, geometry mapping, and properties
   - See the commented examples for different geometry types and pagination styles

3. **Set environment variables** — copy and edit `.env.example`:

   \`\`\`bash
   cp .env.example .env
   # Edit .env with your values
   \`\`\`

4. **Start the proxy**:

   \`\`\`bash
   docker compose up -d
   \`\`\`

Your OGC API is now available at `http://localhost:3000/ogc`.

## Updating the proxy

To update to a newer version:

\`\`\`bash
docker compose pull
docker compose up -d
\`\`\`

## Custom plugins

Place `.js` files in the `plugins/` directory. See `plugins/README.md` for the plugin interface.

## Useful endpoints

| Endpoint | Description |
|----------|-------------|
| `/ogc` | Landing page |
| `/ogc/collections` | List all collections |
| `/ogc/collections/{id}/items` | Query features |
| `/ogc/collections/{id}/items?bbox=...` | Spatial filter |
| `/ogc/collections/{id}/items?filter=...&filter-lang=cql2-text` | CQL2 filter |
| `/wfs?service=WFS&request=GetCapabilities` | WFS capabilities |
```

**Step 6: Commit**

```bash
git add examples/
git commit -m "feat: add examples/ starter kit for multi-org deployment"
```

---

### Task 6: Create Kubernetes manifests

**Files:**
- Create: `docs/kubernetes/namespace.yaml`
- Create: `docs/kubernetes/configmap.yaml`
- Create: `docs/kubernetes/deployment.yaml`
- Create: `docs/kubernetes/service.yaml`
- Create: `docs/kubernetes/ingress.yaml`
- Create: `docs/kubernetes/redis.yaml`
- Create: `docs/kubernetes/README.md`

**Step 1: Create `docs/kubernetes/namespace.yaml`**

```yaml
apiVersion: v1
kind: Namespace
metadata:
  name: ogc-proxy
```

**Step 2: Create `docs/kubernetes/configmap.yaml`**

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: ogc-proxy-config
  namespace: ogc-proxy
data:
  collections.yaml: |
    # Paste your collections.yaml content here
    collections: {}
```

**Step 3: Create `docs/kubernetes/deployment.yaml`**

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: ogc-proxy
  namespace: ogc-proxy
spec:
  replicas: 2
  selector:
    matchLabels:
      app: ogc-proxy
  template:
    metadata:
      labels:
        app: ogc-proxy
    spec:
      containers:
        - name: ogc-proxy
          image: ghcr.io/VilledeMontreal/ogc-proxy:1
          ports:
            - containerPort: 3000
          env:
            - name: UPSTREAM_HOST
              value: "https://api.your-city.com"
            - name: REDIS_URL
              value: "redis://redis-svc.ogc-proxy.svc.cluster.local:6379"
            - name: PORT
              value: "3000"
          volumeMounts:
            - name: config
              mountPath: /app/config/collections.yaml
              subPath: collections.yaml
              readOnly: true
          resources:
            requests:
              cpu: 100m
              memory: 128Mi
            limits:
              cpu: 500m
              memory: 256Mi
          readinessProbe:
            httpGet:
              path: /ogc
              port: 3000
            initialDelaySeconds: 5
            periodSeconds: 10
          livenessProbe:
            httpGet:
              path: /ogc
              port: 3000
            initialDelaySeconds: 10
            periodSeconds: 30
      volumes:
        - name: config
          configMap:
            name: ogc-proxy-config
```

**Step 4: Create `docs/kubernetes/service.yaml`**

```yaml
apiVersion: v1
kind: Service
metadata:
  name: ogc-proxy-svc
  namespace: ogc-proxy
spec:
  selector:
    app: ogc-proxy
  ports:
    - port: 80
      targetPort: 3000
  type: ClusterIP
```

**Step 5: Create `docs/kubernetes/ingress.yaml`**

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: ogc-proxy-ingress
  namespace: ogc-proxy
  annotations:
    nginx.ingress.kubernetes.io/rewrite-target: /
spec:
  ingressClassName: nginx
  rules:
    - host: ogc.your-city.com
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: ogc-proxy-svc
                port:
                  number: 80
```

**Step 6: Create `docs/kubernetes/redis.yaml`**

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: redis
  namespace: ogc-proxy
spec:
  replicas: 1
  selector:
    matchLabels:
      app: redis
  template:
    metadata:
      labels:
        app: redis
    spec:
      containers:
        - name: redis
          image: redis:7-alpine
          ports:
            - containerPort: 6379
          resources:
            requests:
              cpu: 50m
              memory: 64Mi
            limits:
              cpu: 200m
              memory: 128Mi
---
apiVersion: v1
kind: Service
metadata:
  name: redis-svc
  namespace: ogc-proxy
spec:
  selector:
    app: redis
  ports:
    - port: 6379
      targetPort: 6379
  type: ClusterIP
```

**Step 7: Create `docs/kubernetes/README.md`**

```markdown
# Kubernetes Deployment

Deploy the OGC proxy on Kubernetes.

## Prerequisites

- Kubernetes cluster with `kubectl` configured
- Ingress controller (nginx-ingress recommended)

## Steps

### 1. Create the namespace

\`\`\`bash
kubectl apply -f namespace.yaml
\`\`\`

### 2. Create the config from your collections.yaml

\`\`\`bash
kubectl create configmap ogc-proxy-config \
  --from-file=collections.yaml=../path/to/your/collections.yaml \
  -n ogc-proxy
\`\`\`

Or edit `configmap.yaml` and apply:

\`\`\`bash
kubectl apply -f configmap.yaml
\`\`\`

### 3. Deploy Redis

\`\`\`bash
kubectl apply -f redis.yaml
\`\`\`

### 4. Set environment variables

Edit `deployment.yaml` to set:
- `UPSTREAM_HOST` — your upstream API base URL
- Any other env vars (see `.env.example` in the examples/ directory)

For secrets (JWT keys, etc.), use Kubernetes Secrets:

\`\`\`bash
kubectl create secret generic ogc-proxy-secrets \
  --from-literal=JWT_HOST=https://auth.your-city.com \
  -n ogc-proxy
\`\`\`

### 5. Deploy the proxy

\`\`\`bash
kubectl apply -f deployment.yaml
kubectl apply -f service.yaml
\`\`\`

### 6. Configure Ingress

Edit `ingress.yaml` with your domain, then:

\`\`\`bash
kubectl apply -f ingress.yaml
\`\`\`

### Custom plugins

To mount custom plugins, add a ConfigMap or PersistentVolumeClaim and mount it at `/app/plugins` in the deployment.

## Updating

\`\`\`bash
kubectl set image deployment/ogc-proxy \
  ogc-proxy=ghcr.io/VilledeMontreal/ogc-proxy:1.2.0 \
  -n ogc-proxy
\`\`\`
```

**Step 8: Commit**

```bash
git add docs/kubernetes/
git commit -m "docs: add Kubernetes deployment manifests and guide"
```

---

### Task 7: Update root .env.example and README

**Files:**
- Modify: `.env.example` — add `CONFIG_PATH` and `PLUGINS_DIR` docs
- Modify: `README.md` — add section about multi-org deployment

**Step 1: Add new env vars to `.env.example`**

Append to `.env.example`:

```bash

# ── External Configuration (Docker) ──────────────────────────
# Path to collections.yaml (set automatically in Docker image)
# CONFIG_PATH=/app/config/collections.yaml

# Directory for custom plugins (set automatically in Docker image)
# PLUGINS_DIR=/app/plugins
```

**Step 2: Add deployment section to README.md**

Add a "Deploy with Docker" section referencing the `examples/` directory and the published Docker image.

**Step 3: Commit**

```bash
git add .env.example README.md
git commit -m "docs: add multi-org deployment instructions to README"
```

---

### Task 8: End-to-end validation

**Step 1: Run full test suite**

Run: `npm run test:unit`
Expected: All tests PASS (existing + new)

**Step 2: Build and test Docker image**

```bash
cd packages/proxy && npm run build && docker build -t ogc-proxy-test .
```

Expected: Image builds successfully

**Step 3: Verify env vars work in Docker**

```bash
docker run --rm -e CONFIG_PATH=/app/config/collections.yaml ogc-proxy-test node -e "console.log(process.env.CONFIG_PATH)"
```

Expected: Prints `/app/config/collections.yaml`

**Step 4: Run conformance tests**

Run: `npm run test:conformance`
Expected: All conformance tests PASS

**Step 5: Commit any fixes if needed**
