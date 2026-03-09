# Plugin Development Guide

This guide covers how to develop plugins for the OGC proxy. Plugins let you intercept and transform requests, upstream responses, and features at various stages of the request lifecycle.

## Plugin Interface

A plugin is a JavaScript/TypeScript module that exports an object implementing `CollectionPlugin`:

```typescript
interface CollectionPlugin {
  skipGeojsonBuilder?: boolean;
  transformRequest?(req: OgcRequest): Promise<OgcRequest>;
  buildUpstreamRequest?(req: UpstreamRequest): Promise<UpstreamRequest>;
  transformUpstreamResponse?(raw: unknown): Promise<unknown>;
  transformFeature?(feature: Feature): Promise<Feature>;
  transformFeatures?(features: Feature[]): Promise<Feature[]>;
  transformResponse?(res: OgcResponse): Promise<OgcResponse>;
}
```

All hooks are optional. Only implement the ones you need.

### Types

```typescript
interface OgcRequest {
  collectionId: string;
  limit: number;
  offset: number;
  bbox?: [number, number, number, number];
  filter?: string;
  filterLang?: string;
  sortby?: string;
  queryParams: Record<string, string>;
}

interface UpstreamRequest {
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: string;
}

interface OgcResponse {
  type: 'FeatureCollection';
  features: Feature[];
  links: Array<{ href: string; rel: string; type: string }>;
  numberMatched?: number;
  numberReturned: number;
  timeStamp: string;
}
```

### Hook Reference

| Hook | Input | Purpose |
|------|-------|---------|
| `transformRequest` | `OgcRequest` | Modify the parsed OGC request before upstream fetch (adjust limits, bbox, filters) |
| `buildUpstreamRequest` | `UpstreamRequest` | Modify the raw HTTP request to the upstream service (change URL, headers, body) |
| `transformUpstreamResponse` | `unknown` | Transform the raw upstream response data before GeoJSON building |
| `transformFeatures` | `Feature[]` | Batch-transform all features at once (sorting, filtering, aggregation) |
| `transformFeature` | `Feature` | Transform a single feature (add/remove properties, modify geometry) |
| `transformResponse` | `OgcResponse` | Modify the final OGC API response before sending to the client |

### skipGeojsonBuilder

Set `skipGeojsonBuilder: true` when the upstream service already returns valid GeoJSON features. This bypasses the built-in GeoJSON builder that normally converts raw upstream records into GeoJSON features.

## Hook Lifecycle

Hooks execute in a fixed order during request processing:

```
Client Request
    |
    v
1. transformRequest(OgcRequest) --> modified OgcRequest
    |
    v
2. buildUpstreamRequest(UpstreamRequest) --> modified UpstreamRequest
    |
    v
   [Upstream HTTP fetch]
    |
    v
3. transformUpstreamResponse(raw) --> modified raw data
    |
    v
   [GeoJSON build] (skipped if skipGeojsonBuilder is true)
    |
    v
4. transformFeatures(Feature[]) --> modified features array
    |
    v
5. transformFeature(Feature) --> called for each feature individually
    |
    v
   [Post-fetch filters: bbox, CQL2, simple query params]
    |
    v
6. transformResponse(OgcResponse) --> final response sent to client
```

Key points:
- If a hook is not defined, the input passes through unchanged.
- `transformFeatures` runs before `transformFeature` -- use the batch hook for operations that need the full set (e.g., sorting), and the per-item hook for independent transformations.
- Post-fetch filters (bbox, CQL2) run after feature transforms, so plugin-added properties can be filtered on.
- `transformResponse` is the last hook and receives the fully built `FeatureCollection`.

## Step-by-Step Example

This plugin adds a `distance_km` property to each feature, computing the distance from a user-supplied `lat`/`lon` query parameter to the feature's geometry centroid.

### 1. Create the plugin file

Create `distance-plugin.js`:

```javascript
/**
 * Distance plugin -- adds distance_km to each feature based on
 * ?lat=...&lon=... query parameters.
 */

/**
 * Compute the Haversine distance between two points in kilometers.
 * @param {number} lat1
 * @param {number} lon1
 * @param {number} lat2
 * @param {number} lon2
 * @returns {number}
 */
function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Extract a centroid [lon, lat] from a GeoJSON geometry.
 * @param {object} geometry
 * @returns {[number, number] | null}
 */
function getCentroid(geometry) {
  if (!geometry) return null;
  if (geometry.type === 'Point') {
    return geometry.coordinates;
  }
  // Crude centroid: average all coordinates
  const coords = JSON.stringify(geometry.coordinates);
  const numbers = [...coords.matchAll(/-?\d+\.?\d*/g)].map((m) => Number(m[0]));
  const lons = numbers.filter((_, i) => i % 2 === 0);
  const lats = numbers.filter((_, i) => i % 2 === 1);
  if (lons.length === 0) return null;
  return [
    lons.reduce((a, b) => a + b, 0) / lons.length,
    lats.reduce((a, b) => a + b, 0) / lats.length,
  ];
}

/** @type {import('../packages/proxy/src/engine/plugin.js').CollectionPlugin} */
let savedQueryParams = {};

export default {
  async transformRequest(req) {
    // Capture query params so transformFeature can use them
    savedQueryParams = req.queryParams;
    return req;
  },

  async transformFeature(feature) {
    const lat = parseFloat(savedQueryParams.lat);
    const lon = parseFloat(savedQueryParams.lon);

    if (isNaN(lat) || isNaN(lon)) {
      return feature;
    }

    const centroid = getCentroid(feature.geometry);
    if (!centroid) {
      return feature;
    }

    return {
      ...feature,
      properties: {
        ...feature.properties,
        distance_km: Math.round(haversineKm(lat, lon, centroid[1], centroid[0]) * 100) / 100,
      },
    };
  },
};
```

