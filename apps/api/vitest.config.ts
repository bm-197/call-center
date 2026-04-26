import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    setupFiles: ['./test/setup.ts'],
    testTimeout: 15_000,
    pool: 'forks',
    forks: { singleFork: true },
    fileParallelism: false,
  },
});
