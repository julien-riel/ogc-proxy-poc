import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadRegistry, getCollection, getCollectionIds, getCollectionPlugin } from './registry.js';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { writeFileSync, unlinkSync } from 'fs';
import { tmpdir } from 'os';
import { stringify } from 'yaml';

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

  it('should parse security config from YAML', () => {
    const config = loadRegistry(resolve(__dirname, '../config/collections.yaml'));
    expect(config.security).toBeDefined();
    expect(config.security?.jwt).toBeDefined();
    expect(config.security?.jwt?.enabled).toBe(false);
  });
});

describe('Registry Zod validation', () => {
  const tmpFiles: string[] = [];

  /**
   * Creates a temporary YAML config file and tracks it for cleanup.
   */
  function writeTempConfig(data: unknown): string {
    const filePath = resolve(tmpdir(), `registry-test-${Date.now()}-${Math.random().toString(36).slice(2)}.yaml`);
    writeFileSync(filePath, stringify(data), 'utf-8');
    tmpFiles.push(filePath);
    return filePath;
  }

  afterEach(() => {
    for (const f of tmpFiles) {
      try {
        unlinkSync(f);
      } catch {
        /* ignore */
      }
    }
    tmpFiles.length = 0;
  });

  it('rejects config with missing collections', () => {
    const path = writeTempConfig({ defaults: { maxPageSize: 100 } });
    expect(() => loadRegistry(path)).toThrow();
  });

  it('rejects config with invalid upstream URL', () => {
    const path = writeTempConfig({
      collections: {
        test: {
          title: 'Test',
          upstream: {
            baseUrl: 'not-a-url',
            method: 'GET',
            pagination: { type: 'offset-limit', offsetParam: 'offset', limitParam: 'limit' },
            responseMapping: { items: 'data', total: 'total', item: 'data' },
          },
          geometry: { type: 'Point', xField: 'x', yField: 'y' },
          idField: 'id',
          properties: [],
        },
      },
    });
    expect(() => loadRegistry(path)).toThrow();
  });

  it('accepts valid config', () => {
    const path = writeTempConfig({
      defaults: { maxPageSize: 500 },
      collections: {
        test: {
          title: 'Test Collection',
          upstream: {
            baseUrl: 'https://example.com/api',
            method: 'GET',
            pagination: { type: 'offset-limit', offsetParam: 'offset', limitParam: 'limit' },
            responseMapping: { items: 'data', total: null, item: 'data' },
          },
          geometry: { type: 'Point', xField: 'x', yField: 'y' },
          idField: 'id',
          properties: [{ name: 'field1', type: 'string', filterable: true }],
        },
      },
    });
    const config = loadRegistry(path);
    expect(config.collections['test'].title).toBe('Test Collection');
    expect(config.collections['test'].upstream.responseMapping.total).toBeNull();
  });
});
