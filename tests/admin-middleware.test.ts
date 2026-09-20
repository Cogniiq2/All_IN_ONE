/**
 * The outer gate on /admin: headers on every answer, redirects for the
 * unauthenticated, and no redirect loop on a preview-demo deployment that
 * happens to carry an operator cookie.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { middleware } from '@/middleware';
import { ADMIN_HEADERS } from '@/lib/admin/headers';
import { SESSION_COOKIE, signSession } from '@/lib/admin/session';
import { PREVIEW_AUDIENCE, PREVIEW_SESSION_COOKIE, previewSessionSecret } from '@/lib/admin/preview';

const SECRET = 's'.repeat(48);

function request(path: string, cookies: Record<string, string> = {}): NextRequest {
  const req = new NextRequest(new URL(path, 'https://bolagio.example'));
  for (const [name, value] of Object.entries(cookies)) req.cookies.set(name, value);
  return req;
}

beforeEach(() => {
  vi.stubEnv('APP_ENV', 'production');
  vi.stubEnv('ADMIN_SESSION_SECRET', SECRET);
});
afterEach(() => vi.unstubAllEnvs());

describe('headers', () => {
  it('hardens every /admin response, including redirects and the login page', async () => {
    for (const path of ['/admin', '/admin/bookings', '/admin/login']) {
      const response = await middleware(request(path));
      for (const [name, value] of Object.entries(ADMIN_HEADERS)) {
        expect(response.headers.get(name), `${path} ${name}`).toBe(value);
      }
    }
  });

  it('forbids framing and other origins in the policy', () => {
    const csp = ADMIN_HEADERS['Content-Security-Policy'];
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("connect-src 'self'");
    expect(csp).toContain("form-action 'self'");
    expect(csp).toContain("object-src 'none'");
    expect(ADMIN_HEADERS['X-Frame-Options']).toBe('DENY');
  });
});

describe('the gate', () => {
  it('sends an anonymous request to login with the path preserved', async () => {
    const response = await middleware(request('/admin/bookings?page=2'));
    expect(response.status).toBe(307);
    const location = new URL(response.headers.get('location')!);
    expect(location.pathname).toBe('/admin/login');
    expect(location.searchParams.get('next')).toBe('/admin/bookings?page=2');
  });

  it('lets a valid operator session through', async () => {
    const token = await signSession({ sub: 'u', email: 'ops@example.com' }, SECRET);
    const response = await middleware(request('/admin', { [SESSION_COOKIE]: token }));
    expect(response.status).toBe(200);
  });

  it('clears a forged cookie on the way to login', async () => {
    const response = await middleware(request('/admin', { [SESSION_COOKIE]: 'forged.token' }));
    expect(response.status).toBe(307);
    expect(response.headers.get('set-cookie')).toContain(`${SESSION_COOKIE}=;`);
  });

  it('reports an unconfigured secret rather than letting anything through', async () => {
    vi.stubEnv('ADMIN_SESSION_SECRET', '');
    const token = await signSession({ sub: 'u', email: 'ops@example.com' }, SECRET);
    const response = await middleware(request('/admin', { [SESSION_COOKIE]: token }));
    expect(response.status).toBe(307);
    expect(new URL(response.headers.get('location')!).searchParams.get('reason')).toBe('unconfigured');
  });
});

describe('on a preview-demo deployment', () => {
  beforeEach(() => {
    vi.stubEnv('APP_ENV', 'preview');
    vi.stubEnv('ADMIN_PREVIEW_DEMO', 'true');
    vi.stubEnv('ADMIN_PREVIEW_EMAIL', 'preview@example.com');
    vi.stubEnv('ADMIN_PREVIEW_PASSWORD', 'preview-only-not-a-real-credential');
  });

  it('ignores an operator cookie — only the demo cookie counts', async () => {
    /*
     * The protected layout resolves only the demo session on a preview. If
     * the middleware honoured an operator cookie here, the layout would
     * redirect to login and the middleware would redirect back: a loop.
     */
    const operator = await signSession({ sub: 'u', email: 'ops@example.com' }, SECRET);
    const response = await middleware(request('/admin', { [SESSION_COOKIE]: operator }));
    expect(response.status).toBe(307);
    expect(new URL(response.headers.get('location')!).pathname).toBe('/admin/login');
  });

  it('lets a valid demo session through', async () => {
    const secret = (await previewSessionSecret())!;
    const token = await signSession({ sub: 'preview-demo-viewer', email: 'preview@example.com', audience: PREVIEW_AUDIENCE }, secret);
    const response = await middleware(request('/admin', { [PREVIEW_SESSION_COOKIE]: token }));
    expect(response.status).toBe(200);
  });
});
