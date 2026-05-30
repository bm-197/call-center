import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const workspaceRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..',
);

export default defineConfig({
  resolve: {
    alias: {
      '@call-center/amharic': path.join(
        workspaceRoot,
        'packages/amharic/src/index.ts',
      ),
      '@call-center/db': path.join(workspaceRoot, 'packages/db/src/index.ts'),
      '@call-center/shared': path.join(
        workspaceRoot,
        'packages/shared/src/index.ts',
      ),
    },
  },
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
