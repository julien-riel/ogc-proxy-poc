# Custom Plugins

Place custom plugin files (`.js`) in this directory. They will be
loaded by the proxy when referenced by name in `collections.yaml`.

## Writing a plugin

A plugin is a JavaScript ES module that exports an object implementing
the `CollectionPlugin` interface:

```javascript
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
```

## Usage in collections.yaml

Reference the plugin by filename (without `.js`):

```yaml
collections:
  my-collection:
    plugin: "my-transform"
    # ... rest of config
```
