import type { Metadata } from 'next';
import { adminPosture } from '@/lib/admin/config';
import { LoginForm } from '@/components/admin/auth/login-form';

export const metadata: Metadata = { title: 'Sign in' };

const REASON_TEXT: Record<string, string> = {
  expired: 'Your session has ended. Sign in to continue.',
  unconfigured: 'BoLaGio Control is not configured on this deployment.',
};

/**
 * The sign-in screen.
 *
 * Nothing on it is protected data, and nothing on it is a secret: the form
 * posts to a server action, the session is set by the server, and the browser
 * never sees a Supabase client or a key. If the deployment lacks the session
 * secret or the identity service, the form says so and refuses instead of
 * pretending.
 */
export default function LoginPage({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  const posture = adminPosture();
  const configured = posture.sessionSecretConfigured && (posture.mode === 'fixture' || posture.supabaseAuthConfigured);
  const nextRaw = typeof searchParams.next === 'string' ? searchParams.next : '';
  const next = nextRaw.startsWith('/admin') && !nextRaw.startsWith('//') ? nextRaw : '/admin';
  const reason = typeof searchParams.reason === 'string' ? REASON_TEXT[searchParams.reason] ?? null : null;

  return (
    <main className="bc-login">
      <aside className="bc-login-side" aria-hidden="true">
        <div>
          <div className="bc-brand-word">
            B<span>o</span>L<span>a</span>G<span>io</span>
          </div>
          <div className="bc-brand-control">Control</div>
          <div className="bc-brand-sub">Residence Operations</div>
        </div>
        <div className="hidden md:block">
          <p className="bc-display" style={{ fontSize: 'clamp(28px, 3.2vw, 40px)', color: 'hsl(var(--bc-nav-text))', maxWidth: '16ch' }}>
            Every reservation, exactly as it is.
          </p>
          <p style={{ marginTop: 16, maxWidth: '40ch', fontSize: 13.5, color: 'hsl(var(--bc-nav-muted))', lineHeight: 1.6 }}>
            The operating layer behind BoLaGio&rsquo;s residences in Bayreuth. Read from the booking core; nothing here guesses.
          </p>
        </div>
        <div className="bc-env" data-tone={posture.mode === 'fixture' ? 'caution' : configured ? 'positive' : 'critical'}>
          <i />
          {posture.mode === 'fixture' ? 'Development fixtures' : configured ? 'Internal · Bayreuth' : 'Not configured'}
        </div>
      </aside>

      <section className="bc-login-form">
        <div className="bc-login-card">
          <p className="bc-label">Operator sign-in</p>
          <h1 className="bc-h1" style={{ marginTop: 10 }}>
            Welcome back.
          </h1>
          <p className="bc-prose" style={{ marginTop: 10, fontSize: 13.5 }}>
            {reason ?? 'Sign in with the email address and password on your operator account.'}
          </p>
          <div style={{ marginTop: 28 }}>
            <LoginForm next={next} configured={configured} fixture={posture.mode === 'fixture'} />
          </div>
          <p className="bc-meta" style={{ marginTop: 28, fontSize: 12 }}>
            Access is restricted to listed operators of BoLaGio GmbH. Sign-ins are recorded.
          </p>
        </div>
      </section>
    </main>
  );
}
