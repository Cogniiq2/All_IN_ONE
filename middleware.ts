import { NextResponse, type NextRequest } from 'next/server';
import { hardenAdminResponse as harden } from '@/lib/admin/headers';
import { SESSION_COOKIE, verifySession } from '@/lib/admin/session';
import {
  PREVIEW_AUDIENCE,
  PREVIEW_SESSION_COOKIE,
  isPreviewDemoEnabled,
  previewSessionSecret,
} from '@/lib/admin/preview';

/**
 * The outer gate on BoLaGio Control.
 *
 * Runs on every request under `/admin`, before any page code. It verifies the
 * session cookie's signature and expiry — no I/O, no database — and sends
 * anyone without a valid one to the login page. The protected layout then
 * does the second, authoritative check against the operator allowlist.
 *
 * Two headers are set on every `/admin` response, including redirects and the
 * login page: `X-Robots-Tag: noindex, nofollow` so the operations interface
 * never enters an index whatever a page's own metadata says, and
 * `Cache-Control: no-store` so no intermediary keeps a copy of an operator's
 * screen.
 *
 * ── Fail closed ──────────────────────────────────────────────────────────
 * No `ADMIN_SESSION_SECRET`, or one too short to be a secret, and every
 * request is redirected to the login page, where sign-in is refused with an
 * explanation. There is no configuration that lets a request through.
 */
export async function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const isLogin = pathname === '/admin/login';

  const operator = await verifySession(request.cookies.get(SESSION_COOKIE)?.value, process.env.ADMIN_SESSION_SECRET);

  // The preview branch does not exist unless the deployment has declared
  // itself a preview AND the demo is switched on. On production this is
  // `false`, no key is derived and no second cookie is ever looked at.
  const previewOn = isPreviewDemoEnabled();
  const preview = previewOn
    ? await verifySession(
        request.cookies.get(PREVIEW_SESSION_COOKIE)?.value,
        await previewSessionSecret(),
        new Date(),
        PREVIEW_AUDIENCE
      )
    : null;

  // On a preview-demo deployment ONLY the demo cookie counts. The protected
  // layout resolves nothing but the demo session there, so honouring a stray
  // operator cookie here would bounce the request between the layout's
  // redirect to login and this redirect away from it, forever.
  const authenticated = previewOn ? preview?.ok === true : operator.ok;

  if (isLogin) {
    // A signed-in operator — or demo viewer — asking for the login page is
    // sent on their way.
    if (authenticated) return harden(NextResponse.redirect(new URL('/admin', request.url)));
    return harden(NextResponse.next());
  }

  if (!authenticated) {
    const login = new URL('/admin/login', request.url);
    login.searchParams.set('next', `${pathname}${search}`);
    // On a preview-demo deployment the operator secret is legitimately
    // absent, so its `unconfigured` verdict says nothing; the demo's own
    // verdict is the one worth reporting there.
    const reported = previewOn ? preview : operator;
    if (reported && !reported.ok) {
      if (reported.reason === 'expired') login.searchParams.set('reason', 'expired');
      if (reported.reason === 'unconfigured') login.searchParams.set('reason', 'unconfigured');
    }
    const response = NextResponse.redirect(login);
    // A stale or forged cookie is removed rather than carried around.
    const dead = { path: '/admin', maxAge: 0, httpOnly: true, sameSite: 'lax' as const };
    if (request.cookies.has(SESSION_COOKIE)) response.cookies.set(SESSION_COOKIE, '', dead);
    if (request.cookies.has(PREVIEW_SESSION_COOKIE)) response.cookies.set(PREVIEW_SESSION_COOKIE, '', dead);
    return harden(response);
  }

  return harden(NextResponse.next());
}

export const config = {
  matcher: ['/admin', '/admin/:path*'],
};
