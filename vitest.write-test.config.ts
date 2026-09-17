import { defineConfig } from 'vitest/config';
import path from 'node:path';

/**
 * A SEPARATE config, for the one test that writes to Beds24.
 *
 * ── Why it is not in vitest.config.ts ────────────────────────────────────
 * `npm test` must never, under any circumstance, create a booking. The main
 * config's `include` is `tests/**`, this file's is `scripts/beds24-write-test/**`,
 * and the two do not overlap — so the write test cannot be swept up by a
 * normal test run, a watch mode, a pre-commit hook or a CI job that runs
 * `npm test`. The separation is the safety mechanism, not a convention.
 *
 * The test additionally refuses to execute unless
 * `BEDS24_WRITE_TEST_CONFIRM=HOLD-AND-RELEASE` is set, so even running this
 * config by accident writes nothing.
 *
 *     npm run test:beds24-write
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['scripts/beds24-write-test/**/*.test.ts'],
    // A live provider round trip is several seconds per call.
    testTimeout: 120_000,
    hookTimeout: 120_000,
    // One file, one worker, in order. Nothing about this may run concurrently.
    fileParallelism: false,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
      'server-only': path.resolve(__dirname, 'tests/stubs/server-only.ts'),
    },
  },
});
