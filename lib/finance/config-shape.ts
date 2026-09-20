/**
 * The finance configuration as a SAFE snapshot: booleans, enums and short
 * labels. Never a tax number, never a key. The server reads the real values
 * in `lib/finance/config.ts`; screens and pure code see only this shape.
 */

import type { TaxCalendarPolicy } from '@/lib/finance/tax/calendar';

export interface FinanceConfigSnapshot {
  issuerLegalName: string | null;
  issuerAddress: string | null;
  /** Whether a Steuernummer or USt-IdNr is configured, and which. Never the value. */
  issuerTaxIdConfigured: boolean;
  issuerTaxIdKind: 'steuernummer' | 'ust_idnr' | null;
  issuerTaxIdMasked: string | null;
  invoiceSeries: string | null;
  smallBusinessScheme: boolean | null;
  accommodationTaxCode: string | null;
  calendar: TaxCalendarPolicy;
  localLevyEnabled: boolean;
  fiscalYearStartMonth: number;
  reservePolicy: string;
  defaultSharedAllocation: string;
  /** Storage for documents: configured (private bucket) or not. */
  documentStorageConfigured: boolean;
  /** E-invoice generation gate. False until the validator is wired to the official schematron. */
  eInvoiceGenerationEnabled: boolean;
  /** DATEV export gate. False until the format is validated against the current specification. */
  datevExportEnabled: boolean;
}

export const EMPTY_FINANCE_CONFIG: FinanceConfigSnapshot = {
  issuerLegalName: null, issuerAddress: null, issuerTaxIdConfigured: false, issuerTaxIdKind: null, issuerTaxIdMasked: null, invoiceSeries: null,
  smallBusinessScheme: null, accommodationTaxCode: null,
  calendar: { vatFilingFrequency: 'quarterly', dauerfristverlaengerung: false, vatAnnualReturnMonth: 7, fiscalYearStartMonth: 1 },
  localLevyEnabled: false, fiscalYearStartMonth: 1, reservePolicy: 'estimate_less_paid', defaultSharedAllocation: 'occupied_nights',
  documentStorageConfigured: false, eInvoiceGenerationEnabled: false, datevExportEnabled: false,
};
