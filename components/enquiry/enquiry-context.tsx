'use client';

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

interface EnquiryState {
  open: boolean;
  apartmentSlug?: string;
  /** Opens the enquiry dialog, optionally pre-selecting an apartment. */
  openEnquiry: (apartmentSlug?: string) => void;
  closeEnquiry: () => void;
}

const EnquiryContext = createContext<EnquiryState | null>(null);

export function EnquiryStateProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [apartmentSlug, setApartmentSlug] = useState<string | undefined>(undefined);

  const openEnquiry = useCallback((slug?: string) => {
    setApartmentSlug(slug);
    setOpen(true);
  }, []);

  const closeEnquiry = useCallback(() => setOpen(false), []);

  const value = useMemo(
    () => ({ open, apartmentSlug, openEnquiry, closeEnquiry }),
    [open, apartmentSlug, openEnquiry, closeEnquiry]
  );

  return <EnquiryContext.Provider value={value}>{children}</EnquiryContext.Provider>;
}

export function useEnquiry() {
  const ctx = useContext(EnquiryContext);
  if (!ctx) throw new Error('useEnquiry must be used within EnquiryStateProvider');
  return ctx;
}
