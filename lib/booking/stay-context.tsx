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
import { useSearchParams } from 'next/navigation';
import { clampGuests, MAX_GUESTS, MIN_GUESTS, toIsoDate, type StayQuery } from '@/lib/booking/availability';

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

/**
 * A party size out of the URL. Anything outside the bookable range is dropped
 * rather than clamped: `?guests=9` in a shared link is not a request for four,
 * it is a link to something this site does not offer, and silently answering it
 * with a different number would be worse than ignoring it.
 */
function parseGuests(raw: string | null): number | undefined {
  if (!raw) return undefined;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < MIN_GUESTS || n > MAX_GUESTS) return undefined;
  return Math.floor(n);
}

export function StayProvider({ children }: { children: ReactNode }) {
  const params = useSearchParams();
  const [stay, setStayState] = useState<StayQuery>({});

  /**
   * Adopt values from the URL. Runs on mount and whenever the query changes, so
   * arriving at /apartments?arrival=… from the hero bar fills the context, and
   * so does pasting that link cold.
   */
  useEffect(() => {
    if (!params) return;
    const fromUrl: StayQuery = {
      arrival: toIsoDate(params.get(STAY_PARAMS.arrival)),
      departure: toIsoDate(params.get(STAY_PARAMS.departure)),
      guests: parseGuests(params.get(STAY_PARAMS.guests)),
    };
    if (fromUrl.arrival || fromUrl.departure || fromUrl.guests) {
      setStayState((current) => ({ ...current, ...fromUrl }));
    }
  }, [params]);

  const setStay = useCallback((next: StayQuery) => {
    // The last gate before the value reaches every surface downstream.
    setStayState((current) => ({ ...current, ...next, ...('guests' in next ? { guests: clampGuests(next.guests) } : {}) }));
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
