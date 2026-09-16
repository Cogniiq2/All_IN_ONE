import { defineConfig } from 'vitest/config';
import path from 'node:path';

/**
 * Tests for the booking logic that can actually lose money.
 *
 * Node environment, no DOM, no React: what is tested here is date semantics,
 * stay validation, the state machine and idempotency — the parts where being
 * wrong means a night sold twice or a guest charged twice. Rendering tests are
 * deliberately absent; a snapshot of a calendar proves nothing a human eye
 * does not prove faster.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
      /*
       * `server-only` throws on import outside a React Server Component, which
       * is exactly the guarantee it exists to provide — and exactly what makes
       * it unimportable from a test runner. It is stubbed here so the modules
       * it guards can be tested directly. The guarantee itself is enforced by
       * the Next.js build, not by the test runner.
       */
      'server-only': path.resolve(__dirname, 'tests/stubs/server-only.ts'),
    },
  },
});
