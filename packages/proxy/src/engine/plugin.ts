import type { Feature } from 'geojson';
import { existsSync } from 'fs';
import { resolve } from 'path';
import { logger } from '../logger.js';
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

  const log = logger.registry();

  // File path: load directly
  if (pluginRef.startsWith('./') || pluginRef.startsWith('/')) {
    try {
      const mod = await import(pluginRef);
      return (mod.default ?? mod) as CollectionPlugin;
    } catch (err) {
      log.error(
        { plugin: pluginRef, error: err instanceof Error ? err.message : err },
        'failed to load plugin from path',
      );
      return null;
    }
  }

  // Built-in plugin
  if (builtinPlugins[pluginRef]) {
    return builtinPlugins[pluginRef];
  }

  // External plugins directory
  const pluginsDir = process.env.PLUGINS_DIR;
  if (pluginsDir) {
    const pluginPath = resolve(pluginsDir, `${pluginRef}.js`);
    const resolvedDir = resolve(pluginsDir) + '/';
    if (!pluginPath.startsWith(resolvedDir)) {
      log.warning(
        { plugin: pluginRef, resolvedPath: pluginPath, pluginsDir },
        'plugin rejected: path escapes plugins directory',
      );
      return null;
    }
    if (existsSync(pluginPath)) {
      try {
        const mod = await import(pluginPath);
        return (mod.default ?? mod) as CollectionPlugin;
      } catch (err) {
        log.error(
          { plugin: pluginRef, path: pluginPath, error: err instanceof Error ? err.message : err },
          'failed to load external plugin',
        );
        return null;
      }
    }
  }

  return null;
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
