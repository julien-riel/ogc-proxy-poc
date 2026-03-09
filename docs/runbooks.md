# Operational Runbooks

Runbooks for common production incidents on the OGC proxy.

---

## 1. Upstream Not Responding

**Symptoms:** 504 errors, circuit breaker state `open`, health check status `unhealthy`.

### Diagnosis

1. Check overall proxy health:
   ```bash
   curl http://localhost:3000/health
   curl http://localhost:3000/ready
   ```

2. Check per-collection status (requires JWT):
   ```bash
   curl -H "Authorization: Bearer $ADMIN_TOKEN" http://localhost:3000/admin/status
   ```
   Look for collections where `upstream` is `unhealthy` or `circuitBreaker` is `open`.

3. Check Prometheus metrics for upstream errors:
   ```promql
   rate(ogc_proxy_upstream_errors_total[5m])
   ogc_proxy_circuit_breaker_state
   ```

4. Check upstream directly:
   ```bash
   curl -v "https://upstream-host/wfs?service=WFS&request=GetCapabilities"
   ```

### Resolution

1. If the upstream is down, the proxy will serve cached responses (Redis) for previously-seen requests. No action needed if cache is warm.
2. If cache is cold, inform users of degraded service.
3. Circuit breakers reset automatically after `resetTimeoutMs` (default 30s). Once the upstream recovers, the breaker transitions to `half-open` and then `closed`.
4. If the upstream requires manual intervention, escalate to the upstream data provider.

### Escalation

- Notify the upstream team with the failing URL and error details from logs.
- If the outage exceeds 1 hour and cache TTLs are expiring, consider temporarily increasing cache TTLs via config and redeploying.

---

## 2. High Latency

**Symptoms:** Slow page loads, high `ogc_proxy_upstream_request_duration_seconds` values, user complaints.

### Diagnosis

1. Identify which collection is slow:
   ```promql
   histogram_quantile(0.95, rate(ogc_proxy_upstream_request_duration_seconds_bucket[5m]))
   ```

2. Check cache hit ratio:
   ```promql
   rate(ogc_proxy_cache_operations_total{result="hit"}[5m])
   /
   (rate(ogc_proxy_cache_operations_total{result="hit"}[5m]) + rate(ogc_proxy_cache_operations_total{result="miss"}[5m]))
   ```
   A low hit ratio means most requests go to the upstream.

3. Check HTTP request durations for the proxy itself:
   ```promql
   histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m]))
   ```

4. Check if rate limiting is rejecting requests:
   ```promql
   rate(ogc_proxy_rate_limit_rejections_total[5m])
   ```

### Resolution

1. **Low cache hit ratio:** Increase cache TTL for the affected collection in `collections.yaml` and redeploy.
2. **Upstream is slow:** Check if the upstream is overloaded. Reduce `maxFeatures` or enable upstream rate limiting to avoid overwhelming it.
3. **Large response sizes:** Check `ogc_proxy_response_size_bytes` and `ogc_proxy_features_returned`. Consider lowering default page sizes.
4. **Redis latency:** Check Redis response times. If Redis is slow, the cache layer adds overhead instead of reducing it.

---

## 3. 5xx Errors Spike

**Symptoms:** Increase in 5xx responses, alerts from monitoring.

### Diagnosis

1. Check error rate by route:
   ```promql
   rate(http_requests_total{status_code=~"5.."}[5m])
   ```

2. Check logs for error details:
   ```bash
   # Docker
   docker logs ogc-proxy --since 10m 2>&1 | grep '"level":"error"'

   # Kubernetes
   kubectl logs -l app=ogc-proxy --since=10m | grep '"level":"error"'
   ```

3. Check upstream error breakdown:
   ```promql
   rate(ogc_proxy_upstream_errors_total[5m])
   ```

4. Check circuit breaker states:
   ```bash
   curl -H "Authorization: Bearer $ADMIN_TOKEN" http://localhost:3000/admin/status
   ```

### Resolution

