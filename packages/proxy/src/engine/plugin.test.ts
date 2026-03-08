import { describe, it, expect } from 'vitest';
import { resolve } from 'path';
import { tmpdir } from 'os';
import { mkdirSync, writeFileSync, rmSync } from 'fs';
import { loadPlugin, runHook, type CollectionPlugin } from './plugin.js';

describe('Plugin system', () => {
  describe('loadPlugin', () => {
    it('returns null for undefined plugin config', async () => {
      const plugin = await loadPlugin(undefined);
      expect(plugin).toBeNull();
    });

    it('loads a built-in plugin by name', async () => {
      const plugin = await loadPlugin('noop');
      expect(plugin).toBeDefined();
    });

    it('returns null for unknown built-in name', async () => {
      const plugin = await loadPlugin('unknown-plugin-name');
      expect(plugin).toBeNull();
    });

    it('rejects path traversal in plugin name with PLUGINS_DIR', async () => {
      const dir = resolve(tmpdir(), `plugins-traversal-${Date.now()}`);
      mkdirSync(dir, { recursive: true });

      process.env.PLUGINS_DIR = dir;
      try {
        const plugin = await loadPlugin('../../etc/passwd');
        expect(plugin).toBeNull();
      } finally {
        delete process.env.PLUGINS_DIR;
        rmSync(dir, { recursive: true });
      }
    });

    it('loads a plugin from PLUGINS_DIR directory', async () => {
      const dir = resolve(tmpdir(), `plugins-test-${Date.now()}`);
      mkdirSync(dir, { recursive: true });
      writeFileSync(
        resolve(dir, 'my-plugin.js'),
        `
        export default {
          skipGeojsonBuilder: true,
        };
      `,
      );

      process.env.PLUGINS_DIR = dir;
      try {
        const plugin = await loadPlugin('my-plugin');
        expect(plugin).toBeDefined();
        expect(plugin!.skipGeojsonBuilder).toBe(true);
      } finally {
        delete process.env.PLUGINS_DIR;
        rmSync(dir, { recursive: true });
      }
    });
  });

  describe('runHook', () => {
    it('returns input unchanged when plugin is null', async () => {
      const input = { foo: 'bar' };
      const result = await runHook(null, 'transformRequest', input);
      expect(result).toBe(input);
    });

    it('returns input unchanged when hook is not defined on plugin', async () => {
      const plugin: CollectionPlugin = {};
      const input = { foo: 'bar' };
      const result = await runHook(plugin, 'transformRequest', input);
      expect(result).toBe(input);
    });

    it('calls the hook and returns its result', async () => {
      const plugin: CollectionPlugin = {
        transformRequest: async (req) => ({ ...req, modified: true }),
      };
      const result = await runHook(plugin, 'transformRequest', { original: true });
      expect(result).toEqual({ original: true, modified: true });
    });
  });
});
