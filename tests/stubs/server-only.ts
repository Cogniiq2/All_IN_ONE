/**
 * A no-op stand-in for the `server-only` package.
 *
 * The real module throws when it is imported anywhere but a server component,
 * which is what keeps secrets out of the browser bundle — and which also makes
 * it unimportable from Vitest. Aliased in vitest.config.ts so the server
 * modules it guards can be unit tested. Nothing in the application imports it.
 */
export {};
