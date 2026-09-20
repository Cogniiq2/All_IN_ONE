import { defineConfig } from 'vitest/config';
import path from 'node:path';

/**
 * The integration suite: real repository, command, saga and route code
 * against the local Supabase-shaped stack (scripts/test-stack.sh) and the
 * provider simulators (tests/simulators). Separate from `npm test` because
 * it needs a running database; `npm run test:integration` runs it.
 *
 * One file at a time: the files share one database and reset it between
 * tests, and the simulators bind fresh ports per file.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/integration/**/*.test.ts'],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
      'server-only': path.resolve(__dirname, 'tests/stubs/server-only.ts'),
    },
  },
});
