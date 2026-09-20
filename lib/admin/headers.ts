/**
 * The response headers every `/admin` answer carries.
 *
 * Web-standard `Headers` only and no `server-only` marker, because the edge
 * middleware imports this. Nothing here reads the environment.
 *
 * ── The content-security policy ──────────────────────────────────────────
 * Strict enough to make an injected script inert, permissive enough for the
 * App Router on this Next.js version: inline styles are used by the
 * interface's own components, and `'unsafe-inline'` for scripts is what the
 * hydration payload needs without a per-request nonce threaded through the
 * root layout (a later refinement, noted in docs/admin-control.md).
 * `frame-ancestors 'none'` plus the legacy `X-Frame-Options` make the
 * interface unframeable; `connect-src 'self'` means a compromised page cannot
 * exfiltrate to another origin; forms may only post back to this origin.
 */
export const ADMIN_CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "base-uri 'self'",
  "object-src 'none'",
].join('; ');

export const ADMIN_HEADERS: Readonly<Record<string, string>> = {
  'X-Robots-Tag': 'noindex, nofollow, noarchive',
  'Cache-Control': 'no-store, max-age=0',
  'Referrer-Policy': 'same-origin',
  'Content-Security-Policy': ADMIN_CSP,
  'X-Frame-Options': 'DENY',
  'X-Content-Type-Options': 'nosniff',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',
};

export function hardenAdminResponse<T extends { headers: Headers }>(response: T): T {
  for (const [name, value] of Object.entries(ADMIN_HEADERS)) response.headers.set(name, value);
  return response;
}
