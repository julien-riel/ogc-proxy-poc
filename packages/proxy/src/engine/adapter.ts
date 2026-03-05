import type { CollectionConfig, PaginationConfig } from './types.js';
import { getByPath } from './geojson-builder.js';

interface FetchParams {
  offset: number;
  limit: number;
  bbox?: [number, number, number, number];
}

export interface UpstreamPage {
  items: Record<string, unknown>[];
  total?: number;
}

async function fetchJson(url: string): Promise<Record<string, unknown>> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Upstream error: ${response.status}`);
  }
  return response.json() as Promise<Record<string, unknown>>;
}

function extractItems(body: Record<string, unknown>, config: CollectionConfig): Record<string, unknown>[] {
  return (getByPath(body, config.upstream.responseMapping.items) as Record<string, unknown>[]) || [];
}

function extractTotal(body: Record<string, unknown>, config: CollectionConfig): number | undefined {
  const { total } = config.upstream.responseMapping;
  return total ? (getByPath(body, total) as number | undefined) : undefined;
}

async function fetchOffsetLimit(config: CollectionConfig, params: FetchParams): Promise<UpstreamPage> {
  const pagination = config.upstream.pagination as { offsetParam: string; limitParam: string };
  const url = new URL(config.upstream.baseUrl);
  url.searchParams.set(pagination.offsetParam, String(params.offset));
  url.searchParams.set(pagination.limitParam, String(params.limit));

  const body = await fetchJson(url.toString());
  return { items: extractItems(body, config), total: extractTotal(body, config) };
}

async function fetchPageBased(config: CollectionConfig, params: FetchParams): Promise<UpstreamPage> {
  const pagination = config.upstream.pagination as { pageParam: string; pageSizeParam: string };
  const page = Math.floor(params.offset / params.limit) + 1;

  const url = new URL(config.upstream.baseUrl);
  url.searchParams.set(pagination.pageParam, String(page));
  url.searchParams.set(pagination.pageSizeParam, String(params.limit));

  const body = await fetchJson(url.toString());
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

    const body = await fetchJson(url.toString());
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

export async function fetchUpstreamItems(
  config: CollectionConfig,
  params: FetchParams,
): Promise<UpstreamPage> {
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
  const body = await fetchJson(url);
  return getByPath(body, config.upstream.responseMapping.item) as Record<string, unknown>;
}
