import { logger } from '../logger.js';
import { safeMetric } from '../metrics.js';
import { Gauge } from 'prom-client';

export const upstreamHealthStatus = new Gauge({
  name: 'ogc_proxy_upstream_health_status',
  help: 'Upstream health status (1=healthy, 0=unhealthy)',
  labelNames: ['collection'] as const,
});

export type HealthStatus = 'healthy' | 'unhealthy' | 'unknown';

export class HealthChecker {
  private statuses = new Map<string, HealthStatus>();
  private intervalId: ReturnType<typeof setInterval> | null = null;

  getStatus(collectionId: string): HealthStatus {
    return this.statuses.get(collectionId) ?? 'unknown';
  }

  getAllStatuses(): Record<string, HealthStatus> {
    return Object.fromEntries(this.statuses);
  }

  async check(collectionId: string, baseUrl: string): Promise<void> {
    const log = logger.adapter();
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      const response = await fetch(baseUrl, {
        method: 'HEAD',
        signal: controller.signal,
      });
      clearTimeout(timeout);
      const status: HealthStatus = response.ok ? 'healthy' : 'unhealthy';
      this.statuses.set(collectionId, status);
      safeMetric(() => upstreamHealthStatus.set({ collection: collectionId }, status === 'healthy' ? 1 : 0));
    } catch {
      this.statuses.set(collectionId, 'unhealthy');
      safeMetric(() => upstreamHealthStatus.set({ collection: collectionId }, 0));
      log.warning({ collectionId }, 'upstream health check failed');
    }
  }

  startPeriodic(collections: Record<string, { upstream: { baseUrl: string } }>, intervalMs = 30000): void {
    const checkAll = () => {
      for (const [id, config] of Object.entries(collections)) {
        this.check(id, config.upstream.baseUrl);
      }
    };
    checkAll();
    this.intervalId = setInterval(checkAll, intervalMs);
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }
}
