/**
 * Documents — hashing and the retention class table (pure). The database
 * computes the retention date on registration; this table documents the
 * same rule for the UI and the docs, and `tests/finance/documents.test.ts`
 * proves they agree.
 *
 * Nothing deletes. `retain_until` is a planning date with the review flag
 * on; deletion requires a separate decision (docs/finance/retention.md).
 */

export type RetentionClass = 'accounting_voucher' | 'invoice' | 'annual_accounts' | 'tax_notice' | 'contract' | 'business_letter' | 'technical_log' | 'other';

export const RETENTION_CLASSES: Record<RetentionClass, { years: number | null; basis: string; label: string }> = {
  invoice: { years: 8, basis: '§ 14b Abs. 1 UStG; § 147 Abs. 1 Nr. 4, Abs. 3 AO (8 years from the end of the calendar year, since 2025)', label: 'Invoice' },
  accounting_voucher: { years: 8, basis: '§ 147 Abs. 1 Nr. 4, Abs. 3 AO (8 years)', label: 'Accounting voucher' },
  annual_accounts: { years: 10, basis: '§ 147 Abs. 1 Nr. 1, Abs. 3 AO; § 257 Abs. 1 Nr. 1, Abs. 4 HGB (10 years)', label: 'Annual accounts / books' },
  tax_notice: { years: 10, basis: 'kept with the books (§ 147 Abs. 1 Nr. 1 AO by analogy) — adviser to confirm', label: 'Tax notice' },
  contract: { years: 10, basis: 'life of the contract plus limitation; 10 years planning — adviser to confirm', label: 'Contract' },
  business_letter: { years: 6, basis: '§ 147 Abs. 1 Nr. 2, 3, Abs. 3 AO (6 years)', label: 'Business letter' },
  technical_log: { years: null, basis: 'operational; not a tax record', label: 'Technical log' },
  other: { years: null, basis: 'unclassified — adviser to confirm', label: 'Other' },
};

export function retentionClassFor(documentType: string): RetentionClass {
  switch (documentType) {
    case 'supplier_invoice': case 'guest_invoice': case 'credit_note': case 'booking_com_commission_invoice': case 'e_invoice': return 'invoice';
    case 'booking_com_payout_statement': case 'paypal_statement': case 'bank_statement': case 'receipt': return 'accounting_voucher';
    case 'tax_notice': return 'tax_notice';
    case 'contract': return 'contract';
    default: return 'other';
  }
}

/** § 147 Abs. 4 AO: the period runs from the end of the calendar year of the document. */
export function retainUntil(documentDate: string, cls: RetentionClass): string | null {
  const years = RETENTION_CLASSES[cls].years;
  if (years === null) return null;
  const year = Number(documentDate.slice(0, 4));
  return `${year + years}-12-31`;
}

export async function sha256Hex(bytes: ArrayBuffer | Uint8Array): Promise<string> {
  const buf = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const digest = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Accepted upload types. Structured e-invoice XML is accepted and kept as the original. */
export const ACCEPTED_MIME = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'application/xml', 'text/xml', 'text/csv', 'text/plain']);
export const MAX_DOCUMENT_BYTES = 15 * 1024 * 1024;

/** Detect a structured e-invoice by content sniffing (no parser claims validity). */
export function detectStructuredFormat(mime: string, head: string): 'none' | 'xrechnung' | 'zugferd' | 'other_xml' | 'pdf_only' {
  if (mime === 'application/pdf') return head.includes('factur-x.xml') || head.includes('zugferd-invoice.xml') ? 'zugferd' : 'pdf_only';
  if (mime === 'application/xml' || mime === 'text/xml') {
    if (/urn:cen\.eu:en16931:2017/.test(head) && /xrechnung/i.test(head)) return 'xrechnung';
    if (/CrossIndustryInvoice/.test(head)) return 'zugferd';
    return 'other_xml';
  }
  return 'none';
}
