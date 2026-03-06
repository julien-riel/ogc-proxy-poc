import { describe, it, expect, beforeEach } from 'vitest';
import { loadRegistry, getCollection, getCollectionIds, getCollectionPlugin } from './registry.js';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const configPath = resolve(__dirname, '../config/collections.yaml');

describe('Registry', () => {
  beforeEach(() => {
    process.env.UPSTREAM_HOST = 'http://localhost:3001';
  });

  it('loads all collections from YAML', () => {
    const registry = loadRegistry(configPath);
    expect(Object.keys(registry.collections)).toHaveLength(4);
  });

  it('substitutes environment variables in URLs', () => {
    const registry = loadRegistry(configPath);
    const bornes = registry.collections['bornes-fontaines'];
    expect(bornes.upstream.baseUrl).toBe('http://localhost:3001/api/bornes-fontaines');
  });

  it('returns collection by id', () => {
    loadRegistry(configPath);
    const col = getCollection('bornes-fontaines');
    expect(col).toBeDefined();
    expect(col!.title).toBe('Bornes-fontaines');
    expect(col!.geometry.type).toBe('Point');
  });

  it('returns undefined for unknown collection', () => {
    loadRegistry(configPath);
    expect(getCollection('unknown')).toBeUndefined();
  });

  it('returns all collection ids', () => {
    loadRegistry(configPath);
    const ids = getCollectionIds();
    expect(ids).toContain('bornes-fontaines');
    expect(ids).toContain('pistes-cyclables');
    expect(ids).toContain('arrondissements');
  });

  it('handles null total mapping', () => {
    loadRegistry(configPath);
    const arr = getCollection('arrondissements');
    expect(arr!.upstream.responseMapping.total).toBeNull();
  });

  it('returns null plugin for collection without plugin', async () => {
    loadRegistry(configPath);
    const plugin = await getCollectionPlugin('bornes-fontaines');
    expect(plugin).toBeNull();
  });
});
