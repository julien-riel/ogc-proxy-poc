import type { CollectionConfig } from './types.js';
import { getByPath } from './geojson-builder.js';
import { buildWfsGetFeatureUrl } from '../plugins/wfs-upstream.js';
import { logger } from '../logger.js';

export interface FetchParams {
  offset: number;
  limit: number;
  bbox?: [number, number, number, number];
  upstreamParams?: Record<string, string>;
}

export interface UpstreamPage {
  items: Record<string, unknown>[];
  total?: number;
}

export class UpstreamError extends Error {
  constructor(public readonly statusCode: number) {
    super(`Upstream error: ${statusCode}`);
  }
}

export class UpstreamTimeoutError extends Error {
  constructor(public readonly url: string, public readonly timeoutMs: number) {
    super(`Upstream timeout after ${timeoutMs}ms`);
  }
}

const DEFAULT_TIMEOUT_MS = 15_000;

async function fetchJson(url: string, timeoutMs?: number): Promise<Record<string, unknown>> {
  const log = logger.adapter();
  const start = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs ?? DEFAULT_TIMEOUT_MS);

  try {
    const response = await fetch(url, { signal: controller.signal });
    const durationMs = Date.now() - start;
    log.info({ url, status: response.status, durationMs }, `upstream ${response.status} in ${durationMs}ms`);
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

function extractItems(body: Record<string, unknown>, config: CollectionConfig): Record<string, unknown>[] {
  return (getByPath(body, config.upstream.responseMapping.items) as Record<string, unknown>[]) || [];
}

function extractTotal(body: Record<string, unknown>, config: CollectionConfig): number | undefined {
  const { total } = config.upstream.responseMapping;
  return total ? (getByPath(body, total) as number | undefined) : undefined;
}

function applyExtraParams(url: URL, params: FetchParams): void {
  if (params.bbox) {
    url.searchParams.set('bbox', params.bbox.join(','));
  }
  if (params.upstreamParams) {
    for (const [key, value] of Object.entries(params.upstreamParams)) {
      url.searchParams.set(key, value);
    }
  }
}

async function fetchOffsetLimit(config: CollectionConfig, params: FetchParams): Promise<UpstreamPage> {
  const pagination = config.upstream.pagination as { offsetParam: string; limitParam: string };
  const url = new URL(config.upstream.baseUrl);
  url.searchParams.set(pagination.offsetParam, String(params.offset));
  url.searchParams.set(pagination.limitParam, String(params.limit));
  applyExtraParams(url, params);

  const body = await fetchJson(url.toString(), config.timeout);
  return { items: extractItems(body, config), total: extractTotal(body, config) };
}

async function fetchPageBased(config: CollectionConfig, params: FetchParams): Promise<UpstreamPage> {
  const pagination = config.upstream.pagination as { pageParam: string; pageSizeParam: string };
  const page = Math.floor(params.offset / params.limit) + 1;

  const url = new URL(config.upstream.baseUrl);
  url.searchParams.set(pagination.pageParam, String(page));
  url.searchParams.set(pagination.pageSizeParam, String(params.limit));
  applyExtraParams(url, params);

  const body = await fetchJson(url.toString(), config.timeout);
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
    applyExtraParams(url, params);

    const body = await fetchJson(url.toString(), config.timeout);
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

async function fetchWfsUpstream(config: CollectionConfig, params: FetchParams): Promise<UpstreamPage> {
  const log = logger.adapter();
  const url = buildWfsGetFeatureUrl(
    config.upstream.baseUrl,
    config.upstream.typeName!,
    {
      startIndex: params.offset,
      count: params.limit,
      version: config.upstream.version ?? '1.1.0',
      bbox: params.bbox,
    },
  );

  const start = Date.now();
  const timeoutMs = config.timeout ?? DEFAULT_TIMEOUT_MS;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, { signal: controller.signal });
    const durationMs = Date.now() - start;
    log.info({ url, status: response.status, durationMs }, `upstream WFS ${response.status} in ${durationMs}ms`);
    if (!response.ok) {
      throw new UpstreamError(response.status);
    }
    const body = await response.json() as Record<string, unknown>;
    const features = (body.features ?? []) as Record<string, unknown>[];
    const total = body.totalFeatures as number | undefined;

    return { items: features, total };
  } catch (err) {
    if (err instanceof UpstreamError) throw err;
    const durationMs = Date.now() - start;
    if (err instanceof DOMException && err.name === 'AbortError') {
      log.error({ url, durationMs, timeoutMs }, 'upstream WFS timeout');
      throw new UpstreamTimeoutError(url, timeoutMs);
    }
    log.error({ url, durationMs, err }, 'upstream WFS fetch failed');
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

export async function fetchUpstreamItems(
  config: CollectionConfig,
  params: FetchParams,
): Promise<UpstreamPage> {
  if (config.upstream.type === 'wfs') {
    return fetchWfsUpstream(config, params);
  }

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
  const body = await fetchJson(url, config.timeout);
  return getByPath(body, config.upstream.responseMapping.item) as Record<string, unknown>;
}
