'use client';

/**
 * The stay a visitor is planning: dates and party size.
 *
 * This is the state the hero bar collects and every later surface inherits, so
 * nobody types their dates twice:
 *
 *   hero bar → /apartments?arrival=…&departure=…&guests=…
 *            → unit detail modal → booking dialog
 *
 * Two carriers, deliberately:
 *   • React context, so an in-app navigation keeps the values with no flash;
 *   • URL query params, so the state survives a reload, a shared link, a
 *     back button and a cold entry straight onto /apartments.
 *
 * The URL is the source of truth on first paint; the context takes over after.
 * Nothing here knows anything about availability — that stays behind
 * lib/booking/availability.ts.
 *
 * ── Why this reads location directly instead of useSearchParams ──────────
 * `useSearchParams()` opts its whole Suspense subtree out of static
 * rendering. Because this provider wraps the entire layout, that made every
 * page prerender as an empty body — no heading, no navigation, nothing for a
 * crawler or a first paint until JavaScript had hydrated.
 *
 * The query string is only ever needed *after* mount (it seeds client state
 * and is never rendered during SSR), so reading `window.location.search` in an
 * effect gives identical behaviour and lets all 28 pages prerender their real
 * markup again. `popstate` keeps back/forward working; the pathname dependency
 * catches in-app navigations.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { usePathname } from 'next/navigation';
import { toIsoDate, type StayQuery } from '@/lib/booking/availability';

export const STAY_PARAMS = {
  arrival: 'arrival',
  departure: 'departure',
  guests: 'guests',
} as const;

interface StayState {
  stay: StayQuery;
  setStay: (next: StayQuery) => void;
  /** Serialises the stay for a link, omitting anything unset. */
  toQueryString: (stay?: StayQuery) => string;
  /** True once the visitor has actually chosen something. */
  hasStay: boolean;
}

const StayContext = createContext<StayState | null>(null);

function parseGuests(raw: string | null): number | undefined {
  if (!raw) return undefined;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 1 && n <= 12 ? Math.floor(n) : undefined;
}

export function StayProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [stay, setStayState] = useState<StayQuery>({});

  /**
   * Adopt values from the URL: on mount, on every in-app navigation, and on
   * back/forward. Arriving at /apartments?arrival=… from the hero bar fills
   * the context, and so does pasting that link cold.
   */
  useEffect(() => {
    const adopt = () => {
      const params = new URLSearchParams(window.location.search);
      const fromUrl: StayQuery = {
        arrival: toIsoDate(params.get(STAY_PARAMS.arrival)),
        departure: toIsoDate(params.get(STAY_PARAMS.departure)),
        guests: parseGuests(params.get(STAY_PARAMS.guests)),
      };
      if (fromUrl.arrival || fromUrl.departure || fromUrl.guests) {
        setStayState((current) => ({ ...current, ...fromUrl }));
      }
    };

    adopt();
    window.addEventListener('popstate', adopt);
    return () => window.removeEventListener('popstate', adopt);
  }, [pathname]);

  const setStay = useCallback((next: StayQuery) => {
    setStayState((current) => ({ ...current, ...next }));
  }, []);

  const toQueryString = useCallback(
    (override?: StayQuery) => {
      const source = override ?? stay;
      const search = new URLSearchParams();
      if (source.arrival) search.set(STAY_PARAMS.arrival, source.arrival);
      if (source.departure) search.set(STAY_PARAMS.departure, source.departure);
      if (source.guests) search.set(STAY_PARAMS.guests, String(source.guests));
      const qs = search.toString();
      return qs ? `?${qs}` : '';
    },
    [stay]
  );

  const value = useMemo(
    () => ({
      stay,
      setStay,
      toQueryString,
      hasStay: Boolean(stay.arrival || stay.departure || stay.guests),
    }),
    [stay, setStay, toQueryString]
  );

  return <StayContext.Provider value={value}>{children}</StayContext.Provider>;
}

export function useStay() {
  const ctx = useContext(StayContext);
  if (!ctx) throw new Error('useStay must be used within StayProvider');
  return ctx;
}
