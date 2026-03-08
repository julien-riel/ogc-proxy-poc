import type { Feature } from 'geojson';
import { wfsUpstreamPlugin } from '../plugins/wfs-upstream.js';

export interface OgcRequest {
  collectionId: string;
  limit: number;
  offset: number;
  bbox?: [number, number, number, number];
  filter?: string;
  filterLang?: string;
  sortby?: string;
  queryParams: Record<string, string>;
}

export interface UpstreamRequest {
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: string;
}

export interface OgcResponse {
  type: 'FeatureCollection';
  features: Feature[];
  links: Array<{ href: string; rel: string; type: string }>;
  numberMatched?: number;
  numberReturned: number;
  timeStamp: string;
}

export interface CollectionPlugin {
  skipGeojsonBuilder?: boolean;
  transformRequest?(req: OgcRequest): Promise<OgcRequest>;
  buildUpstreamRequest?(req: UpstreamRequest): Promise<UpstreamRequest>;
  transformUpstreamResponse?(raw: unknown): Promise<unknown>;
  transformFeature?(feature: Feature): Promise<Feature>;
  transformFeatures?(features: Feature[]): Promise<Feature[]>;
  transformResponse?(res: OgcResponse): Promise<OgcResponse>;
}

const builtinPlugins: Record<string, CollectionPlugin> = {
  noop: {},
  'wfs-upstream': wfsUpstreamPlugin,
};

/**
 * Register a built-in plugin by name.
 */
export function registerBuiltinPlugin(name: string, plugin: CollectionPlugin): void {
  builtinPlugins[name] = plugin;
}

/**
 * Load a plugin by name (built-in) or file path (custom).
 * Returns null if no plugin is configured or not found.
 */
export async function loadPlugin(pluginRef: string | undefined): Promise<CollectionPlugin | null> {
  if (!pluginRef) return null;

  if (!pluginRef.startsWith('./') && !pluginRef.startsWith('/')) {
    return builtinPlugins[pluginRef] ?? null;
  }

  try {
    const mod = await import(pluginRef);
    return (mod.default ?? mod) as CollectionPlugin;
  } catch {
    return null;
  }
}

type HookName = keyof Omit<CollectionPlugin, 'skipGeojsonBuilder'>;

/**
 * Run a plugin hook if it exists, otherwise return input unchanged.
 */
export async function runHook<T>(plugin: CollectionPlugin | null, hookName: HookName, input: T): Promise<T> {
  if (!plugin) return input;
  const hook = plugin[hookName] as ((input: T) => Promise<T>) | undefined;
  if (!hook) return input;
  return hook(input);
}