1. **Upstream returning 5xx:** The proxy returns 502. Check the upstream service. Circuit breakers will open automatically if errors exceed the threshold.
2. **Proxy OOM or crash loop:** Check container memory usage. Increase memory limits if needed.
3. **Redis connection lost:** The proxy falls back to in-memory rate limiting, but cache misses increase. See [Redis Connection Issues](#6-redis-connection-issues).
4. **Restart if needed:**
   ```bash
   # Docker
   docker restart ogc-proxy

   # Kubernetes
   kubectl rollout restart deployment/ogc-proxy
   ```

---

## 4. Emergency Cache Invalidation

Use these commands when stale data must be cleared immediately (e.g., after an upstream data correction).

### Invalidate a Single Collection

```bash
curl -X DELETE \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  http://localhost:3000/admin/cache/my-collection
```

Response:
```json
{ "collection": "my-collection", "keysDeleted": 42 }
```

### Invalidate All Collections

```bash
curl -X DELETE \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  "http://localhost:3000/admin/cache?pattern=*"
```

Response:
```json
{ "pattern": "*", "keysDeleted": 256 }
```

### Invalidate by Pattern

```bash
# All collections starting with "cadastre"
curl -X DELETE \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  "http://localhost:3000/admin/cache?pattern=cadastre*"
```

### When to Use

| Scenario | Command |
|----------|---------|
| Single collection data corrected upstream | `DELETE /admin/cache/{collection}` |
| Schema change on one collection | `DELETE /admin/cache/{collection}` |
| Major upstream data refresh across collections | `DELETE /admin/cache?pattern=*` |
| Post-deployment cleanup | `DELETE /admin/cache?pattern=*` |

---

## 5. Deployment and Rollback

### Docker Deployment

1. Pull the latest image:
   ```bash
   docker pull ghcr.io/your-org/ogc-proxy:latest
   ```

2. Stop and restart:
   ```bash
   docker compose down
   docker compose up -d
   ```

3. Verify health:
   ```bash
   curl http://localhost:3000/health
   curl http://localhost:3000/ready
   ```

### Docker Rollback

```bash
docker pull ghcr.io/your-org/ogc-proxy:v1.2.3   # previous known-good tag
docker compose down
docker compose up -d
```

### Kubernetes Deployment

1. Update the image tag in `deployment.yaml` or use:
   ```bash
   kubectl set image deployment/ogc-proxy ogc-proxy=ghcr.io/your-org/ogc-proxy:v1.3.0
   ```

2. Watch the rollout:
   ```bash
   kubectl rollout status deployment/ogc-proxy
   ```

3. Verify pods are ready:
   ```bash
   kubectl get pods -l app=ogc-proxy
   ```

### Kubernetes Rollback

```bash
kubectl rollout undo deployment/ogc-proxy
kubectl rollout status deployment/ogc-proxy
```

### Post-Deployment Checklist

1. `/health` returns `{ "status": "ok" }`
2. `/ready` returns `ready` or `degraded` (not `not ready`)
3. `/admin/status` shows all collections with expected circuit breaker states
4. `/metrics` is being scraped by Prometheus
5. Spot-check a few collection endpoints for correct data

---

## 6. Redis Connection Issues

**Symptoms:** Log messages `Redis connection failed, falling back to in-memory`, degraded cache hit ratio, rate limiting using in-memory store instead of shared Redis store.

### Diagnosis

1. Check proxy readiness for Redis status:
   ```bash
   curl http://localhost:3000/ready
   ```
   The `redis` field shows the connection status.

2. Check Redis connectivity:
   ```bash
   # Docker
   docker exec redis redis-cli ping

   # Kubernetes
   kubectl exec -it svc/redis -- redis-cli ping
   ```

3. Check Redis memory:
   ```bash
   redis-cli info memory
   ```

4. Check Redis logs:
   ```bash
   # Docker
   docker logs redis --since 10m

   # Kubernetes
   kubectl logs -l app=redis --since=10m
   ```

### Impact When Redis Is Down

- **Caching:** Falls back to no cache. All requests go to upstream, increasing latency and upstream load.
- **Rate limiting:** Falls back to in-memory per-instance rate limiting. In a multi-replica deployment, each pod enforces limits independently (total allowed rate multiplied by replica count).
- **The proxy continues to serve requests.** Redis is not a hard dependency.

### Resolution

1. **Redis process crashed:** Restart it:
   ```bash
   # Docker
   docker restart redis

   # Kubernetes
   kubectl rollout restart deployment/redis
   ```

2. **Redis out of memory:** Check `maxmemory` policy. The proxy uses TTL-based keys, so an `allkeys-lru` eviction policy is appropriate.

3. **Network issue:** Verify the `REDIS_URL` environment variable points to the correct host and port.

4. **After Redis recovers:** The proxy reconnects automatically. Cache will be cold initially; expect higher upstream load for a few minutes until cache warms up.
