import { Router, type RequestHandler } from 'express';
import type { CacheService } from '../engine/cache.js';
import { getRegistry } from '../engine/registry.js';
import { getCircuitBreaker } from '../engine/circuit-breaker.js';
import type { HealthChecker } from '../engine/health-check.js';

/**
 * Creates an Express router for admin operations.
 * @param jwtMiddleware - Authentication middleware to protect admin endpoints
 * @param cache - Cache service instance for cache management operations
 * @returns Express Router with admin endpoints
 */
export function createAdminRouter(jwtMiddleware: RequestHandler, cache: CacheService): Router {
  const router = Router();

  router.get('/status', jwtMiddleware, (req, res) => {
    const healthChecker = req.app.get('healthChecker') as HealthChecker | undefined;
    const registry = getRegistry();
    const collections = Object.entries(registry.collections).map(([id, config]) => ({
      id,
      title: config.title,
      upstream: healthChecker?.getStatus(id) ?? 'unknown',
      circuitBreaker: getCircuitBreaker(id, config.circuitBreaker)?.state ?? 'none',
    }));
    const hasUnhealthy = collections.some((c) => c.upstream === 'unhealthy');
    res.json({
      status: hasUnhealthy ? 'degraded' : 'healthy',
      collections,
      timestamp: new Date().toISOString(),
    });
  });

  router.get('/dashboard', (_req, res) => {
    res.set('Content-Type', 'text/html');
    res.send(buildDashboardHtml());
  });

  router.delete('/cache', jwtMiddleware, async (req, res) => {
    const pattern = req.query.pattern as string;
    if (!pattern) {
      return res.status(400).json({ code: 'InvalidRequest', description: 'pattern query parameter required' });
    }
    try {
      const keysDeleted = await cache.invalidateByPattern(pattern);
      res.json({ pattern, keysDeleted });
    } catch {
      res.status(500).json({ code: 'CacheError', description: 'Failed to invalidate cache by pattern' });
    }
  });

  router.delete('/cache/:collectionId', jwtMiddleware, async (req, res) => {
    const collectionId = req.params.collectionId as string;
    try {
      const keysDeleted = await cache.invalidate(collectionId);
      res.json({ collection: collectionId, keysDeleted });
    } catch {
      res.status(500).json({ code: 'CacheError', description: 'Failed to invalidate cache' });
    }
  });

  return router;
}

/**
 * Builds a self-contained HTML dashboard page for monitoring proxy status.
 * @returns HTML string with inline CSS and JS
 */
function buildDashboardHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>OGC Proxy - Admin Dashboard</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; padding: 2rem; background: #f5f5f5; color: #333; }
  @media (prefers-color-scheme: dark) { body { background: #1a1a2e; color: #e0e0e0; } }
  h1 { margin-bottom: 1rem; }
  .status-badge { display: inline-block; padding: 0.25rem 0.75rem; border-radius: 1rem; font-weight: bold; font-size: 0.875rem; }
  .status-healthy { background: #d4edda; color: #155724; }
  .status-degraded { background: #fff3cd; color: #856404; }
  .status-unhealthy { background: #f8d7da; color: #721c24; }
  .status-unknown { background: #e2e3e5; color: #383d41; }
  .status-none { background: #e2e3e5; color: #383d41; }
  .status-closed { background: #d4edda; color: #155724; }
  .status-open { background: #f8d7da; color: #721c24; }
  .status-half-open { background: #fff3cd; color: #856404; }
  table { width: 100%; border-collapse: collapse; margin-top: 1rem; background: white; border-radius: 0.5rem; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
  @media (prefers-color-scheme: dark) { table { background: #16213e; } }
  th, td { padding: 0.75rem 1rem; text-align: left; border-bottom: 1px solid #eee; }
  @media (prefers-color-scheme: dark) { th, td { border-color: #333; } }
  th { background: #f8f9fa; font-weight: 600; }
  @media (prefers-color-scheme: dark) { th { background: #0f3460; } }
  .meta { color: #888; font-size: 0.875rem; margin-top: 0.5rem; }
</style>
</head>
<body>
<h1>OGC Proxy Dashboard</h1>
<div id="overview"><p>Loading...</p></div>
<table>
  <thead><tr><th>Collection</th><th>Upstream</th><th>Circuit Breaker</th></tr></thead>
  <tbody id="collections"></tbody>
</table>
<p class="meta" id="meta"></p>
<script>
function createBadge(text, cssClass) {
  var span = document.createElement('span');
  span.className = 'status-badge status-' + cssClass;
  span.textContent = text;
  return span;
}
async function refresh() {
  try {
    var res = await fetch('/admin/status');
    var data = await res.json();
    var overview = document.getElementById('overview');
    overview.replaceChildren();
    var p = document.createElement('p');
    p.appendChild(document.createTextNode('Status: '));
    p.appendChild(createBadge(data.status.toUpperCase(), data.status));
    overview.appendChild(p);
    var tbody = document.getElementById('collections');
    tbody.replaceChildren();
    data.collections.forEach(function(c) {
      var tr = document.createElement('tr');
      var tdName = document.createElement('td');
      tdName.textContent = c.id;
      var small = document.createElement('small');
      small.textContent = ' (' + c.title + ')';
      tdName.appendChild(small);
      var tdUpstream = document.createElement('td');
      tdUpstream.appendChild(createBadge(c.upstream, c.upstream));
      var tdCb = document.createElement('td');
      tdCb.appendChild(createBadge(c.circuitBreaker, c.circuitBreaker));
      tr.appendChild(tdName);
      tr.appendChild(tdUpstream);
      tr.appendChild(tdCb);
      tbody.appendChild(tr);
    });
    document.getElementById('meta').textContent = 'Last updated: ' + new Date(data.timestamp).toLocaleString();
  } catch (e) {
    document.getElementById('overview').textContent = 'Error loading status';
  }
}
refresh();
setInterval(refresh, 10000);
</script>
</body>
</html>`;
}
