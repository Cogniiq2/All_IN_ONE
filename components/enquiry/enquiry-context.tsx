'use client';

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

/**
 * The two enquiries the site can open. They are separate conversations with
 * separate audiences, so they are separate kinds here rather than one form
 * with a mode flag bolted on:
 *
 *   'short-term'  a guest asking about nights in an apartment
 *   'long-term'   a prospective tenant asking about a rental agreement
 *
 * Nothing derives the kind from the unit — a caller states it. A unit that
 * supports both modes is reached through whichever journey the visitor is in.
 */
export type EnquiryKind = 'short-term' | 'long-term';

/**
 * Context carried into the dialog so a visitor never types the same thing
 * twice. `unitSlug` is the unit they were looking at; the stay fields come
 * from the availability panel.
 */
export interface EnquiryContextData {
  kind?: EnquiryKind;
  unitSlug?: string;
  /** Short-term only. ISO `YYYY-MM-DD`. */
  arrival?: string;
  departure?: string;
  guests?: number;
}

interface EnquiryState {
  open: boolean;
  kind: EnquiryKind;
  data: EnquiryContextData;
  /** Opens the enquiry dialog, optionally pre-filling what is already known. */
  openEnquiry: (data?: EnquiryContextData) => void;
  closeEnquiry: () => void;
}

const EnquiryContext = createContext<EnquiryState | null>(null);

export function EnquiryStateProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<EnquiryContextData>({});

  const openEnquiry = useCallback((next: EnquiryContextData = {}) => {
    setData(next);
    setOpen(true);
  }, []);

  const closeEnquiry = useCallback(() => setOpen(false), []);

  const value = useMemo(
    () => ({
      open,
      // Short-term accommodation is the default journey; the rental side always
      // states its kind explicitly.
      kind: data.kind ?? ('short-term' as EnquiryKind),
      data,
      openEnquiry,
      closeEnquiry,
    }),
    [open, data, openEnquiry, closeEnquiry]
  );

  return <EnquiryContext.Provider value={value}>{children}</EnquiryContext.Provider>;
}

export function useEnquiry() {
  const ctx = useContext(EnquiryContext);
  if (!ctx) throw new Error('useEnquiry must be used within EnquiryStateProvider');
  return ctx;
}
