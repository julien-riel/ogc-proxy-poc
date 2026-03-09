import type { CollectionConfig } from './types.js';
import { getByPath } from './geojson-builder.js';
import { logger } from '../logger.js';

export class UpstreamError extends Error {
  constructor(public readonly statusCode: number) {
    super(`Upstream error: ${statusCode}`);
  }
}

export class UpstreamTimeoutError extends Error {
  public readonly timeoutMs: number;
  constructor(url: string, timeoutMs: number) {
    super(`Upstream timeout after ${timeoutMs}ms`);
    this.timeoutMs = timeoutMs;
  }
}

export const DEFAULT_TIMEOUT_MS = 15_000;

export function redactUrl(url: string): string {
  try {
    const u = new URL(url);
    return `${u.origin}${u.pathname}`;
  } catch {
    return url;
  }
}

export async function fetchJson(url: string, timeoutMs?: number): Promise<Record<string, unknown>> {
  const log = logger.adapter();
  const start = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs ?? DEFAULT_TIMEOUT_MS);

  try {
    const response = await fetch(url, { signal: controller.signal });
    const durationMs = Date.now() - start;
    log.info(
      { url: redactUrl(url), status: response.status, durationMs },
      `upstream ${response.status} in ${durationMs}ms`,
    );
    if (!response.ok) {
      throw new UpstreamError(response.status);
    }
    return response.json() as Promise<Record<string, unknown>>;
  } catch (err) {
    if (err instanceof UpstreamError) throw err;
    const durationMs = Date.now() - start;
    if (err instanceof DOMException && err.name === 'AbortError') {
      log.error({ url, durationMs, timeoutMs: timeoutMs ?? DEFAULT_TIMEOUT_MS }, 'upstream timeout');
      throw new UpstreamTimeoutError(url, timeoutMs ?? DEFAULT_TIMEOUT_MS);
    }
    log.error({ url, durationMs, err }, 'upstream fetch failed');
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

export function extractItems(body: Record<string, unknown>, config: CollectionConfig): Record<string, unknown>[] {
  const raw = getByPath(body, config.upstream.responseMapping.items);
  if (!Array.isArray(raw)) {
    const log = logger.adapter();
    log.warning({ path: config.upstream.responseMapping.items }, 'upstream items field is not an array');
    return [];
  }
  return raw as Record<string, unknown>[];
}

export function extractTotal(body: Record<string, unknown>, config: CollectionConfig): number | undefined {
  const { total } = config.upstream.responseMapping;
  if (!total) return undefined;
  const value = getByPath(body, total);
  if (typeof value !== 'number' || isNaN(value)) {
    if (value !== undefined && value !== null) {
      const log = logger.adapter();
      log.warning({ path: total, value }, 'upstream total is not a valid number');
    }
    return undefined;
  }
  return value;
}
