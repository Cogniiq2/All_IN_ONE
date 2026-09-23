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
 *
 * The one exception is the LEGAL surface — the checkout summary, the consent
 * checkbox — where "is the cancellation block there, is the box unticked" is
 * a compliance property, not a look. Those few components are rendered to a
 * string with react-dom/server (no DOM needed), which is why JSX is compiled
 * with the automatic runtime here.
 */
export default defineConfig({
  esbuild: { jsx: 'automatic' },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // The integration suite needs the local stack and its own config
    // (vitest.integration.config.ts); it must never ride along with `npm test`.
    exclude: ['tests/integration/**', 'node_modules/**'],
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