### 2. Register the plugin

Place the file in your plugins directory and configure it in `collections.yaml`:

```yaml
collections:
  parks:
    upstream:
      type: json-api
      url: https://api.example.com/parks
    plugin: distance-plugin  # matches filename in PLUGINS_DIR
    properties:
      - name: name
        type: string
      - name: distance_km
        type: number
```

### 3. Query with distance

```
GET /collections/parks/items?lat=45.5&lon=-73.6&limit=10
```

Each feature in the response will include a computed `distance_km` property.

## Configuration

### Built-in plugins

Reference by name:

```yaml
collections:
  my-wfs-collection:
    plugin: wfs-upstream
```

Built-in plugins are registered in `packages/proxy/src/engine/plugin.ts` via `registerBuiltinPlugin()`.

### External plugins via PLUGINS_DIR

Set the `PLUGINS_DIR` environment variable to point to a directory containing `.js` plugin files:

```bash
PLUGINS_DIR=/opt/ogc-proxy/plugins node dist/index.js
```

Then reference by name (without `.js` extension):

```yaml
collections:
  parks:
    plugin: distance-plugin  # loads /opt/ogc-proxy/plugins/distance-plugin.js
```

### File path plugins

Reference by relative or absolute path:

```yaml
collections:
  parks:
    plugin: ./plugins/distance-plugin.js
```

Relative paths are resolved from the working directory.

## Testing Plugins

Test plugins with Vitest by importing the hook functions and calling them directly.

### Unit testing a plugin

```typescript
import { describe, it, expect } from 'vitest';
import distancePlugin from './distance-plugin.js';

describe('distance-plugin', () => {
  it('adds distance_km when lat/lon are provided', async () => {
    // Set up query params via transformRequest
    await distancePlugin.transformRequest({
      collectionId: 'parks',
      limit: 10,
      offset: 0,
      queryParams: { lat: '45.5', lon: '-73.6' },
    });

    const feature = {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [-73.5, 45.6] },
      properties: { name: 'Park A' },
    };

    const result = await distancePlugin.transformFeature(feature);

    expect(result.properties.distance_km).toBeTypeOf('number');
    expect(result.properties.distance_km).toBeGreaterThan(0);
    // Original properties preserved
    expect(result.properties.name).toBe('Park A');
  });

  it('returns feature unchanged without lat/lon', async () => {
    await distancePlugin.transformRequest({
      collectionId: 'parks',
      limit: 10,
      offset: 0,
      queryParams: {},
    });

    const feature = {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [-73.5, 45.6] },
      properties: { name: 'Park A' },
    };

    const result = await distancePlugin.transformFeature(feature);

    expect(result.properties.distance_km).toBeUndefined();
  });
});
```

### Testing with runHook

You can also test through the `runHook` utility to match how the engine calls plugins:

```typescript
import { describe, it, expect } from 'vitest';
import { runHook, type CollectionPlugin } from '../engine/plugin.js';

describe('runHook integration', () => {
  it('passes input through when hook is missing', async () => {
    const plugin: CollectionPlugin = {};
    const input = { collectionId: 'test', limit: 10, offset: 0, queryParams: {} };
    const result = await runHook(plugin, 'transformRequest', input);
    expect(result).toBe(input);
  });

  it('returns null plugin input unchanged', async () => {
    const input = { foo: 'bar' };
    const result = await runHook(null, 'transformRequest', input);
    expect(result).toBe(input);
  });
});
```

### Running tests

```bash
cd packages/proxy
npx vitest run --reporter=verbose
```

## Best Practices

1. **Keep hooks pure.** Avoid side effects. Each hook should take input and return output without modifying global state. The distance plugin example above uses module-level state for simplicity -- in production, prefer passing context through the `OgcRequest.queryParams`.

2. **Do not mutate inputs.** Always return new objects using the spread operator (`{ ...feature, properties: { ...feature.properties } }`) instead of modifying the input directly. This prevents subtle bugs when the engine reuses objects.

3. **Handle errors gracefully.** Wrap risky operations in try-catch and return the input unchanged on failure. A crashing plugin hook will cause a 502 error for the entire request.

   ```javascript
   async transformFeature(feature) {
     try {
       // risky transformation
       return { ...feature, properties: { ...feature.properties, computed: expensiveCalc() } };
     } catch (err) {
       console.error('transform failed, returning original feature', err);
       return feature;
     }
   }
   ```

4. **Use `skipGeojsonBuilder` when upstream returns GeoJSON.** If your upstream already returns valid GeoJSON features (e.g., a WFS service with `outputFormat=application/json`), set `skipGeojsonBuilder: true` to avoid the overhead of re-building features from raw records.

5. **Prefer `transformFeatures` for batch operations.** Use the batch hook when you need the full feature set (sorting, deduplication, computing ranks). Use `transformFeature` for independent per-feature transforms.

6. **Keep plugins focused.** One plugin per collection. If multiple collections need the same logic, extract shared utilities into a separate module and import them.

7. **Use default exports.** The plugin loader expects either a default export or a module with `CollectionPlugin` properties at the top level. Prefer `export default { ... }` for clarity.
