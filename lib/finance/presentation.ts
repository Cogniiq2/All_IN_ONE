/**
 * Labels, tones and glyphs for finance states. Describes the closed
 * vocabularies of the migration; never redefines them. Unknown values are
 * neutral "Unknown", never healthy. Import-safe from client components.
 */

export interface StatePresentation { label: string; tone: 'positive' | 'caution' | 'critical' | 'progress' | 'neutral' | 'muted'; glyph: 'check' | 'clock' | 'lock' | 'alert' | 'dash' | 'question' | 'dot' | 'ring' | 'arrow'; summary: string }

const UNKNOWN: StatePresentation = { label: 'Unknown', tone: 'neutral', glyph: 'question', summary: 'A value this interface does not know.' };

const TABLES: Record<string, Record<string, StatePresentation>> = {
  review: {
    auto_verified: { label: 'Auto-verified', tone: 'positive', glyph: 'check', summary: 'Every rule input matched; verified without a person.' },
    suggested: { label: 'Suggested', tone: 'caution', glyph: 'ring', summary: 'A rule proposed the classification; not verified.' },
    needs_review: { label: 'Needs review', tone: 'caution', glyph: 'alert', summary: 'A person must classify this.' },
    reviewed: { label: 'Reviewed', tone: 'positive', glyph: 'check', summary: 'Classified by an operator.' },
    accountant_locked: { label: 'Accountant locked', tone: 'progress', glyph: 'lock', summary: 'Locked by the accountant path; automation will not touch it.' },
  },
  document: {
    complete: { label: 'Document', tone: 'positive', glyph: 'check', summary: 'Evidence linked.' },
    missing: { label: 'Missing document', tone: 'critical', glyph: 'alert', summary: 'No invoice or receipt linked.' },
    pending: { label: 'Document pending', tone: 'caution', glyph: 'clock', summary: 'Expected (e.g. the guest invoice) but not yet produced.' },
    not_required: { label: 'No document needed', tone: 'muted', glyph: 'dash', summary: 'Internal fact; no external evidence expected.' },
  },
  payment: {
    unpaid: { label: 'Unpaid', tone: 'caution', glyph: 'clock', summary: 'No payment linked.' },
    partially_paid: { label: 'Partially paid', tone: 'caution', glyph: 'ring', summary: 'Part of the amount linked.' },
    paid: { label: 'Paid', tone: 'positive', glyph: 'check', summary: 'Fully paid.' },
    not_applicable: { label: 'No payment', tone: 'muted', glyph: 'dash', summary: 'No cash movement expected.' },
  },
  reconciliation: {
    unmatched: { label: 'Unmatched', tone: 'caution', glyph: 'ring', summary: 'No cash fact linked yet.' },
    partially_matched: { label: 'Partially matched', tone: 'caution', glyph: 'ring', summary: 'Part of the amount matched.' },
    matched: { label: 'Reconciled', tone: 'positive', glyph: 'check', summary: 'Economic fact and cash fact agree.' },
    mismatch: { label: 'Mismatch', tone: 'critical', glyph: 'alert', summary: 'Linked, but the amounts disagree.' },
    needs_review: { label: 'Match proposed', tone: 'caution', glyph: 'question', summary: 'A medium-confidence match awaits confirmation.' },
    not_applicable: { label: 'No reconciliation', tone: 'muted', glyph: 'dash', summary: 'Nothing to match.' },
    ignored: { label: 'Ignored', tone: 'muted', glyph: 'dash', summary: 'Deliberately excluded (e.g. an internal transfer).' },
  },
  txstatus: {
    posted: { label: 'Posted', tone: 'positive', glyph: 'check', summary: 'A live fact.' },
    reversed: { label: 'Reversed', tone: 'neutral', glyph: 'arrow', summary: 'Corrected by a reversal; kept for the trail.' },
    reversal: { label: 'Reversal', tone: 'neutral', glyph: 'arrow', summary: 'The correcting entry.' },
  },
  period: {
    open: { label: 'Open', tone: 'neutral', glyph: 'dot', summary: 'Facts may be posted.' },
    review: { label: 'Ready for review', tone: 'progress', glyph: 'clock', summary: 'Handed to the adviser.' },
    accountant_reviewed: { label: 'Accountant reviewed', tone: 'positive', glyph: 'check', summary: 'Reviewed; not yet locked.' },
    locked: { label: 'Locked', tone: 'progress', glyph: 'lock', summary: 'Nothing changes; corrections go to the open period.' },
  },
  taxperiod: {
    open: { label: 'Open', tone: 'neutral', glyph: 'dot', summary: 'No figure yet.' },
    estimated: { label: 'System estimate', tone: 'caution', glyph: 'ring', summary: 'Computed by the system; not reviewed.' },
    reviewed: { label: 'Accountant reviewed', tone: 'progress', glyph: 'check', summary: 'The adviser reviewed the figure.' },
    filed: { label: 'Filed', tone: 'positive', glyph: 'check', summary: 'Submitted to the tax office.' },
    assessed: { label: 'Assessed', tone: 'positive', glyph: 'lock', summary: 'Assessed by notice.' },
    paid: { label: 'Paid', tone: 'positive', glyph: 'check', summary: 'Settled.' },
    closed: { label: 'Closed', tone: 'muted', glyph: 'lock', summary: 'Done.' },
  },
  stage: {
    system_estimate: { label: 'System estimate', tone: 'caution', glyph: 'ring', summary: 'Computed; not reviewed.' },
    accountant_reviewed: { label: 'Accountant reviewed', tone: 'progress', glyph: 'check', summary: 'Reviewed.' },
    filed: { label: 'Filed', tone: 'positive', glyph: 'check', summary: 'Filed.' },
    assessed: { label: 'Assessed', tone: 'positive', glyph: 'lock', summary: 'Assessed.' },
    paid: { label: 'Paid', tone: 'positive', glyph: 'check', summary: 'Paid.' },
  },
  batch: {
    staged: { label: 'Staged', tone: 'neutral', glyph: 'clock', summary: 'Parsed; awaiting preview.' },
    validated: { label: 'Validated', tone: 'progress', glyph: 'check', summary: 'Previewed; ready to import.' },
    imported: { label: 'Imported', tone: 'positive', glyph: 'check', summary: 'Rows posted.' },
    rejected: { label: 'Rejected', tone: 'muted', glyph: 'dash', summary: 'Not this format, or rejected by a person.' },
    failed: { label: 'Failed', tone: 'critical', glyph: 'alert', summary: 'The import did not complete.' },
  },
  settlement: {
    reconciled: { label: 'Reconciled', tone: 'positive', glyph: 'check', summary: 'Matched to exactly one local reservation, and the statement gross equals its gross.' },
    discrepancy: { label: 'Gross differs', tone: 'critical', glyph: 'alert', summary: 'Matched, but the statement gross differs from the local reservation gross. Both are kept; a person decides why.' },
    no_local_gross: { label: 'No local amount', tone: 'caution', glyph: 'question', summary: 'Matched, but Beds24 supplied no amount for the reservation to compare against.' },
    unmatched: { label: 'Unmatched', tone: 'caution', glyph: 'ring', summary: 'No local reservation carries this Booking.com number yet. Kept; re-match after the reservation history is imported.' },
    ambiguous: { label: 'Ambiguous', tone: 'critical', glyph: 'alert', summary: 'Several local reservations carry this Booking.com number. None was chosen.' },
    amendment: { label: 'Amendment', tone: 'caution', glyph: 'alert', summary: 'Booking.com changed this line since it was imported. Nothing is posted until a person accepts it.' },
  },
  payoutbank: {
    awaiting_bank: { label: 'Awaiting bank', tone: 'neutral', glyph: 'clock', summary: 'Booking.com reports this payout; no bank receipt is linked to it yet.' },
    matched: { label: 'In bank', tone: 'positive', glyph: 'check', summary: 'The bank receipt for this payout is linked.' },
    mismatch: { label: 'Bank differs', tone: 'critical', glyph: 'alert', summary: 'A bank receipt is linked but its amount differs from the payout net.' },
  },
  charge: {
    not_applicable: { label: '—', tone: 'muted', glyph: 'dash', summary: 'No charge.' },
    unpaid: { label: 'Unpaid', tone: 'caution', glyph: 'clock', summary: 'Consumed, not yet paid.' },
    paid: { label: 'Paid', tone: 'positive', glyph: 'check', summary: 'Paid.' },
    included: { label: 'Included', tone: 'muted', glyph: 'dash', summary: 'Complimentary / included in the rate.' },
    written_off: { label: 'Written off', tone: 'neutral', glyph: 'dash', summary: 'Not collectable.' },
    needs_review: { label: 'Needs review', tone: 'caution', glyph: 'alert', summary: 'Charge state undecided.' },
  },
  invoice: {
    draft: { label: 'Draft', tone: 'neutral', glyph: 'clock', summary: 'No number; may be discarded.' },
    issued: { label: 'Issued', tone: 'positive', glyph: 'lock', summary: 'Numbered and frozen.' },
    voided: { label: 'Voided', tone: 'muted', glyph: 'dash', summary: 'Voided with a reason.' },
  },
  provenance: {
    actual: { label: 'Actual', tone: 'positive', glyph: 'check', summary: 'From posted facts.' },
    imported: { label: 'Imported', tone: 'progress', glyph: 'check', summary: 'From a statement import.' },
    calculated: { label: 'Calculated', tone: 'neutral', glyph: 'dot', summary: 'Derived from posted facts.' },
    estimated: { label: 'Estimate', tone: 'caution', glyph: 'ring', summary: 'A system estimate.' },
    committed: { label: 'Committed', tone: 'progress', glyph: 'clock', summary: 'Confirmed but not yet occurred.' },
    expected: { label: 'Expected', tone: 'caution', glyph: 'clock', summary: 'Likely, not certain.' },
    projected: { label: 'Projected', tone: 'caution', glyph: 'ring', summary: 'A forward calculation.' },
    reviewed: { label: 'Reviewed', tone: 'positive', glyph: 'check', summary: 'Reviewed by the adviser.' },
    filed: { label: 'Filed', tone: 'positive', glyph: 'check', summary: 'Filed.' },
    assessed: { label: 'Assessed', tone: 'positive', glyph: 'lock', summary: 'Assessed.' },
    paid: { label: 'Paid', tone: 'positive', glyph: 'check', summary: 'Paid.' },
    needs_review: { label: 'Needs review', tone: 'caution', glyph: 'alert', summary: 'Needs a person.' },
    unknown: { label: 'Unknown', tone: 'neutral', glyph: 'question', summary: 'Provenance not established.' },
  },
};

