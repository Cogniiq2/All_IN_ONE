'use client';

import { useState, useTransition } from 'react';
import { signInAction } from '@/lib/admin/actions';

/**
 * The sign-in form. It posts to a server action; the session is set by the
 * server, and the browser never sees a Supabase client or a key. The
 * server's verdict is shown inline; on success the action redirects.
 */
export function LoginForm({ next, configured, fixture }: { next: string; configured: boolean; fixture: boolean }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const submit = (formData: FormData) => {
    setError(null);
    start(async () => {
      const result = await signInAction(formData);
      if (result?.error) setError(result.error);
    });
  };

  return (
    <form action={submit} className="grid gap-4" aria-describedby={error ? 'login-error' : undefined}>
      <input type="hidden" name="next" value={next} />
      <div className="bc-field">
        <label htmlFor="email">Email</label>
        <input id="email" name="email" type="email" autoComplete="username" required className="bc-input" disabled={!configured || pending} spellCheck={false} />
      </div>
      <div className="bc-field">
        <label htmlFor="password">Password</label>
        <input id="password" name="password" type="password" autoComplete="current-password" required className="bc-input" disabled={!configured || pending} />
      </div>

      {!configured && (
        <div className="bc-notice" data-tone="critical" role="status">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="9" />
            <path d="M12 8v4M12 16h.01" />
          </svg>
          <div>
            <strong>Sign-in is disabled.</strong> The session secret or the identity service is missing on this deployment. See <code className="bc-mono">docs/admin-control.md</code>.
          </div>
        </div>
      )}

      {fixture && configured && (
        <div className="bc-notice" data-tone="caution" role="status">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
          </svg>
          <div>
            <strong>Development fixtures.</strong> Nothing behind this sign-in is real.
          </div>
        </div>
      )}

      {error && (
        <div id="login-error" className="bc-notice" data-tone="critical" role="alert" aria-live="assertive">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="9" />
            <path d="M12 8v4M12 16h.01" />
          </svg>
          <div>{error}</div>
        </div>
      )}

      <button type="submit" className="bc-btn primary" style={{ width: '100%', height: 42 }} disabled={!configured || pending} data-pending={pending ? 'true' : undefined}>
        Sign in
      </button>
    </form>
  );
}
