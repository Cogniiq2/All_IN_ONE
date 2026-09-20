import 'server-only';

/**
 * ══════════════════════════════════════════════════════════════════════════
 * FINANCE CONFIGURATION — the only place finance secrets and identifiers
 * are read. `server-only`; nothing read at module scope.
 *
 * Identifiers (tax number, USt-IdNr) are business facts, not secrets, but
 * they are still never rendered in full: screens get `issuerTaxIdMasked`
 * and a boolean. The invoice issuer values reuse the INVOICE_* variables
 * the invoicing foundation already documented (docs/invoicing.md).
 *
 *   INVOICE_ISSUER_LEGAL_NAME, INVOICE_ISSUER_ADDRESS, INVOICE_ISSUER_TAX_ID,
 *   INVOICE_SERIES, INVOICE_SMALL_BUSINESS
 *   FINANCE_ACCOMMODATION_TAX_CODE     default DE_ACCOMMODATION_REDUCED
 *   FINANCE_DOCUMENT_BUCKET            private storage bucket for originals
 *   FINANCE_EINVOICE_GENERATION_ENABLED, FINANCE_EINVOICE_VALIDATOR_URL
 *   FINANCE_DATEV_EXPORT_ENABLED, FINANCE_DATEV_SKR (SKR03|SKR04)
 *   FINANCE_INGESTION_SECRET           for the scheduled ingestion route
 *
 * Policy that changes over time (filing frequency, Dauerfristverlängerung,
 * Hebesatz, reserve policy) lives in the database (`bolagio_finance_policy`,
 * `bolagio_finance_tax_rates`), read by the queries — not here.
 * ══════════════════════════════════════════════════════════════════════════
 */

import { EMPTY_FINANCE_CONFIG, type FinanceConfigSnapshot } from '@/lib/finance/config-shape';
import type { PolicyRow } from '@/lib/finance/rows';
import type { TaxCalendarPolicy } from '@/lib/finance/tax/calendar';

function env(name: string): string | undefined {
  const value = process.env[name];
  return value && value.trim() !== '' ? value.trim() : undefined;
}

function maskTaxId(value: string): string {
  const compact = value.replace(/\s/g, '');
  if (compact.length <= 4) return '••••';
  return `${compact.slice(0, 2)}••••${compact.slice(-3)}`;
}

/** The raw issuer values, for the issue command only. Never exported to a screen. */
export function issuerIdentity(): { legalName: string | undefined; address: string | undefined; taxId: string | undefined; series: string | undefined } {
  return { legalName: env('INVOICE_ISSUER_LEGAL_NAME'), address: env('INVOICE_ISSUER_ADDRESS'), taxId: env('INVOICE_ISSUER_TAX_ID'), series: env('INVOICE_SERIES') };
}

export function documentBucket(): string | undefined {
  return env('FINANCE_DOCUMENT_BUCKET');
}

export function financeIngestionSecret(): string | undefined {
  return env('FINANCE_INGESTION_SECRET');
}

export function datevSkr(): 'SKR03' | 'SKR04' | null {
  const v = env('FINANCE_DATEV_SKR');
  return v === 'SKR03' || v === 'SKR04' ? v : null;
}

/** Policy rows → calendar policy, effective on a date. */
export function calendarPolicyFrom(policy: readonly PolicyRow[], on: string): TaxCalendarPolicy {
  const get = (key: string): string | null => {
    const rows = policy.filter((p) => p.key === key && p.effective_from <= on && (p.effective_to === null || p.effective_to >= on)).sort((a, b) => b.effective_from.localeCompare(a.effective_from));
    return rows[0]?.value ?? null;
  };
  const freq = get('vat_filing_frequency');
  return {
    vatFilingFrequency: freq === 'monthly' || freq === 'annual_only' ? freq : 'quarterly',
    dauerfristverlaengerung: get('dauerfristverlaengerung') === 'true',
    vatAnnualReturnMonth: Number(get('vat_annual_return_month') ?? 7) || 7,
    fiscalYearStartMonth: Number(get('fiscal_year_start_month') ?? 1) || 1,
  };
}

export function policyValue(policy: readonly PolicyRow[], key: string, on: string): string | null {
  const rows = policy.filter((p) => p.key === key && p.effective_from <= on && (p.effective_to === null || p.effective_to >= on)).sort((a, b) => b.effective_from.localeCompare(a.effective_from));
  return rows[0]?.value ?? null;
}

/** The safe snapshot a screen may receive. */
export function financeConfig(policy: readonly PolicyRow[] = [], on: string = new Date().toISOString().slice(0, 10)): FinanceConfigSnapshot {
  const issuer = issuerIdentity();
  const taxId = issuer.taxId;
  const small = env('INVOICE_SMALL_BUSINESS');
  const calendar = calendarPolicyFrom(policy, on);
  return {
    ...EMPTY_FINANCE_CONFIG,
    issuerLegalName: issuer.legalName ?? null,
    issuerAddress: issuer.address ?? null,
    issuerTaxIdConfigured: Boolean(taxId),
    issuerTaxIdKind: taxId ? (/^DE\d{9}$/i.test(taxId.replace(/\s/g, '')) ? 'ust_idnr' : 'steuernummer') : null,
    issuerTaxIdMasked: taxId ? maskTaxId(taxId) : null,
    invoiceSeries: issuer.series ?? null,
    smallBusinessScheme: small === 'true' ? true : small === 'false' ? false : policyValue(policy, 'small_business_scheme', on) === 'false' ? false : null,
    accommodationTaxCode: env('FINANCE_ACCOMMODATION_TAX_CODE') ?? 'DE_ACCOMMODATION_REDUCED',
    calendar,
    localLevyEnabled: policyValue(policy, 'local_levy_enabled', on) === 'true',
    fiscalYearStartMonth: calendar.fiscalYearStartMonth,
    reservePolicy: policyValue(policy, 'tax_reserve_policy', on) ?? 'estimate_less_paid',
    defaultSharedAllocation: policyValue(policy, 'default_shared_cost_allocation', on) ?? 'occupied_nights',
    documentStorageConfigured: Boolean(documentBucket()),
    eInvoiceGenerationEnabled: env('FINANCE_EINVOICE_GENERATION_ENABLED') === 'true' && Boolean(env('FINANCE_EINVOICE_VALIDATOR_URL')),
    datevExportEnabled: env('FINANCE_DATEV_EXPORT_ENABLED') === 'true' && datevSkr() !== null,
  };
}
