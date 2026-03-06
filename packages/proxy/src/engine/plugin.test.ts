import { describe, it, expect } from 'vitest';
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