export function present(table: keyof typeof TABLES, value: string | null | undefined): StatePresentation {
  if (!value) return UNKNOWN;
  return TABLES[table][value] ?? { ...UNKNOWN, label: value };
}

export const KIND_LABEL: Record<string, string> = {
  revenue: 'Revenue', expense: 'Expense', refund: 'Refund', credit_note: 'Credit note', commission: 'Commission', fee: 'Fee', tax_payment: 'Tax payment', adjustment: 'Adjustment', cogs: 'Cost of goods',
};

export const CHANNEL_LABEL: Record<string, string> = { booking_com: 'Booking.com', direct: 'Direct', airbnb: 'Airbnb', manual: 'Manual / corporate', other: 'Other' };

export const SOURCE_LABEL: Record<string, string> = { booking: 'Booking core', payment: 'Payment', refund: 'Refund', minibar: 'Minibar', cleaning: 'Cleaning', import: 'Import', manual: 'Manual', system: 'System' };

export const ALLOCATION_LABEL: Record<string, string> = { direct: 'Direct', manual: 'Manual', revenue_share: 'By revenue share', occupied_nights: 'By occupied nights', floor_area: 'By floor area', equal_units: 'Equal per unit', custom: 'Custom', unallocated: 'Not allocated' };

export const INPUT_VAT_LABEL: Record<string, string> = { deductible: 'Deductible', partially_deductible: 'Partially deductible', not_deductible: 'Not deductible', reverse_charge: 'Reverse charge', review_required: 'Review required', unknown: 'Unknown', not_applicable: '—' };

export const DOCUMENT_TYPE_LABEL: Record<string, string> = {
  supplier_invoice: 'Supplier invoice', guest_invoice: 'Guest invoice', credit_note: 'Credit note', booking_com_commission_invoice: 'Booking.com commission invoice', booking_com_payout_statement: 'Booking.com payout statement',
  paypal_statement: 'PayPal statement', bank_statement: 'Bank statement', tax_notice: 'Tax notice', contract: 'Contract', receipt: 'Receipt', e_invoice: 'E-invoice', other: 'Other',
};

export const TAX_TYPE_LABEL: Record<string, string> = { vat: 'VAT (Umsatzsteuer)', kst: 'Corporation tax (KSt)', soli: 'Solidarity surcharge', gewst: 'Trade tax (GewSt)', other: 'Other' };
