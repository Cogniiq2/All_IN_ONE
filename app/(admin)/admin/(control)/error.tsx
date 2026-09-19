'use client';

import { useEffect } from 'react';

/**
 * The calm failure. A thrown render error lands here instead of a blank
 * page; the message names nothing internal, and the one control is a retry.
 */
export default function ControlError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // eslint-disable-next-line no-console -- the only diagnostic for a client-side render failure.
    console.error(JSON.stringify({ scope: 'admin', event: 'render.error', digest: error.digest ?? null }));
  }, [error]);

  return (
    <div className="bc-empty" role="alert">
      <p className="bc-label">Something did not load</p>
      <p className="bc-display" style={{ marginTop: 10 }}>
        This screen could not be rendered.
      </p>
      <p>The data behind it is unchanged. Try again; if it persists, the System page shows which subsystem is unavailable.</p>
      <div className="mt-6 flex justify-center gap-2">
        <button type="button" className="bc-btn primary" onClick={reset}>
          Try again
        </button>
        <a href="/admin/system" className="bc-btn">
          System
        </a>
      </div>
    </div>
  );
}
