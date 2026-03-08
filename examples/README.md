# OGC Proxy — Quick Start

Deploy your own OGC API Features proxy in 4 steps.

## Prerequisites

- Docker and Docker Compose installed
- Access to your upstream REST APIs

## Setup

1. **Copy this directory** to your project:

   ```bash
   cp -r examples/ my-ogc-proxy/
   cd my-ogc-proxy/
   ```

2. **Configure your collections** in `collections.yaml`:
   - Set the upstream API URL, pagination, geometry mapping, and properties
   - See the commented examples for different geometry types and pagination styles

3. **Set environment variables** — copy and edit `.env.example`:

   ```bash
   cp .env.example .env
   # Edit .env with your values
   ```

4. **Start the proxy**:

   ```bash
   docker compose up -d
   ```

Your OGC API is now available at `http://localhost:3000/ogc`.

## Updating the proxy

To update to a newer version:

```bash
docker compose pull
docker compose up -d
```

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
