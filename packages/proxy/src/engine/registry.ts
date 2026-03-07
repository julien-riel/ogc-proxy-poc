import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { parse } from 'yaml';
import { registryConfigSchema } from './types.js';
import type { RegistryConfig, CollectionConfig } from './types.js';
import { loadPlugin, type CollectionPlugin } from './plugin.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

function substituteEnvVars(value: unknown): unknown {
  if (typeof value === 'string') {
    return value.replace(/\$\{(\w+)\}/g, (_, key) => process.env[key] || '');
  }
  if (Array.isArray(value)) {
    return value.map(substituteEnvVars);
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, substituteEnvVars(v)])
    );
  }
  return value;
}

let registry: RegistryConfig | null = null;

export function loadRegistry(configPath?: string): RegistryConfig {
  const path = configPath || resolve(__dirname, '../config/collections.yaml');
  const raw = readFileSync(path, 'utf-8');
  const parsed = parse(raw);
  const substituted = substituteEnvVars(parsed);
  registry = registryConfigSchema.parse(substituted);
  return registry;
}

export function getRegistry(): RegistryConfig {
  if (!registry) {
    registry = loadRegistry();
  }
  return registry;
}

export function getCollection(id: string): CollectionConfig | undefined {
  return getRegistry().collections[id];
}

export function getCollectionIds(): string[] {
  return Object.keys(getRegistry().collections);
}

const pluginCache = new Map<string, CollectionPlugin | null>();

export async function getCollectionPlugin(collectionId: string): Promise<CollectionPlugin | null> {
  if (pluginCache.has(collectionId)) {
    return pluginCache.get(collectionId)!;
  }
  const config = getCollection(collectionId);
  const plugin = await loadPlugin(config?.plugin);
  pluginCache.set(collectionId, plugin);
  return plugin;
}
