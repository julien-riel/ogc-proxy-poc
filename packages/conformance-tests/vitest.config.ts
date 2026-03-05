import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    globalSetup: './src/global-setup.ts',
    testTimeout: 15000,
  },
});
