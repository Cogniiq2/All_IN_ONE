'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState, useTransition } from 'react';
import { formatClock } from '@/lib/admin/format';

/**
 * Freshness, in one place per page.
 *
 * Shows when the screen's data was loaded and offers one refresh. With
 * `every`, it re-fetches the server components on that interval — only while
 * the tab is visible, and never more than one timer per page. Components do
 * not poll on their own, and nothing here touches an external API: a refresh
 * is a server render from BoLaGio's own database.
 */
export function RefreshControl({ loadedAt, every }: { loadedAt: string; every?: number }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [stale, setStale] = useState(false);

  useEffect(() => {
    setStale(false);
    if (!every) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const schedule = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        if (document.visibilityState === 'visible') {
          startTransition(() => router.refresh());
        } else {
          setStale(true);
        }
      }, every * 1000);
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible' && stale) {
        startTransition(() => router.refresh());
      }
    };
    schedule();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      if (timer) clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-armed on every fresh load, keyed by loadedAt.
  }, [loadedAt, every]);

  return (
    <div className="flex items-center gap-2 bc-meta" aria-live="polite">
      <span className="bc-num">{pending ? 'Refreshing…' : `Updated ${formatClock(loadedAt)}`}</span>
      <button
        type="button"
        className="bc-btn quiet sm"
        onClick={() => startTransition(() => router.refresh())}
        disabled={pending}
        aria-label="Refresh"
        title="Refresh"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={pending ? { animation: 'bc-spin var(--dur-slower) linear infinite' } : undefined}>
          <path d="M20 12a8 8 0 1 1-2.3-5.6M20 4v5h-5" />
        </svg>
      </button>
    </div>
  );
}
