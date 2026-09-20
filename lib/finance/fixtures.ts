/**
 * ══════════════════════════════════════════════════════════════════════════
 * FINANCE FIXTURES — a synthetic ledger for development and the preview demo.
 *
 * Reached only through `financeRowSource()` in fixture/preview mode. Every
 * row is invented: example.com suppliers, placeholder guests as surname
 * initials, made-up ids. It exists so every finance screen — including
 * every exception — can be reviewed without a database.
 *
 * The dataset is built from a small script of facts, relative to today in
 * Berlin, through the same derivations the database applies (gross/net/VAT
 * split, review-required codes forced to needs_review, header totals from
 * lines), so a fixture row cannot be a shape the migration would refuse.
 *
 * Scenarios covered (docs/finance/production-readiness.md §fixtures):
 *   Booking.com stays with commission and a payout that does NOT match ·
 *   direct bookings paid through PayPal · a completed partial refund ·
 *   minibar sales (beverage 19 %, snack 7 %) with a purchase · cleaning
 *   invoices, one missing its document · a foreign SaaS invoice under
 *   reverse charge · a 19 % furniture invoice flagged as an asset candidate ·
 *   a 7 % supply · an ambiguous marketplace receipt · a tax notice · an
 *   unmatched bank receipt · a declared reserve · a filed VAT period.
 * ══════════════════════════════════════════════════════════════════════════
 */

import { splitGross, vatFromNet } from '@/lib/finance/money';
import { addDays, berlinToday, monthKey } from '@/lib/finance/periods';
import { requireTaxCode, TAX_CODES } from '@/lib/finance/tax-codes';
import { CATEGORIES } from '@/lib/finance/categories';
import { TAX_RATE_SEED } from '@/lib/finance/tax/rates';
import type {
  AccountRow, AssetRow, CashMonthlyRow, CounterpartyRow, DocumentLinkRow, DocumentRow, ExceptionCountsRow, ExportRow, FinanceRowSource, ImportBatchRow, ImportRowRow,
  InvoiceLineRow, InvoiceRow, LineRow, MinibarMovementRow, MinibarProductRow, MinibarStockRow, OverrideRow, PaymentRow, PeriodRow, PlMonthlyRow, PolicyRow, ReconciliationRow,
  ReserveRow, StayRow, TaxAdjustmentRow, TaxEstimateRow, TaxNoticeRow, TaxPaymentRow, TaxPeriodRow, TransactionQuery, TransactionRow, TurnoverCostRow, UnitMonthlyRow,
} from '@/lib/finance/rows';
import type { VatMonthlyRow } from '@/lib/finance/tax/vat';

const today = berlinToday();
const d = (offset: number) => addDays(today, offset);
const ts = (offset: number, hour = 10) => new Date(`${d(offset)}T${String(hour).padStart(2, '0')}:00:00+02:00`).toISOString();
const thisYear = Number(today.slice(0, 4));

export const FIXTURE_UNITS = [
  { id: 'u-s1', slug: 'schulstrasse-i', display_name: 'Schulstraße I', is_bookable: true },
  { id: 'u-s2', slug: 'schulstrasse-ii', display_name: 'Schulstraße II', is_bookable: true },
  { id: 'u-o1', slug: 'opernstrasse-i', display_name: 'Opernstraße I', is_bookable: false },
  { id: 'u-o2', slug: 'opernstrasse-ii', display_name: 'Opernstraße II', is_bookable: false },
  { id: 'u-o3', slug: 'opernstrasse-iii', display_name: 'Opernstraße III', is_bookable: false },
];

const CP = {
  bcom: { id: 'cp-bcom', name: 'Booking.com B.V.', kind: 'ota', country: 'NL', vat_id: 'NL805734958B01', default_category: 'ota_commission', default_tax_code: 'DE_REVERSE_CHARGE', default_input_vat: 'reverse_charge', default_allocation: 'direct', auto_verify: false, match_patterns: ['booking.com'], active: true, note: null },
  paypal: { id: 'cp-paypal', name: 'PayPal (Europe) S.à r.l. et Cie, S.C.A.', kind: 'payment_provider', country: 'LU', vat_id: null, default_category: 'payment_fees', default_tax_code: 'DE_EXEMPT', default_input_vat: 'not_deductible', default_allocation: 'direct', auto_verify: false, match_patterns: ['paypal'], active: true, note: null },
  clean: { id: 'cp-clean', name: 'Sauber & Co. Gebäudereinigung GmbH', kind: 'supplier', country: 'DE', vat_id: 'DE123456789', default_category: 'cleaning', default_tax_code: 'DE_STANDARD', default_input_vat: 'deductible', default_allocation: 'direct', auto_verify: true, match_patterns: ['sauber & co', 'sauber und co'], active: true, note: 'Turnover cleaning, invoiced monthly per unit.' },
  laundry: { id: 'cp-laundry', name: 'Wäscherei Fichtelgebirge e.K.', kind: 'supplier', country: 'DE', vat_id: 'DE987654321', default_category: 'laundry', default_tax_code: 'DE_STANDARD', default_input_vat: 'deductible', default_allocation: 'occupied_nights', auto_verify: true, match_patterns: ['fichtelgebirge'], active: true, note: null },
  saas: { id: 'cp-saas', name: 'Channelstack Software Inc.', kind: 'supplier', country: 'US', vat_id: null, default_category: 'software', default_tax_code: 'DE_REVERSE_CHARGE', default_input_vat: 'reverse_charge', default_allocation: 'unallocated', auto_verify: false, match_patterns: ['channelstack'], active: true, note: 'Third-country SaaS; § 13b.' },
  beds24: { id: 'cp-beds24', name: 'Beds24 GmbH', kind: 'supplier', country: 'DE', vat_id: 'DE246813579', default_category: 'software', default_tax_code: 'DE_STANDARD', default_input_vat: 'deductible', default_allocation: 'unallocated', auto_verify: true, match_patterns: ['beds24'], active: true, note: null },
  ikea: { id: 'cp-ikea', name: 'IKEA Deutschland GmbH & Co. KG', kind: 'supplier', country: 'DE', vat_id: 'DE811146504', default_category: 'furniture', default_tax_code: 'DE_STANDARD', default_input_vat: 'deductible', default_allocation: 'manual', auto_verify: false, match_patterns: ['ikea'], active: true, note: 'Mixed baskets; split per unit.' },
  amazon: { id: 'cp-amazon', name: 'Amazon EU S.à r.l.', kind: 'supplier', country: 'LU', vat_id: 'LU26375245', default_category: 'guest_supplies', default_tax_code: 'DE_REVIEW_REQUIRED', default_input_vat: 'review_required', default_allocation: 'manual', auto_verify: false, match_patterns: ['amazon'], active: true, note: 'Marketplace; never auto-verified.' },
  stadtwerke: { id: 'cp-sw', name: 'Stadtwerke Bayreuth Energie und Wasser GmbH', kind: 'supplier', country: 'DE', vat_id: 'DE132456789', default_category: 'electricity', default_tax_code: 'DE_STANDARD', default_input_vat: 'deductible', default_allocation: 'direct', auto_verify: true, match_patterns: ['stadtwerke bayreuth'], active: true, note: null },
  getraenke: { id: 'cp-getr', name: 'Getränke Hofmann GmbH', kind: 'supplier', country: 'DE', vat_id: 'DE135792468', default_category: 'minibar_purchases', default_tax_code: 'DE_REVIEW_REQUIRED', default_input_vat: 'review_required', default_allocation: 'unallocated', auto_verify: false, match_patterns: ['hofmann'], active: true, note: 'Mixed 7 % / 19 % invoices; split lines.' },
  stb: { id: 'cp-stb', name: 'Steuerkanzlei Beispiel PartG mbB', kind: 'supplier', country: 'DE', vat_id: 'DE111222333', default_category: 'tax_adviser', default_tax_code: 'DE_STANDARD', default_input_vat: 'deductible', default_allocation: 'unallocated', auto_verify: true, match_patterns: ['steuerkanzlei beispiel'], active: true, note: null },
  fa: { id: 'cp-fa', name: 'Finanzamt Bayreuth', kind: 'authority', country: 'DE', vat_id: null, default_category: 'taxes_non_operating', default_tax_code: 'DE_OUTSIDE_SCOPE', default_input_vat: 'not_applicable', default_allocation: 'unallocated', auto_verify: true, match_patterns: ['finanzamt'], active: true, note: null },
  bank: { id: 'cp-bank', name: 'Sparkasse Bayreuth', kind: 'bank', country: 'DE', vat_id: null, default_category: 'bank_fees', default_tax_code: 'DE_EXEMPT', default_input_vat: 'not_deductible', default_allocation: 'unallocated', auto_verify: true, match_patterns: ['sparkasse'], active: true, note: null },
} satisfies Record<string, CounterpartyRow>;

const ACCOUNTS: AccountRow[] = [
  { id: 'acc-bank', code: 'BANK', label: 'Sparkasse Bayreuth · business account', kind: 'bank', currency: 'EUR', iban_masked: 'DE•• •••• •••• •••• •••• 4471', opening_balance_cents: 2_850_000, opening_balance_on: `${thisYear}-01-01`, active: true },
  { id: 'acc-paypal', code: 'PAYPAL', label: 'PayPal business', kind: 'paypal', currency: 'EUR', iban_masked: null, opening_balance_cents: 0, opening_balance_on: `${thisYear}-01-01`, active: true },
];

/* ── Builders ─────────────────────────────────────────────────────────── */

const TX: TransactionRow[] = [];
const LINES: LineRow[] = [];
const PAYMENTS: PaymentRow[] = [];
const RECON: ReconciliationRow[] = [];
const DOCS: DocumentRow[] = [];
const DOC_LINKS: DocumentLinkRow[] = [];
const OVERRIDES: OverrideRow[] = [];
let seq = 0;
const nid = (p: string) => `${p}-${String(++seq).padStart(3, '0')}`;

interface LineSpec { category: string; taxCode: string; gross?: number; net?: number; description?: string; quantity?: number; unitId?: string | null; allocation?: string; inputVat?: string; deductibleBp?: number; assetState?: string; classification?: string; productId?: string | null }

function post(h: Partial<TransactionRow> & { kind: string; booked_on: string; description: string; source_system: string; source_reference: string }, specs: LineSpec[]): TransactionRow {
  const id = h.id ?? nid('tx');
  let net = 0, vat = 0, gross = 0;
  const isRevenue = ['revenue', 'refund', 'credit_note'].includes(h.kind);
  const lines: LineRow[] = specs.map((s, i) => {
    const code = requireTaxCode(s.taxCode);
    const amounts = s.net !== undefined ? { net: s.net, vat: code.treatment === 'standard' || code.treatment === 'reduced' ? vatFromNet(s.net, code.rateBp) : 0, gross: 0 } : splitGross(s.gross ?? 0, code.treatment === 'standard' || code.treatment === 'reduced' ? code.rateBp : 0);
    if (s.net !== undefined) amounts.gross = amounts.net + amounts.vat;
    const rc = code.reverseCharge ? vatFromNet(amounts.net, code.rateBp) : 0;
    const classification = code.reviewRequired ? 'needs_review' : s.classification ?? 'auto_verified';
    const treatment = code.reverseCharge ? 'reverse_charge' : isRevenue ? 'not_applicable' : s.inputVat ?? (code.treatment === 'exempt' || code.treatment === 'outside_scope' ? 'not_applicable' : code.reviewRequired ? 'review_required' : 'deductible');
    net += amounts.net; vat += amounts.vat; gross += amounts.gross;
    const unitId = s.unitId === undefined ? h.unit_id ?? null : s.unitId;
    return {
      id: nid('ln'), transaction_id: id, line_no: i + 1, category: s.category, description: s.description ?? null, quantity: s.quantity ?? null, tax_code: code.code, rate_bp: code.rateBp,
      net_cents: amounts.net, vat_cents: amounts.vat, gross_cents: amounts.gross, reverse_charge_vat_cents: rc, input_vat_treatment: treatment, deductible_bp: s.deductibleBp ?? (treatment === 'not_deductible' ? 0 : 10000),
      unit_id: unitId, allocation_method: s.allocation ?? (unitId ? 'direct' : 'unallocated'), allocation_note: null, cost_centre: null, asset_state: s.assetState ?? 'none', minibar_product_id: s.productId ?? null,
      classification, classified_by: classification === 'auto_verified' ? 'system' : classification === 'needs_review' ? null : 'ops@example.com', classified_at: classification === 'needs_review' ? null : ts(-1),
    };
  });
  const review = lines.some((l) => l.classification === 'needs_review') ? 'needs_review' : lines.some((l) => l.classification === 'suggested') ? 'suggested' : lines.every((l) => l.classification === 'accountant_locked') ? 'accountant_locked' : lines.every((l) => l.classification === 'auto_verified') ? 'auto_verified' : 'reviewed';
  const row: TransactionRow = {
    id, kind: h.kind, booked_on: h.booked_on, service_from: h.service_from ?? null, service_to: h.service_to ?? null, invoice_date: h.invoice_date ?? null, due_on: h.due_on ?? null, currency: 'EUR',
    net_cents: net, vat_cents: vat, gross_cents: gross, counterparty_id: h.counterparty_id ?? null, counterparty_label: h.counterparty_label ?? null, supplier_invoice_no: h.supplier_invoice_no ?? null,
    description: h.description, channel: h.channel ?? null, booking_intent_id: h.booking_intent_id ?? null, booking_reference: h.booking_reference ?? null, unit_id: h.unit_id ?? null,
    source_type: h.source_type ?? 'manual', source_system: h.source_system, source_reference: h.source_reference, import_batch_id: h.import_batch_id ?? null, status: h.status ?? 'posted',
    review_state: h.review_state ?? review, document_state: h.document_state ?? (isRevenue ? 'not_required' : 'complete'), payment_state: h.payment_state ?? 'unpaid', reconciliation_state: h.reconciliation_state ?? 'unmatched',
    correction_of: h.correction_of ?? null, reversed_by: null, reversal_reason: null, note: h.note ?? null, posted_by: h.posted_by ?? 'system', posted_at: h.posted_at ?? new Date(`${h.booked_on}T09:00:00+02:00`).toISOString(), updated_at: h.updated_at ?? new Date(`${h.booked_on}T09:00:00+02:00`).toISOString(),
  };
  TX.push(row);
  LINES.push(...lines);
  return row;
}

function pay(p: Partial<PaymentRow> & { direction: 'in' | 'out'; source: string; provider_reference: string; amount_cents: number; occurred_at: string }): PaymentRow {
  const row: PaymentRow = {
    id: p.id ?? nid('pay'), direction: p.direction, source: p.source, provider_reference: p.provider_reference, account_id: p.account_id ?? (p.source === 'paypal' ? 'acc-paypal' : 'acc-bank'), amount_cents: p.amount_cents, fee_cents: p.fee_cents ?? 0, currency: 'EUR',
    occurred_at: p.occurred_at, value_date: p.value_date ?? p.occurred_at.slice(0, 10), counterparty_label: p.counterparty_label ?? null, reference_text: p.reference_text ?? null, booking_intent_id: p.booking_intent_id ?? null, booking_reference: p.booking_reference ?? null,
    import_batch_id: p.import_batch_id ?? null, kind: p.kind ?? (p.direction === 'in' ? 'receipt' : 'disbursement'), reconciliation_state: p.reconciliation_state ?? 'unmatched', note: p.note ?? null, created_by: p.created_by ?? 'system', created_at: p.created_at ?? p.occurred_at,
  };
  PAYMENTS.push(row);
  return row;
}

function match(t: TransactionRow, p: PaymentRow, state: 'matched' | 'partially_matched' | 'mismatch' | 'needs_review', rule: string, confidence: 'exact' | 'high' | 'medium', reason: string, amount = Math.min(Math.abs(t.gross_cents), p.amount_cents)) {
  RECON.push({ id: nid('rc'), transaction_id: t.id, payment_id: p.id, document_id: null, amount_cents: amount, state, rule, rule_version: 'recon-2026-09-20.1', confidence, reason, matched_by: confidence === 'medium' ? 'system' : 'system', created_at: p.created_at });
  t.reconciliation_state = state;
  p.reconciliation_state = state;
  if (state === 'matched') t.payment_state = 'paid';
  if (state === 'partially_matched') t.payment_state = 'partially_paid';
}

function doc(dd: Partial<DocumentRow> & { document_type: string; original_filename: string; document_date: string }, link?: { type: string; id: string }): DocumentRow {
  const year = Number(dd.document_date.slice(0, 4));
  const cls = dd.retention_class ?? (['supplier_invoice', 'guest_invoice', 'credit_note', 'booking_com_commission_invoice', 'e_invoice'].includes(dd.document_type) ? 'invoice' : ['booking_com_payout_statement', 'paypal_statement', 'bank_statement', 'receipt'].includes(dd.document_type) ? 'accounting_voucher' : dd.document_type === 'tax_notice' ? 'tax_notice' : dd.document_type === 'contract' ? 'contract' : 'other');
  const years = cls === 'invoice' || cls === 'accounting_voucher' ? 8 : cls === 'other' ? null : 10;
  const row: DocumentRow = {
    id: dd.id ?? nid('doc'), document_type: dd.document_type, original_filename: dd.original_filename, mime_type: dd.mime_type ?? 'application/pdf', byte_size: dd.byte_size ?? 184_320, sha256: dd.sha256 ?? `${seq.toString(16).padStart(8, '0')}`.repeat(8), source: dd.source ?? 'upload',
    structured_format: dd.structured_format ?? 'pdf_only', structured_valid: dd.structured_valid ?? null, counterparty_id: dd.counterparty_id ?? null, tax_period_key: dd.tax_period_key ?? null, document_date: dd.document_date, review_state: dd.review_state ?? 'reviewed',
    retention_class: cls, retention_basis: cls === 'invoice' ? '§ 14b Abs. 1 UStG / § 147 Abs. 1 Nr. 4, Abs. 3 AO (8 years) — planning date' : '§ 147 AO — planning date', retain_until: years ? `${year + years}-12-31` : null, legal_hold: false, deletion_allowed: false, retention_review: true,
    supersedes_id: dd.supersedes_id ?? null, received_at: dd.received_at ?? ts(-1), uploaded_by: dd.uploaded_by ?? 'ops@example.com', note: dd.note ?? null,
  };
  DOCS.push(row);
  if (link) DOC_LINKS.push({ id: nid('dl'), document_id: row.id, target_type: link.type, target_id: link.id, linked_by: 'ops@example.com', created_at: row.received_at });
  return row;
}

/* ── Stays (mirroring the operations fixtures' references) ─────────── */

interface StaySpec { id: string; ref: string; unit: string; in: number; out: number; total: number; source: 'direct' | 'booking_com' | 'manual'; capture?: string; paidAt?: number; refund?: { id: string; cents: number; at: number }; status?: string; payment?: string; guest: string }
const STAYS: StaySpec[] = [
  { id: 'i-10', ref: 'BLG-M8X2PL', unit: 'u-s2', in: -10, out: -7, total: 43500, source: 'direct', capture: '7VV11127HH551999A', paidAt: -14, guest: 'Koch, J.' },
  { id: 'i-01', ref: 'BLG-7K2M9P', unit: 'u-s1', in: -4, out: 0, total: 58000, source: 'direct', capture: '3C679366HH908993F', paidAt: -9, guest: 'Mustermann, A.' },
  { id: 'i-02', ref: 'BLG-QX4T8W', unit: 'u-s2', in: 0, out: 3, total: 43500, source: 'direct', capture: '9AB13366HH908001Q', paidAt: -6, guest: 'Musterfrau, E.' },
  { id: 'i-07', ref: 'BLG-F2V8HN', unit: 'u-s1', in: 15, out: 19, total: 59000, source: 'direct', capture: '2NN55127HH551777V', paidAt: -3, guest: 'Becker, T.' },
  { id: 'i-08', ref: 'BLG-T6K3RB', unit: 'u-s2', in: 20, out: 27, total: 105000, source: 'direct', capture: '4SS66127HH551888W', paidAt: -5, guest: 'Hoffmann, C.' },
  { id: 'i-14', ref: 'BLG-P9W3FT', unit: 'u-s2', in: 60, out: 65, total: 76000, source: 'manual', guest: 'Braun, L.' },
  { id: 'i-20', ref: 'BLG-R7A2KC', unit: 'u-s1', in: -52, out: -48, total: 62400, source: 'direct', capture: '1AA22233HH551000B', paidAt: -60, refund: { id: '5RF00011HH551222C', cents: 15600, at: -50 }, guest: 'Neumann, S.' },
  // Booking.com stays come from statement imports, not the booking core.
  { id: 'b-1', ref: '4181523044', unit: 'u-s1', in: -40, out: -36, total: 71600, source: 'booking_com', guest: 'Rossi, M.' },
  { id: 'b-2', ref: '4181598721', unit: 'u-s2', in: -33, out: -30, total: 52200, source: 'booking_com', guest: 'Dubois, C.' },
  { id: 'b-3', ref: '4182004410', unit: 'u-s1', in: -22, out: -18, total: 68800, source: 'booking_com', guest: 'Nowak, P.' },
  { id: 'b-4', ref: '4182377652', unit: 'u-s2', in: -15, out: -11, total: 61200, source: 'booking_com', guest: 'Smith, J.' },
  { id: 'b-5', ref: '4182611980', unit: 'u-s1', in: -9, out: -5, total: 55900, source: 'booking_com', guest: 'García, L.' },
  { id: 'b-6', ref: '4182990031', unit: 'u-s2', in: 5, out: 9, total: 64400, source: 'booking_com', guest: 'Meier, K.' },
  { id: 'b-7', ref: '4183120556', unit: 'u-s1', in: 33, out: 37, total: 66000, source: 'booking_com', guest: 'Lund, A.' },
];

const STAY_ROWS: StayRow[] = STAYS.map((s) => ({
  intent_id: s.id, reference: s.ref, unit_id: s.unit, unit_slug: FIXTURE_UNITS.find((u) => u.id === s.unit)!.slug, check_in: d(s.in), check_out: d(s.out), status: s.status ?? 'confirmed', payment_status: s.payment ?? (s.source === 'direct' ? (s.refund ? 'partially_refunded' : 'paid') : 'not_created'),
  source: s.source, currency: 'EUR', quoted_total_cents: s.total, paid_amount_cents: s.capture ? s.total : null, refunded_amount_cents: s.refund?.cents ?? 0, confirmed_at: s.paidAt !== undefined ? ts(s.paidAt) : ts(s.in - 20), paid_at: s.paidAt !== undefined ? ts(s.paidAt) : null, guest_label: s.guest,
}));

const revenueByStay = new Map<string, TransactionRow>();
for (const s of STAYS) {
  const accommodation = s.total - 5000;
  const channel = s.source === 'direct' ? 'direct' : s.source === 'manual' ? 'manual' : 'booking_com';
  const t = post({
    kind: 'revenue', booked_on: d(s.out), service_from: d(s.in), service_to: d(s.out), description: `Stay ${s.ref} · ${d(s.in)} – ${d(s.out)}`, channel,
    booking_intent_id: s.id, booking_reference: s.ref, unit_id: s.unit, source_type: s.source === 'booking_com' ? 'import' : 'booking', source_system: s.source === 'booking_com' ? 'booking_com_reservations' : 'booking', source_reference: s.source === 'booking_com' ? `bcom:${s.ref}` : `booking:${s.id}`,
    document_state: s.source === 'booking_com' ? 'complete' : 'pending', posted_at: ts(Math.min(s.paidAt ?? s.in - 20, -1)),
  }, [
    { category: 'accommodation_revenue', taxCode: 'DE_ACCOMMODATION_REDUCED', gross: accommodation, description: 'Accommodation', quantity: s.out - s.in },
    { category: 'accommodation_ancillary', taxCode: 'DE_ANCILLARY_REVIEW', gross: 5000, description: 'Final cleaning fee' },
  ]);
  revenueByStay.set(s.id, t);
  if (s.source === 'direct' && s.capture && s.paidAt !== undefined) {
    const p = pay({ direction: 'in', source: 'paypal', provider_reference: s.capture, amount_cents: s.total, occurred_at: ts(s.paidAt), counterparty_label: `Guest · ${s.ref}`, reference_text: s.ref, booking_intent_id: s.id, booking_reference: s.ref, kind: 'receipt' });
    match(t, p, 'matched', 'R1 booking-key exact', 'exact', `Payment ${s.capture} belongs to booking ${s.ref} and equals the revenue gross of ${s.total} cents.`);
  }
  if (s.source === 'booking_com') {
    // Commission invoice, reverse charge, 15 % of the price — a monthly invoice in reality; one per stay here for traceability.
    const commission = Math.round(s.total * 0.15);
    const c = post({ kind: 'commission', booked_on: d(s.out), service_from: d(s.in), service_to: d(s.out), invoice_date: d(s.out + 3), due_on: d(s.out + 17), description: `Booking.com commission · ${s.ref}`, channel: 'booking_com', counterparty_id: CP.bcom.id, counterparty_label: 'Booking.com B.V.', supplier_invoice_no: `1${s.ref.slice(3)}`, booking_intent_id: s.id, booking_reference: s.ref, unit_id: s.unit, source_type: 'import', source_system: 'booking_com_reservations', source_reference: `bcom-commission:${s.ref}`, document_state: s.out < -20 ? 'complete' : 'missing' }, [
      { category: 'ota_commission', taxCode: 'DE_REVERSE_CHARGE', net: commission, description: 'Commission 15 %', classification: s.out < -20 ? 'reviewed' : 'suggested' },
    ]);
    if (s.out < -20) doc({ document_type: 'booking_com_commission_invoice', original_filename: `bcom-commission-${s.ref}.pdf`, document_date: d(s.out + 3), counterparty_id: CP.bcom.id }, { type: 'transaction', id: c.id });
  }
}

/* Booking.com payouts: two match a bundle exactly, one does NOT (a € 12.00 short payout — mismatch scenario). */
{
  const b1 = revenueByStay.get('b-1')!, b2 = revenueByStay.get('b-2')!, b3 = revenueByStay.get('b-3')!, b4 = revenueByStay.get('b-4')!;
  const p1 = pay({ direction: 'in', source: 'booking_com_payout', provider_reference: 'PO-2026-0917-4471', amount_cents: b1.gross_cents + b2.gross_cents, occurred_at: ts(-26), counterparty_label: 'Booking.com', reference_text: 'Payout 4181523044, 4181598721', kind: 'payout', account_id: 'acc-bank' });
  match(b1, p1, 'matched', 'R6 payout-bundle (confirmed)', 'medium', 'Payout PO-2026-0917-4471 equals the sum of 2 stays; confirmed against the payout statement by ops@example.com.', b1.gross_cents);
  match(b2, p1, 'matched', 'R6 payout-bundle (confirmed)', 'medium', 'Payout PO-2026-0917-4471 equals the sum of 2 stays; confirmed against the payout statement by ops@example.com.', b2.gross_cents);
  RECON[RECON.length - 1].matched_by = 'ops@example.com';
  RECON[RECON.length - 2].matched_by = 'ops@example.com';
  const p2 = pay({ direction: 'in', source: 'booking_com_payout', provider_reference: 'PO-2026-1001-4519', amount_cents: b3.gross_cents + b4.gross_cents - 1200, occurred_at: ts(-8), counterparty_label: 'Booking.com', reference_text: 'Payout 4182004410, 4182377652', kind: 'payout', account_id: 'acc-bank' });
  match(b3, p2, 'matched', 'R4 reference-text', 'high', 'Payout reference names 4182004410; amount covers the stay.', b3.gross_cents);
  match(b4, p2, 'mismatch', 'R3 booking-key mismatch', 'high', `Payout PO-2026-1001-4519 leaves ${b4.gross_cents - 1200} cents for 4182377652 against a revenue gross of ${b4.gross_cents} cents: € 12,00 short. A person must decide (a Booking.com adjustment or a guest no-show fee?).`, b4.gross_cents - 1200);
  doc({ document_type: 'booking_com_payout_statement', original_filename: 'bcom-payout-PO-2026-0917-4471.pdf', document_date: d(-26), counterparty_id: CP.bcom.id }, { type: 'payment', id: p1.id });
}

/* Refund on BLG-R7A2KC: partial, completed at PayPal. */
{
  const orig = revenueByStay.get('i-20')!;
  const r = post({ kind: 'refund', booked_on: d(-50), service_from: d(-52), service_to: d(-48), description: 'Refund BLG-R7A2KC · partial (one night, guest illness)', channel: 'direct', booking_intent_id: 'i-20', booking_reference: 'BLG-R7A2KC', unit_id: 'u-s1', source_type: 'refund', source_system: 'booking', source_reference: 'refund:5RF00011HH551222C', document_state: 'not_required' }, [
    { category: 'accommodation_revenue', taxCode: 'DE_ACCOMMODATION_REDUCED', gross: -14300, description: 'Refund · Accommodation' },
    { category: 'accommodation_ancillary', taxCode: 'DE_ANCILLARY_REVIEW', gross: -1300, description: 'Refund · Final cleaning fee' },
  ]);
  const p = pay({ direction: 'out', source: 'paypal', provider_reference: '5RF00011HH551222C', amount_cents: 15600, occurred_at: ts(-50), counterparty_label: 'Guest · BLG-R7A2KC', reference_text: 'refund BLG-R7A2KC', booking_intent_id: 'i-20', booking_reference: 'BLG-R7A2KC', kind: 'refund' });
  match(r, p, 'matched', 'R1 booking-key exact', 'exact', 'Refund 5RF00011HH551222C belongs to booking BLG-R7A2KC and equals the refund gross.');
  void orig;
}

/* PayPal fees: exempt, not deductible. */
{
  const t = post({ kind: 'fee', booked_on: d(-1), service_from: d(-31), service_to: d(-1), description: 'PayPal merchant fees · last 30 days', counterparty_id: CP.paypal.id, counterparty_label: 'PayPal (Europe) S.à r.l. et Cie, S.C.A.', source_type: 'import', source_system: 'paypal_activity', source_reference: `paypal-fees:${monthKey(d(-1))}`, document_state: 'complete', payment_state: 'paid', reconciliation_state: 'matched' }, [
    { category: 'payment_fees', taxCode: 'DE_EXEMPT', net: 8_930, description: 'Transaction fees (2.49 % + € 0.35)', inputVat: 'not_deductible', deductibleBp: 0, allocation: 'revenue_share', unitId: 'u-s1' },
    { category: 'payment_fees', taxCode: 'DE_EXEMPT', net: 6_710, description: 'Transaction fees (2.49 % + € 0.35)', inputVat: 'not_deductible', deductibleBp: 0, allocation: 'revenue_share', unitId: 'u-s2' },
  ]);
  doc({ document_type: 'paypal_statement', original_filename: `paypal-activity-${monthKey(d(-1))}.csv`, mime_type: 'text/csv', document_date: d(-1), counterparty_id: CP.paypal.id, source: 'import' }, { type: 'transaction', id: t.id });
}

/* Cleaning: monthly invoices per unit; last month's Schulstraße II invoice is MISSING its document; one is unpaid and due. */
const TURNOVER_COSTS: TurnoverCostRow[] = [];
{
  const prev = monthKey(d(-35));
  const c1 = post({ kind: 'expense', booked_on: d(-32), service_from: `${prev}-01`, service_to: d(-32), invoice_date: d(-30), due_on: d(-16), description: `Turnover cleaning ${prev} · Schulstraße I (4 turnovers)`, counterparty_id: CP.clean.id, counterparty_label: CP.clean.name, supplier_invoice_no: `RE-${thisYear}-0412`, unit_id: 'u-s1', source_type: 'manual', source_system: 'manual', source_reference: 'exp:clean-prev-s1', document_state: 'complete', posted_by: 'ops@example.com' }, [
    { category: 'cleaning', taxCode: 'DE_STANDARD', net: 34_000, description: '4 × Endreinigung à € 85,00', quantity: 4, classification: 'auto_verified' },
  ]);
  const c1p = pay({ direction: 'out', source: 'bank', provider_reference: 'SPK-2026-09-0044', amount_cents: c1.gross_cents, occurred_at: ts(-18), counterparty_label: CP.clean.name, reference_text: `RE-${thisYear}-0412`, kind: 'disbursement' });
  match(c1, c1p, 'matched', 'R4 reference-text', 'high', `Bank reference names RE-${thisYear}-0412 and equals the gross.`);
  doc({ document_type: 'supplier_invoice', original_filename: `sauber-co-RE-${thisYear}-0412.pdf`, document_date: d(-30), counterparty_id: CP.clean.id }, { type: 'transaction', id: c1.id });

  const c2 = post({ kind: 'expense', booked_on: d(-32), service_from: `${prev}-01`, service_to: d(-32), invoice_date: d(-30), due_on: d(-16), description: `Turnover cleaning ${prev} · Schulstraße II (3 turnovers)`, counterparty_id: CP.clean.id, counterparty_label: CP.clean.name, supplier_invoice_no: `RE-${thisYear}-0413`, unit_id: 'u-s2', source_type: 'manual', source_system: 'manual', source_reference: 'exp:clean-prev-s2', document_state: 'missing', posted_by: 'ops@example.com' }, [
    { category: 'cleaning', taxCode: 'DE_STANDARD', net: 25_500, description: '3 × Endreinigung à € 85,00', quantity: 3, classification: 'auto_verified' },
  ]);
  const c2p = pay({ direction: 'out', source: 'bank', provider_reference: 'SPK-2026-09-0045', amount_cents: c2.gross_cents, occurred_at: ts(-18), counterparty_label: CP.clean.name, reference_text: `RE-${thisYear}-0413`, kind: 'disbursement' });
  match(c2, c2p, 'matched', 'R4 reference-text', 'high', `Bank reference names RE-${thisYear}-0413 and equals the gross.`);

  const c3 = post({ kind: 'expense', booked_on: d(-3), service_from: `${monthKey(d(-3))}-01`, service_to: d(-3), invoice_date: d(-2), due_on: d(12), description: `Turnover cleaning ${monthKey(d(-3))} · both units (5 turnovers)`, counterparty_id: CP.clean.id, counterparty_label: CP.clean.name, supplier_invoice_no: `RE-${thisYear}-0455`, source_type: 'manual', source_system: 'manual', source_reference: 'exp:clean-cur', document_state: 'complete', posted_by: 'ops@example.com' }, [
    { category: 'cleaning', taxCode: 'DE_STANDARD', net: 25_500, description: '3 × Endreinigung Schulstraße I', quantity: 3, unitId: 'u-s1', classification: 'auto_verified' },
    { category: 'cleaning', taxCode: 'DE_STANDARD', net: 17_000, description: '2 × Endreinigung Schulstraße II', quantity: 2, unitId: 'u-s2', classification: 'auto_verified' },
  ]);
  doc({ document_type: 'supplier_invoice', original_filename: `sauber-co-RE-${thisYear}-0455.pdf`, document_date: d(-2), counterparty_id: CP.clean.id }, { type: 'transaction', id: c3.id });
  const cleanLines = LINES.filter((l) => l.transaction_id === c3.id);
  TURNOVER_COSTS.push(
    { id: 'tc-1', turnover_id: 't-i10', booking_intent_id: 'i-10', booking_reference: 'BLG-M8X2PL', unit_id: 'u-s2', departure: d(-7), supplier_id: CP.clean.id, expected_net_cents: 8500, expected_tax_code: 'DE_STANDARD', actual_line_id: cleanLines[1].id, state: 'invoiced', note: null },
    { id: 'tc-2', turnover_id: 't-b5', booking_intent_id: 'b-5', booking_reference: '4182611980', unit_id: 'u-s1', departure: d(-5), supplier_id: CP.clean.id, expected_net_cents: 8500, expected_tax_code: 'DE_STANDARD', actual_line_id: cleanLines[0].id, state: 'invoiced', note: null },
    { id: 'tc-3', turnover_id: 't-i01', booking_intent_id: 'i-01', booking_reference: 'BLG-7K2M9P', unit_id: 'u-s1', departure: d(0), supplier_id: CP.clean.id, expected_net_cents: 8500, expected_tax_code: 'DE_STANDARD', actual_line_id: null, state: 'expected', note: null },
    { id: 'tc-4', turnover_id: 't-i02', booking_intent_id: 'i-02', booking_reference: 'BLG-QX4T8W', unit_id: 'u-s2', departure: d(3), supplier_id: CP.clean.id, expected_net_cents: 8500, expected_tax_code: 'DE_STANDARD', actual_line_id: null, state: 'expected', note: null },
    { id: 'tc-5', turnover_id: 't-b6', booking_intent_id: 'b-6', booking_reference: '4182990031', unit_id: 'u-s2', departure: d(9), supplier_id: CP.clean.id, expected_net_cents: 8500, expected_tax_code: 'DE_STANDARD', actual_line_id: null, state: 'expected', note: null },
  );
}

/* Laundry, allocated by occupied nights. */
{
  const t = post({ kind: 'expense', booked_on: d(-12), invoice_date: d(-12), due_on: d(2), description: 'Linen service · September', counterparty_id: CP.laundry.id, counterparty_label: CP.laundry.name, supplier_invoice_no: '2026-1188', source_type: 'manual', source_system: 'manual', source_reference: 'exp:laundry-sep', document_state: 'complete', posted_by: 'ops@example.com' }, [
    { category: 'laundry', taxCode: 'DE_STANDARD', net: 11_200, description: 'Linen · Schulstraße I (allocated 56 % by occupied nights)', unitId: 'u-s1', allocation: 'occupied_nights', classification: 'auto_verified' },
    { category: 'laundry', taxCode: 'DE_STANDARD', net: 8_800, description: 'Linen · Schulstraße II (allocated 44 % by occupied nights)', unitId: 'u-s2', allocation: 'occupied_nights', classification: 'auto_verified' },
  ]);
  doc({ document_type: 'supplier_invoice', original_filename: 'waescherei-2026-1188.pdf', document_date: d(-12), counterparty_id: CP.laundry.id }, { type: 'transaction', id: t.id });
}

/* Foreign SaaS: reverse charge, suggested → needs a person. */
{
  post({ kind: 'expense', booked_on: d(-6), invoice_date: d(-6), due_on: d(8), description: 'Channelstack Pro · monthly subscription', counterparty_id: CP.saas.id, counterparty_label: CP.saas.name, supplier_invoice_no: 'INV-88213', source_type: 'manual', source_system: 'manual', source_reference: 'exp:saas-sep', document_state: 'complete', posted_by: 'ops@example.com' }, [
    { category: 'software', taxCode: 'DE_REVERSE_CHARGE', net: 14_900, description: 'Subscription (US supplier, no VAT on invoice)', classification: 'suggested' },
  ]);
  doc({ document_type: 'supplier_invoice', original_filename: 'channelstack-INV-88213.pdf', document_date: d(-6), counterparty_id: CP.saas.id }, { type: 'transaction', id: TX[TX.length - 1].id });
  const beds = post({ kind: 'expense', booked_on: d(-20), invoice_date: d(-20), due_on: d(-6), description: 'Beds24 channel manager · monthly', counterparty_id: CP.beds24.id, counterparty_label: CP.beds24.name, supplier_invoice_no: 'B24-771902', source_type: 'manual', source_system: 'manual', source_reference: 'exp:beds24-sep', document_state: 'complete', posted_by: 'ops@example.com' }, [
    { category: 'software', taxCode: 'DE_STANDARD', net: 3_900, description: '2 properties', classification: 'auto_verified' },
  ]);
  const bp = pay({ direction: 'out', source: 'bank', provider_reference: 'SPK-2026-09-0071', amount_cents: beds.gross_cents, occurred_at: ts(-7), counterparty_label: 'Beds24 GmbH', reference_text: 'B24-771902 SEPA-Lastschrift', kind: 'disbursement' });
  match(beds, bp, 'matched', 'R4 reference-text', 'high', 'Bank reference names B24-771902 and equals the gross.');
  doc({ document_type: 'e_invoice', original_filename: 'beds24-B24-771902.xml', mime_type: 'application/xml', structured_format: 'xrechnung', structured_valid: null, document_date: d(-20), counterparty_id: CP.beds24.id, note: 'Received as XRechnung XML; kept as the original. Validity not asserted (no validator configured).' }, { type: 'transaction', id: beds.id });
}

/* IKEA: one invoice split over two units + admin; two lines asset candidates. */
{
  const t = post({ kind: 'expense', booked_on: d(-24), invoice_date: d(-24), due_on: d(-24), description: 'IKEA Nürnberg · furnishings and office', counterparty_id: CP.ikea.id, counterparty_label: CP.ikea.name, supplier_invoice_no: '20260827-115522', source_type: 'manual', source_system: 'manual', source_reference: 'exp:ikea-aug', document_state: 'complete', payment_state: 'paid', reconciliation_state: 'matched', posted_by: 'ops@example.com' }, [
    { category: 'furniture', taxCode: 'DE_STANDARD', net: 40_000, description: 'Sofa bed SÖDERHAMN · Schulstraße I', unitId: 'u-s1', allocation: 'manual', assetState: 'candidate', classification: 'reviewed' },
    { category: 'furniture', taxCode: 'DE_STANDARD', net: 25_000, description: 'Wardrobe PAX · Schulstraße II', unitId: 'u-s2', allocation: 'manual', assetState: 'candidate', classification: 'reviewed' },
    { category: 'office_admin', taxCode: 'DE_STANDARD', net: 10_000, description: 'Office shelving', unitId: null, allocation: 'unallocated', classification: 'reviewed' },
  ]);
  OVERRIDES.push({ id: nid('ov'), target_type: 'line', target_id: LINES.find((l) => l.transaction_id === t.id && l.line_no === 3)!.id, field: 'category', old_value: 'furniture', new_value: 'office_admin', reason: 'shelving is for the office, not a unit', actor: 'ops@example.com', created_at: ts(-23) });
  doc({ document_type: 'receipt', original_filename: 'ikea-20260827-115522.pdf', document_date: d(-24), counterparty_id: CP.ikea.id }, { type: 'transaction', id: t.id });
}

/* Amazon: ambiguous → review required tax code, input VAT undecided. */
post({ kind: 'expense', booked_on: d(-9), invoice_date: d(-9), description: 'Amazon · guest supplies (coffee capsules, towels, bulbs)', counterparty_id: CP.amazon.id, counterparty_label: CP.amazon.name, supplier_invoice_no: 'DS-AEU-INV-DE-2026-4471', source_type: 'manual', source_system: 'manual', source_reference: 'exp:amazon-sep', document_state: 'complete', payment_state: 'paid', reconciliation_state: 'matched', posted_by: 'ops@example.com' }, [
  { category: 'guest_supplies', taxCode: 'DE_REVIEW_REQUIRED', gross: 18_740, description: 'Mixed basket: 7 % and 19 % items on one receipt — split needed', unitId: null, allocation: 'unallocated' },
]);
doc({ document_type: 'receipt', original_filename: 'amazon-DS-AEU-INV-DE-2026-4471.pdf', document_date: d(-9), counterparty_id: CP.amazon.id }, { type: 'transaction', id: TX[TX.length - 1].id });

/* Electricity, 19 %, unit-direct; heating review. */
{
  const e = post({ kind: 'expense', booked_on: d(-15), service_from: d(-45), service_to: d(-15), invoice_date: d(-14), due_on: d(0), description: 'Electricity · Schulstraße I · monthly instalment', counterparty_id: CP.stadtwerke.id, counterparty_label: CP.stadtwerke.name, supplier_invoice_no: 'SWB-4471-09', unit_id: 'u-s1', source_type: 'manual', source_system: 'manual', source_reference: 'exp:sw-s1-sep', document_state: 'complete', posted_by: 'ops@example.com' }, [
    { category: 'electricity', taxCode: 'DE_STANDARD', net: 9_800, description: 'Abschlag Strom', classification: 'auto_verified' },
  ]);
  doc({ document_type: 'supplier_invoice', original_filename: 'stadtwerke-SWB-4471-09.pdf', document_date: d(-14), counterparty_id: CP.stadtwerke.id }, { type: 'transaction', id: e.id });
  post({ kind: 'expense', booked_on: d(-15), service_from: d(-45), service_to: d(-15), invoice_date: d(-14), due_on: d(0), description: 'Electricity · Schulstraße II · monthly instalment', counterparty_id: CP.stadtwerke.id, counterparty_label: CP.stadtwerke.name, supplier_invoice_no: 'SWB-4472-09', unit_id: 'u-s2', source_type: 'manual', source_system: 'manual', source_reference: 'exp:sw-s2-sep', document_state: 'complete', posted_by: 'ops@example.com' }, [
    { category: 'electricity', taxCode: 'DE_STANDARD', net: 8_600, description: 'Abschlag Strom', classification: 'auto_verified' },
  ]);
  doc({ document_type: 'supplier_invoice', original_filename: 'stadtwerke-SWB-4472-09.pdf', document_date: d(-14), counterparty_id: CP.stadtwerke.id }, { type: 'transaction', id: TX[TX.length - 1].id });
}

/* Minibar purchase (split 7 % / 19 %) and products/movements. */
const PRODUCTS: MinibarProductRow[] = [
  { id: 'mb-water', sku: 'WATER-05', name: 'Mineral water 0.5 l', unit_label: 'bottle', active: true, purchase_cost_cents: 45, selling_price_cents: 250, tax_code: 'DE_BEVERAGE_STANDARD', purchase_tax_code: 'DE_STANDARD', reorder_threshold: 12, supplier_id: CP.getraenke.id, unit_id: null },
  { id: 'mb-cola', sku: 'COLA-033', name: 'Cola 0.33 l', unit_label: 'can', active: true, purchase_cost_cents: 60, selling_price_cents: 300, tax_code: 'DE_BEVERAGE_STANDARD', purchase_tax_code: 'DE_STANDARD', reorder_threshold: 12, supplier_id: CP.getraenke.id, unit_id: null },
  { id: 'mb-beer', sku: 'BEER-033', name: 'Maisel’s Weisse 0.33 l', unit_label: 'bottle', active: true, purchase_cost_cents: 95, selling_price_cents: 380, tax_code: 'DE_BEVERAGE_STANDARD', purchase_tax_code: 'DE_STANDARD', reorder_threshold: 12, supplier_id: CP.getraenke.id, unit_id: null },
  { id: 'mb-choc', sku: 'CHOC-100', name: 'Chocolate bar 100 g', unit_label: 'bar', active: true, purchase_cost_cents: 110, selling_price_cents: 350, tax_code: 'DE_FOOD_REDUCED', purchase_tax_code: 'DE_REDUCED', reorder_threshold: 10, supplier_id: CP.getraenke.id, unit_id: null },
  { id: 'mb-nuts', sku: 'NUTS-050', name: 'Salted nuts 50 g', unit_label: 'bag', active: true, purchase_cost_cents: 70, selling_price_cents: 300, tax_code: 'DE_FOOD_REDUCED', purchase_tax_code: 'DE_REDUCED', reorder_threshold: 10, supplier_id: CP.getraenke.id, unit_id: null },
  { id: 'mb-prosecco', sku: 'PROS-020', name: 'Prosecco 0.2 l', unit_label: 'bottle', active: true, purchase_cost_cents: 210, selling_price_cents: 690, tax_code: 'DE_BEVERAGE_STANDARD', purchase_tax_code: 'DE_STANDARD', reorder_threshold: 6, supplier_id: CP.getraenke.id, unit_id: null },
];
const MOVEMENTS: MinibarMovementRow[] = [];
function move(m: Partial<MinibarMovementRow> & { product_id: string; movement: string; quantity: number; occurred_on: string }): MinibarMovementRow {
  const p = PRODUCTS.find((x) => x.id === m.product_id)!;
  const row: MinibarMovementRow = { id: m.id ?? nid('mv'), product_id: p.id, movement: m.movement, quantity: m.quantity, unit_cost_cents: p.purchase_cost_cents, unit_price_cents: m.movement === 'sale' ? p.selling_price_cents : null, unit_id: m.unit_id ?? null, booking_intent_id: m.booking_intent_id ?? null, booking_reference: m.booking_reference ?? null, charge_state: m.charge_state ?? 'not_applicable', occurred_on: m.occurred_on, transaction_id: m.transaction_id ?? null, corrects_id: null, note: m.note ?? null, recorded_by: m.recorded_by ?? 'ops@example.com', created_at: new Date(`${m.occurred_on}T11:00:00+02:00`).toISOString() };
  MOVEMENTS.push(row);
  return row;
}
{
  const purchase = post({ kind: 'expense', booked_on: d(-28), invoice_date: d(-28), due_on: d(-14), description: 'Minibar stock · Getränke Hofmann', counterparty_id: CP.getraenke.id, counterparty_label: CP.getraenke.name, supplier_invoice_no: 'GH-2026-3310', source_type: 'manual', source_system: 'manual', source_reference: 'exp:minibar-aug', document_state: 'complete', payment_state: 'paid', reconciliation_state: 'matched', posted_by: 'ops@example.com' }, [
    { category: 'minibar_purchases', taxCode: 'DE_STANDARD', net: 6_840, description: 'Beverages (48 water, 36 cola, 24 beer, 12 prosecco)', classification: 'reviewed' },
    { category: 'minibar_purchases', taxCode: 'DE_REDUCED', net: 3_240, description: 'Snacks (24 chocolate, 24 nuts)', classification: 'reviewed' },
  ]);
  doc({ document_type: 'supplier_invoice', original_filename: 'hofmann-GH-2026-3310.pdf', document_date: d(-28), counterparty_id: CP.getraenke.id }, { type: 'transaction', id: purchase.id });
  for (const [pid, qty] of [['mb-water', 48], ['mb-cola', 36], ['mb-beer', 24], ['mb-prosecco', 12], ['mb-choc', 24], ['mb-nuts', 24]] as const) move({ product_id: pid, movement: 'purchase', quantity: qty, occurred_on: d(-28) });
  const sales: Array<[string, string, string, number, string, string, number]> = [
    ['i-10', 'BLG-M8X2PL', 'u-s2', -7, 'mb-water', 'paid', 2], ['i-10', 'BLG-M8X2PL', 'u-s2', -7, 'mb-beer', 'paid', 2],
    ['b-5', '4182611980', 'u-s1', -5, 'mb-cola', 'paid', 1], ['b-5', '4182611980', 'u-s1', -5, 'mb-choc', 'paid', 2], ['b-5', '4182611980', 'u-s1', -5, 'mb-prosecco', 'paid', 1],
    ['b-4', '4182377652', 'u-s2', -11, 'mb-water', 'paid', 3], ['b-4', '4182377652', 'u-s2', -11, 'mb-nuts', 'paid', 1],
    ['i-01', 'BLG-7K2M9P', 'u-s1', 0, 'mb-water', 'unpaid', 2], ['i-01', 'BLG-7K2M9P', 'u-s1', 0, 'mb-cola', 'unpaid', 1],
  ];
  for (const [intent, ref, unit, off, pid, charge, qty] of sales) {
    const p = PRODUCTS.find((x) => x.id === pid)!;
    const code = requireTaxCode(p.tax_code);
    const t = post({ kind: 'revenue', booked_on: d(off), service_from: d(off), service_to: d(off), description: `Minibar ${p.name}`, channel: ref.startsWith('BLG') ? 'direct' : 'booking_com', booking_intent_id: intent, booking_reference: ref, unit_id: unit, source_type: 'minibar', source_system: 'minibar', source_reference: `${ref}:${p.sku}`, document_state: 'not_required', payment_state: charge === 'paid' ? 'paid' : 'unpaid', reconciliation_state: charge === 'paid' ? 'matched' : 'unmatched' }, [
      { category: 'minibar_sales', taxCode: p.tax_code, gross: p.selling_price_cents * qty, description: `${p.name} × ${qty}`, quantity: qty, productId: p.id },
    ]);
    post({ kind: 'cogs', booked_on: d(off), service_from: d(off), service_to: d(off), description: `Minibar COGS ${p.name}`, channel: ref.startsWith('BLG') ? 'direct' : 'booking_com', booking_intent_id: intent, booking_reference: ref, unit_id: unit, source_type: 'minibar', source_system: 'minibar', source_reference: `${ref}:${p.sku}:cogs`, document_state: 'not_required', payment_state: 'not_applicable', reconciliation_state: 'not_applicable' }, [
      { category: 'minibar_cogs', taxCode: 'DE_OUTSIDE_SCOPE', net: p.purchase_cost_cents * qty, description: `COGS ${p.name} × ${qty}`, quantity: qty, productId: p.id, inputVat: 'not_applicable' },
    ]);
    void code;
    move({ product_id: pid, movement: 'sale', quantity: -qty, occurred_on: d(off), unit_id: unit, booking_intent_id: intent, booking_reference: ref, charge_state: charge, transaction_id: t.id });
  }
  move({ product_id: 'mb-beer', movement: 'complimentary', quantity: -1, occurred_on: d(-11), unit_id: 'u-s2', booking_reference: '4182377652', charge_state: 'included', note: 'Welcome drink' });
  move({ product_id: 'mb-water', movement: 'waste', quantity: -1, occurred_on: d(-2), note: 'Broken bottle' });
  move({ product_id: 'mb-choc', movement: 'adjustment', quantity: -2, occurred_on: d(-1), charge_state: 'needs_review', note: 'Stock count 20, book 22 — shrinkage or unrecorded sale?' });
}

/* Tax adviser, bank fees, a tax payment (KSt advance) and an unmatched bank receipt. */
{
  const stb = post({ kind: 'expense', booked_on: d(-40), invoice_date: d(-40), due_on: d(-26), description: 'Bookkeeping and VAT return Q2', counterparty_id: CP.stb.id, counterparty_label: CP.stb.name, supplier_invoice_no: 'STB-2026-0790', source_type: 'manual', source_system: 'manual', source_reference: 'exp:stb-q2', document_state: 'complete', posted_by: 'ops@example.com' }, [
    { category: 'tax_adviser', taxCode: 'DE_STANDARD', net: 48_000, description: 'Buchführung Q2, UStVA', classification: 'accountant_locked' },
  ]);
  const stbp = pay({ direction: 'out', source: 'bank', provider_reference: 'SPK-2026-08-0102', amount_cents: stb.gross_cents, occurred_at: ts(-30), counterparty_label: CP.stb.name, reference_text: 'STB-2026-0790', kind: 'disbursement' });
  match(stb, stbp, 'matched', 'R4 reference-text', 'high', 'Bank reference names STB-2026-0790 and equals the gross.');
  doc({ document_type: 'supplier_invoice', original_filename: 'steuerkanzlei-STB-2026-0790.pdf', document_date: d(-40), counterparty_id: CP.stb.id }, { type: 'transaction', id: stb.id });
  const fees = post({ kind: 'fee', booked_on: d(-1), description: 'Account fees · monthly', counterparty_id: CP.bank.id, counterparty_label: CP.bank.name, source_type: 'import', source_system: 'bank_csv', source_reference: `bank-fee:${monthKey(d(-1))}`, document_state: 'complete', posted_by: 'system' }, [
    { category: 'bank_fees', taxCode: 'DE_EXEMPT', net: 1_290, description: 'Kontoführung', inputVat: 'not_deductible', deductibleBp: 0 },
  ]);
  const feesp = pay({ direction: 'out', source: 'bank', provider_reference: 'SPK-2026-09-0110', amount_cents: 1_290, occurred_at: ts(-1), counterparty_label: CP.bank.name, reference_text: 'Kontoführungsentgelt', kind: 'fee' });
  match(fees, feesp, 'matched', 'R1 booking-key exact', 'exact', 'Fee line and bank entry agree.');
  const kst = post({ kind: 'tax_payment', booked_on: d(-10), description: `KSt advance payment III/${thisYear}`, counterparty_id: CP.fa.id, counterparty_label: 'Finanzamt Bayreuth', source_type: 'manual', source_system: 'manual', source_reference: `tax:kst-q3-${thisYear}`, document_state: 'complete', posted_by: 'ops@example.com' }, [
    { category: 'taxes_non_operating', taxCode: 'DE_OUTSIDE_SCOPE', net: 250_000, description: 'Vorauszahlung Körperschaftsteuer + Soli', inputVat: 'not_applicable' },
  ]);
  const kstp = pay({ direction: 'out', source: 'bank', provider_reference: 'SPK-2026-09-0090', amount_cents: 250_000, occurred_at: ts(-10), counterparty_label: 'Finanzamt Bayreuth', reference_text: `KSt Vorauszahlung III/${thisYear} St.-Nr. 208/•••/•••••`, kind: 'tax' });
  match(kst, kstp, 'matched', 'R4 reference-text', 'high', 'Bank entry to the Finanzamt equals the recorded advance payment.');
  pay({ direction: 'in', source: 'bank', provider_reference: 'SPK-2026-09-0104', amount_cents: 32_000, occurred_at: ts(-4), counterparty_label: 'M. Schreiber', reference_text: 'Kaution Opernstrasse?', kind: 'unknown' });
  pay({ direction: 'in', source: 'paypal', provider_reference: '8QQ77123HH551333D', amount_cents: 43500, occurred_at: ts(-2), counterparty_label: 'Guest · ?', reference_text: 'Apartment Bayreuth', kind: 'receipt' });
}

/* Periods */
const PERIODS: PeriodRow[] = Array.from({ length: 9 }, (_, i) => {
  const key = monthKey(addDays(`${monthKey(today)}-01`, -i * 28 - (i > 0 ? 1 : 0)));
  const from = `${key}-01`;
  const to = monthKey(addDays(from, 32)) + '-01';
  const status = i >= 4 ? 'locked' : i === 3 ? 'accountant_reviewed' : i === 2 ? 'review' : 'open';
  return { period_key: key, starts_on: from, ends_on: to, status, status_at: ts(-i * 28), status_by: status === 'open' ? null : status === 'review' ? 'ops@example.com' : 'sb@example.com', locked_at: status === 'locked' ? ts(-i * 28) : null, locked_by: status === 'locked' ? 'sb@example.com' : null, note: null };
}).filter((p, i, arr) => arr.findIndex((x) => x.period_key === p.period_key) === i);

/* Tax periods, estimates, notices, payments, reserves, adjustments */
const Q = (o: number) => { const m = Number(today.slice(5, 7)) - 1 + o * 3; const y = thisYear + Math.floor(m / 12); const q = Math.floor(((m % 12) + 12) % 12 / 3) + 1; return { key: `${y}-Q${q}`, from: `${y}-${String((q - 1) * 3 + 1).padStart(2, '0')}-01`, to: q === 4 ? `${y + 1}-01-01` : `${y}-${String(q * 3 + 1).padStart(2, '0')}-01` }; };
const q0 = Q(0), q1 = Q(-1), q2 = Q(-2);
const TAX_PERIODS: TaxPeriodRow[] = [
  { id: 'tp-vat-q2', tax_type: 'vat', period_key: q2.key, starts_on: q2.from, ends_on: addDays(q2.to, -1), filing_due_on: addDays(q2.to, 9), payment_due_on: addDays(q2.to, 9), official_due_on: null, status: 'paid', status_at: ts(-70), status_by: 'sb@example.com', note: null },
  { id: 'tp-vat-q1', tax_type: 'vat', period_key: q1.key, starts_on: q1.from, ends_on: addDays(q1.to, -1), filing_due_on: addDays(q1.to, 9), payment_due_on: addDays(q1.to, 9), official_due_on: null, status: 'filed', status_at: ts(-25), status_by: 'sb@example.com', note: null },
  { id: 'tp-vat-q0', tax_type: 'vat', period_key: q0.key, starts_on: q0.from, ends_on: addDays(q0.to, -1), filing_due_on: addDays(q0.to, 9), payment_due_on: addDays(q0.to, 9), official_due_on: null, status: 'estimated', status_at: ts(0), status_by: 'system', note: null },
  { id: 'tp-kst', tax_type: 'kst', period_key: String(thisYear), starts_on: `${thisYear}-01-01`, ends_on: `${thisYear}-12-31`, filing_due_on: `${thisYear + 1}-07-31`, payment_due_on: null, official_due_on: null, status: 'estimated', status_at: ts(0), status_by: 'system', note: null },
  { id: 'tp-soli', tax_type: 'soli', period_key: String(thisYear), starts_on: `${thisYear}-01-01`, ends_on: `${thisYear}-12-31`, filing_due_on: `${thisYear + 1}-07-31`, payment_due_on: null, official_due_on: null, status: 'estimated', status_at: ts(0), status_by: 'system', note: null },
  { id: 'tp-gewst', tax_type: 'gewst', period_key: String(thisYear), starts_on: `${thisYear}-01-01`, ends_on: `${thisYear}-12-31`, filing_due_on: `${thisYear + 1}-07-31`, payment_due_on: null, official_due_on: null, status: 'estimated', status_at: ts(0), status_by: 'system', note: null },
  { id: 'tp-kst-prev', tax_type: 'kst', period_key: String(thisYear - 1), starts_on: `${thisYear - 1}-01-01`, ends_on: `${thisYear - 1}-12-31`, filing_due_on: `${thisYear}-07-31`, payment_due_on: null, official_due_on: null, status: 'assessed', status_at: ts(-45), status_by: 'sb@example.com', note: null },
];
const TAX_ESTIMATES: TaxEstimateRow[] = [
  { id: 'te-1', tax_period_id: 'tp-vat-q2', stage: 'system_estimate', amount_cents: 1_248_000, basis: { output: 1_612_000, input: 364_000 }, rules_version: 'vat-2026-09-20.1', computed_at: ts(-95), actor: 'system', note: null, document_id: null },
  { id: 'te-2', tax_period_id: 'tp-vat-q2', stage: 'accountant_reviewed', amount_cents: 1_231_200, basis: {}, rules_version: 'vat-2026-09-20.1', computed_at: ts(-80), actor: 'sb@example.com', note: 'Two input invoices moved to the next quarter (received late).', document_id: null },
  { id: 'te-3', tax_period_id: 'tp-vat-q2', stage: 'filed', amount_cents: 1_231_200, basis: {}, rules_version: 'vat-2026-09-20.1', computed_at: ts(-78), actor: 'sb@example.com', note: 'UStVA transmitted via ELSTER by the adviser.', document_id: null },
  { id: 'te-4', tax_period_id: 'tp-vat-q2', stage: 'paid', amount_cents: 1_231_200, basis: {}, rules_version: 'vat-2026-09-20.1', computed_at: ts(-70), actor: 'sb@example.com', note: null, document_id: null },
  { id: 'te-5', tax_period_id: 'tp-vat-q1', stage: 'system_estimate', amount_cents: 986_400, basis: {}, rules_version: 'vat-2026-09-20.1', computed_at: ts(-30), actor: 'system', note: null, document_id: null },
  { id: 'te-6', tax_period_id: 'tp-vat-q1', stage: 'accountant_reviewed', amount_cents: 991_000, basis: {}, rules_version: 'vat-2026-09-20.1', computed_at: ts(-26), actor: 'sb@example.com', note: null, document_id: null },
  { id: 'te-7', tax_period_id: 'tp-vat-q1', stage: 'filed', amount_cents: 991_000, basis: {}, rules_version: 'vat-2026-09-20.1', computed_at: ts(-25), actor: 'sb@example.com', note: null, document_id: null },
  { id: 'te-8', tax_period_id: 'tp-kst-prev', stage: 'system_estimate', amount_cents: 612_000, basis: {}, rules_version: 'company-tax-2026-09-20.1', computed_at: ts(-200), actor: 'system', note: null, document_id: null },
  { id: 'te-9', tax_period_id: 'tp-kst-prev', stage: 'assessed', amount_cents: 634_500, basis: {}, rules_version: 'company-tax-2026-09-20.1', computed_at: ts(-45), actor: 'sb@example.com', note: 'Per KSt-Bescheid.', document_id: null },
];
const TAX_NOTICES: TaxNoticeRow[] = [
  { id: 'tn-1', tax_type: 'kst', period_key: String(thisYear - 1), authority: 'Finanzamt Bayreuth', notice_type: 'assessment', assessment_date: d(-47), received_on: d(-45), assessed_cents: 634_500, advance_payment_cents: null, paid_cents: 634_500, status: 'paid', document_id: null, tax_period_id: 'tp-kst-prev', note: 'KSt + Soli assessed; paid with the September instalment.', created_by: 'ops@example.com', created_at: ts(-45), dues: [{ id: 'tnd-1', due_on: d(-15), amount_cents: 634_500, label: 'Abschlusszahlung', paid_cents: 634_500, paid_on: d(-16) }] },
  { id: 'tn-2', tax_type: 'kst', period_key: String(thisYear), authority: 'Finanzamt Bayreuth', notice_type: 'advance_payment', assessment_date: d(-47), received_on: d(-45), assessed_cents: null, advance_payment_cents: 1_000_000, paid_cents: 500_000, status: 'reviewed', document_id: null, tax_period_id: 'tp-kst', note: 'Vorauszahlungsbescheid: € 2.500 per quarter.', created_by: 'ops@example.com', created_at: ts(-45), dues: [
    { id: 'tnd-2a', due_on: `${thisYear}-09-10`, amount_cents: 250_000, label: 'III. Quartal', paid_cents: 250_000, paid_on: d(-10) },
    { id: 'tnd-2b', due_on: `${thisYear}-12-10`, amount_cents: 250_000, label: 'IV. Quartal', paid_cents: 0, paid_on: null },
  ] },
  { id: 'tn-3', tax_type: 'gewst', period_key: String(thisYear), authority: 'Stadt Bayreuth', notice_type: 'advance_payment', assessment_date: d(-3), received_on: d(-1), assessed_cents: null, advance_payment_cents: 1_200_000, paid_cents: 0, status: 'received', document_id: null, tax_period_id: 'tp-gewst', note: null, created_by: 'ops@example.com', created_at: ts(-1), dues: [
    { id: 'tnd-3a', due_on: `${thisYear}-11-15`, amount_cents: 300_000, label: 'IV. Quartal', paid_cents: 0, paid_on: null },
  ] },
];
doc({ document_type: 'tax_notice', original_filename: `gewst-vorauszahlungsbescheid-${thisYear}.pdf`, document_date: d(-3), counterparty_id: null, review_state: 'unreviewed' }, { type: 'tax_notice', id: 'tn-3' });
const TAX_PAYMENTS: TaxPaymentRow[] = [
  { id: 'tpay-1', tax_type: 'vat', period_key: q2.key, kind: 'final', amount_cents: 1_231_200, paid_on: d(-70), payment_id: null, notice_id: null, note: null, created_at: ts(-70) },
  { id: 'tpay-2', tax_type: 'kst', period_key: String(thisYear), kind: 'advance', amount_cents: 250_000, paid_on: d(-10), payment_id: PAYMENTS.find((p) => p.provider_reference === 'SPK-2026-09-0090')!.id, notice_id: 'tn-2', note: 'III. Quartal (incl. Soli)', created_at: ts(-10) },
  { id: 'tpay-3', tax_type: 'kst', period_key: String(thisYear), kind: 'advance', amount_cents: 250_000, paid_on: `${thisYear}-06-10`, payment_id: null, notice_id: 'tn-2', note: 'II. Quartal', created_at: ts(-100) },
  { id: 'tpay-4', tax_type: 'kst', period_key: String(thisYear - 1), kind: 'final', amount_cents: 634_500, paid_on: d(-16), payment_id: null, notice_id: 'tn-1', note: null, created_at: ts(-16) },
];
const RESERVES: ReserveRow[] = [
  { id: 'rs-1', kind: 'tax', label: 'Tax reserve (sub-account)', amount_cents: 800_000, account_id: 'acc-bank', as_of: d(-30), note: 'Moved after Q2 VAT.', set_by: 'lazar@example.com', created_at: ts(-30) },
  { id: 'rs-2', kind: 'tax', label: 'Tax reserve (sub-account)', amount_cents: 1_100_000, account_id: 'acc-bank', as_of: d(-2), note: 'Topped up € 3.000.', set_by: 'lazar@example.com', created_at: ts(-2) },
  { id: 'rs-3', kind: 'maintenance', label: 'Maintenance reserve', amount_cents: 200_000, account_id: 'acc-bank', as_of: d(-60), note: null, set_by: 'lazar@example.com', created_at: ts(-60) },
];
const TAX_ADJUSTMENTS: TaxAdjustmentRow[] = [
  { id: 'ta-1', tax_type: 'kst', fiscal_year: thisYear, kind: 'non_deductible_expense', amount_cents: 42_000, reason: 'Gifts above € 50 and 30 % of entertainment (§ 4 Abs. 5 EStG)', legal_reference: '§ 4 Abs. 5 Nr. 1, 2 EStG', actor: 'sb@example.com', superseded_by: null, created_at: ts(-20) },
  { id: 'ta-2', tax_type: 'gewst', fiscal_year: thisYear, kind: 'gewst_addition', amount_cents: 0, reason: 'Rents for the apartments are below the € 200,000 Freibetrag of § 8 Nr. 1 GewStG — no addition', legal_reference: '§ 8 Nr. 1 GewStG', actor: 'sb@example.com', superseded_by: null, created_at: ts(-20) },
];
const ASSETS: AssetRow[] = [
  { id: 'as-1', description: 'Sofa bed SÖDERHAMN · Schulstraße I', line_id: LINES.find((l) => l.description?.startsWith('Sofa bed'))!.id, counterparty_id: CP.ikea.id, purchased_on: d(-24), acquisition_cents: 40_000, unit_id: 'u-s1', category: 'furniture', useful_life_months: null, depreciation_method: null, depreciation_start_on: null, status: 'candidate', accountant_confirmed: false, confirmed_by: null, confirmed_at: null, document_id: null, note: 'AfA table: Büromöbel 13 years; sofa beds in furnished lettings — adviser to decide.', created_at: ts(-23) },
];
const EXPORTS: ExportRow[] = [
  { id: 'ex-1', export_kind: 'vat_report', period_from: q1.from, period_to: q1.to, format: 'csv', generator: 'bolagio-control-finance', version: '2026.09.1', row_count: 9, sha256: 'c1d2'.repeat(16), byte_size: 1_842, generated_by: 'ops@example.com', generated_at: ts(-27) },
  { id: 'ex-2', export_kind: 'accountant_review', period_from: `${monthKey(d(-35))}-01`, period_to: `${monthKey(today)}-01`, format: 'csv', generator: 'bolagio-control-finance', version: '2026.09.1', row_count: 14, sha256: 'e3f4'.repeat(16), byte_size: 2_210, generated_by: 'ops@example.com', generated_at: ts(-5) },
];
const IMPORTS: ImportBatchRow[] = [
  { id: 'ib-1', source_type: 'booking_com_reservations', adapter: 'booking_com_reservations', adapter_version: '0.1', filename: 'reservations-2026-08.csv', sha256: 'a1b2'.repeat(16), byte_size: 5_120, row_count: 5, valid_rows: 5, error_rows: 0, duplicate_rows: 0, status: 'imported', error: null, imported_at: ts(-29), created_by: 'ops@example.com', created_at: ts(-29) },
  { id: 'ib-2', source_type: 'paypal_activity', adapter: 'paypal_activity', adapter_version: '0.1', filename: `paypal-activity-${monthKey(d(-1))}.csv`, sha256: 'b2c3'.repeat(16), byte_size: 9_010, row_count: 12, valid_rows: 11, error_rows: 1, duplicate_rows: 0, status: 'imported', error: null, imported_at: ts(-1), created_by: 'ops@example.com', created_at: ts(-1) },
  { id: 'ib-3', source_type: 'bank_csv', adapter: 'bolagio_bank_csv', adapter_version: '1.0', filename: 'sparkasse-2026-09.csv', sha256: 'd4e5'.repeat(16), byte_size: 3_320, row_count: 9, valid_rows: 7, error_rows: 2, duplicate_rows: 0, status: 'failed', error: 'Row 4: Betrag is not a non-zero amount. Row 8: Buchungstag is not a date.', imported_at: null, created_by: 'ops@example.com', created_at: ts(-3) },
];
const IMPORT_ROWS: ImportRowRow[] = [
  { id: 'ir-1', batch_id: 'ib-3', row_no: 2, raw: { Buchungstag: d(-5), Betrag: '-1.290,00', Verwendungszweck: 'Kontoführungsentgelt' }, parsed: { target: 'payment', amountCents: 1290 }, status: 'valid', error: null, transaction_id: null, payment_id: null },
  { id: 'ir-2', batch_id: 'ib-3', row_no: 4, raw: { Buchungstag: d(-4), Betrag: '', Verwendungszweck: 'Storno' }, parsed: null, status: 'error', error: 'Betrag is not a non-zero amount.', transaction_id: null, payment_id: null },
  { id: 'ir-3', batch_id: 'ib-3', row_no: 8, raw: { Buchungstag: 'gestern', Betrag: '320,00', Verwendungszweck: 'Kaution' }, parsed: null, status: 'error', error: 'Buchungstag is not a date.', transaction_id: null, payment_id: null },
];
const INVOICES: InvoiceRow[] = [
  { id: 'inv-1', kind: 'invoice', series: null, number: null, status: 'draft', issued_on: null, issued_at: null, issued_by: null, issuer_name: null, issuer_tax_id_masked: null, recipient_name: 'Koch, J.', recipient_company: null, recipient_country: 'DE', booking_intent_id: 'i-10', booking_reference: 'BLG-M8X2PL', unit_id: 'u-s2', service_from: d(-10), service_to: d(-7), currency: 'EUR', net_cents: 40_654, vat_cents: 2_846, gross_cents: 43_500, payment_state: 'paid', corrects_invoice_id: null, transaction_id: revenueByStay.get('i-10')!.id, document_id: null, created_by: 'system', created_at: ts(-7) },
];
const INVOICE_LINES: InvoiceLineRow[] = [
  { id: 'invl-1', invoice_id: 'inv-1', line_no: 1, description: 'Accommodation · Schulstraße II · 3 nights', quantity: 3, category: 'accommodation_revenue', tax_code: 'DE_ACCOMMODATION_REDUCED', rate_bp: 700, net_cents: 35_981, vat_cents: 2_519, gross_cents: 38_500 },
  { id: 'invl-2', invoice_id: 'inv-1', line_no: 2, description: 'Final cleaning fee', quantity: 1, category: 'accommodation_ancillary', tax_code: 'DE_ANCILLARY_REVIEW', rate_bp: 0, net_cents: 5_000, vat_cents: 0, gross_cents: 5_000 },
];
const POLICY: PolicyRow[] = [
  { id: 'pol-1', key: 'fiscal_year_start_month', value: '1', effective_from: '2020-01-01', effective_to: null, source_reference: 'Gesellschaftsvertrag — calendar year', set_by: 'seed', created_at: ts(-300) },
  { id: 'pol-2', key: 'vat_filing_frequency', value: 'quarterly', effective_from: '2020-01-01', effective_to: null, source_reference: '§ 18 Abs. 2 UStG — CONFIRM with the Finanzamt', set_by: 'seed', created_at: ts(-300) },
  { id: 'pol-3', key: 'dauerfristverlaengerung', value: 'false', effective_from: '2020-01-01', effective_to: null, source_reference: '§§ 46–48 UStDV', set_by: 'seed', created_at: ts(-300) },
  { id: 'pol-4', key: 'vat_annual_return_month', value: '7', effective_from: '2020-01-01', effective_to: null, source_reference: '§ 149 Abs. 2 AO', set_by: 'seed', created_at: ts(-300) },
  { id: 'pol-5', key: 'tax_reserve_policy', value: 'estimate_less_paid', effective_from: '2020-01-01', effective_to: null, source_reference: 'management policy', set_by: 'seed', created_at: ts(-300) },
  { id: 'pol-6', key: 'local_levy_enabled', value: 'false', effective_from: '2020-01-01', effective_to: null, source_reference: 'Art. 3 Abs. 3 KAG Bayern — CONFIRM', set_by: 'seed', created_at: ts(-300) },
  { id: 'pol-7', key: 'small_business_scheme', value: 'false', effective_from: '2020-01-01', effective_to: null, source_reference: '§ 19 UStG — CONFIRM', set_by: 'seed', created_at: ts(-300) },
  { id: 'pol-8', key: 'default_shared_cost_allocation', value: 'occupied_nights', effective_from: '2020-01-01', effective_to: null, source_reference: 'management policy', set_by: 'seed', created_at: ts(-300) },
];

/* ── Derived views, computed the way the SQL views are ─────────────── */

const catOf = (code: string) => CATEGORIES.find((c) => c.code === code);
const codeOf = (code: string) => TAX_CODES.find((c) => c.code === code)!;

function ledger() {
  const txById = new Map(TX.map((t) => [t.id, t]));
  return LINES.map((l) => ({ l, t: txById.get(l.transaction_id)! }));
}

function plMonthly(from: string, to: string): PlMonthlyRow[] {
  const m = new Map<string, PlMonthlyRow>();
  for (const { l, t } of ledger()) {
    if (t.booked_on < from || t.booked_on >= to) continue;
    const cat = catOf(l.category)!;
    const unit = l.unit_id ?? t.unit_id;
    const key = `${monthKey(t.booked_on)}|${cat.plGroup}|${l.category}|${unit}|${t.channel}`;
    const row = m.get(key) ?? { period_key: monthKey(t.booked_on), pl_group: cat.plGroup, category: l.category, unit_id: unit, channel: t.channel, revenue_net_cents: 0, expense_net_cents: 0, net_cents: 0, gross_cents: 0, transactions: 0 };
    if (cat.kind === 'revenue') row.revenue_net_cents += l.net_cents; else if (cat.kind === 'expense') row.expense_net_cents += l.net_cents;
    row.net_cents += l.net_cents; row.gross_cents += l.gross_cents; row.transactions += 1;
    m.set(key, row);
  }
  return Array.from(m.values());
}

function vatMonthly(from: string, to: string): VatMonthlyRow[] {
  const m = new Map<string, VatMonthlyRow>();
  for (const { l, t } of ledger()) {
    if (t.booked_on < from || t.booked_on >= to) continue;
    const code = codeOf(l.tax_code);
    const key = `${monthKey(t.booked_on)}|${l.tax_code}`;
    const row = m.get(key) ?? { period_key: monthKey(t.booked_on), tax_code: l.tax_code, treatment: code.treatment, rate_bp: l.rate_bp, output_basis_cents: 0, output_vat_cents: 0, input_basis_cents: 0, input_vat_cents: 0, non_deductible_vat_cents: 0, review_vat_cents: 0, rc_basis_cents: 0, rc_output_vat_cents: 0, rc_input_vat_cents: 0, lines_needing_review: 0 };
    const isOut = ['revenue', 'refund', 'credit_note'].includes(t.kind);
    if (isOut) { row.output_basis_cents += l.net_cents; row.output_vat_cents += l.vat_cents; }
    else if (['deductible', 'partially_deductible'].includes(l.input_vat_treatment)) { row.input_basis_cents += l.net_cents; row.input_vat_cents += Math.round((l.vat_cents * l.deductible_bp) / 10000); }
    else if (l.input_vat_treatment === 'not_deductible') row.non_deductible_vat_cents += l.vat_cents;
    else if (['review_required', 'unknown'].includes(l.input_vat_treatment)) row.review_vat_cents += l.vat_cents;
    if (code.treatment === 'reverse_charge') { row.rc_basis_cents += l.net_cents; row.rc_input_vat_cents += Math.round((l.reverse_charge_vat_cents * l.deductible_bp) / 10000); }
    row.rc_output_vat_cents += l.reverse_charge_vat_cents;
    if (l.classification === 'needs_review' || l.classification === 'suggested') row.lines_needing_review += 1;
    m.set(key, row);
  }
  return Array.from(m.values());
}

function cashMonthly(from: string, to: string): CashMonthlyRow[] {
  const m = new Map<string, CashMonthlyRow>();
  for (const p of PAYMENTS) {
    const day = p.occurred_at.slice(0, 10);
    if (day < from || day >= to || p.reconciliation_state === 'ignored') continue;
    const key = `${monthKey(day)}|${p.source}|${p.kind}|${p.direction}|${p.account_id}`;
    const row = m.get(key) ?? { period_key: monthKey(day), source: p.source, kind: p.kind, direction: p.direction, account_id: p.account_id, net_cents: 0, gross_cents: 0, fee_cents: 0, payments: 0 };
    row.net_cents += p.direction === 'in' ? p.amount_cents : -p.amount_cents; row.gross_cents += p.amount_cents; row.fee_cents += p.fee_cents; row.payments += 1;
    m.set(key, row);
  }
  return Array.from(m.values());
}

function unitMonthly(from: string, to: string): UnitMonthlyRow[] {
  const m = new Map<string, UnitMonthlyRow>();
  for (const { l, t } of ledger()) {
    const unit = l.unit_id ?? t.unit_id;
    if (!unit || t.booked_on < from || t.booked_on >= to) continue;
    const key = `${monthKey(t.booked_on)}|${unit}|${l.category}`;
    const row = m.get(key) ?? { period_key: monthKey(t.booked_on), unit_id: unit, category: l.category, pl_group: catOf(l.category)!.plGroup, net_cents: 0, transactions: 0 };
    row.net_cents += l.net_cents; row.transactions += 1;
    m.set(key, row);
  }
  return Array.from(m.values());
}

function exceptionCounts(): ExceptionCountsRow {
  const posted = TX.filter((t) => t.status === 'posted');
  const postedIds = new Set(posted.map((t) => t.id));
  const pl = LINES.filter((l) => postedIds.has(l.transaction_id));
  const kindOf = (l: LineRow) => TX.find((t) => t.id === l.transaction_id)!.kind;
  const open = posted.filter((t) => t.review_state === 'needs_review' || t.review_state === 'suggested' || t.document_state === 'missing' || ['mismatch', 'needs_review'].includes(t.reconciliation_state));
  return {
    missing_documents: posted.filter((t) => t.document_state === 'missing' && ['expense', 'commission', 'fee'].includes(t.kind)).length,
    lines_needing_review: pl.filter((l) => ['needs_review', 'suggested'].includes(l.classification)).length,
    tax_code_review: pl.filter((l) => l.tax_code === 'DE_REVIEW_REQUIRED').length,
    input_vat_review: pl.filter((l) => ['review_required', 'unknown'].includes(l.input_vat_treatment) && !['revenue', 'refund', 'credit_note'].includes(kindOf(l))).length,
    mismatches: posted.filter((t) => t.reconciliation_state === 'mismatch').length,
    unreconciled_revenue: posted.filter((t) => ['unmatched', 'needs_review'].includes(t.reconciliation_state) && ['revenue', 'refund'].includes(t.kind) && t.booked_on <= today).length,
    unmatched_payments: PAYMENTS.filter((p) => ['unmatched', 'needs_review'].includes(p.reconciliation_state)).length,
    unallocated_expense_lines: pl.filter((l) => l.allocation_method === 'unallocated' && kindOf(l) === 'expense').length,
    asset_candidates: pl.filter((l) => l.asset_state === 'candidate').length,
    failed_imports: IMPORTS.filter((b) => b.status === 'failed').length,
    minibar_open_charges: MOVEMENTS.filter((m) => ['unpaid', 'needs_review'].includes(m.charge_state)).length,
    oldest_open_item: open.map((t) => t.posted_at).sort()[0] ?? null,
  };
}

function stock(): MinibarStockRow[] {
  return PRODUCTS.map((p) => {
    const mv = MOVEMENTS.filter((m) => m.product_id === p.id);
    const onHand = mv.reduce((s, m) => s + m.quantity, 0);
    return { product_id: p.id, sku: p.sku, name: p.name, active: p.active, reorder_threshold: p.reorder_threshold, purchase_cost_cents: p.purchase_cost_cents, selling_price_cents: p.selling_price_cents, tax_code: p.tax_code, unit_id: p.unit_id, on_hand: onHand, units_sold: mv.filter((m) => m.movement === 'sale').reduce((s, m) => s - m.quantity, 0), shrinkage_units: mv.filter((m) => ['waste', 'adjustment', 'correction'].includes(m.movement)).reduce((s, m) => s + m.quantity, 0), complimentary_units: mv.filter((m) => m.movement === 'complimentary').reduce((s, m) => s - m.quantity, 0), stock_value_cents: onHand * p.purchase_cost_cents };
  });
}

export const FIXTURE_COUNTERPARTIES: CounterpartyRow[] = Object.values(CP);

/** Exposed for tests: the raw synthetic ledger. */
export function fixtureLedger() {
  return { transactions: TX, lines: LINES, payments: PAYMENTS, reconciliations: RECON, documents: DOCS, stays: STAY_ROWS, movements: MOVEMENTS, products: PRODUCTS };
}

export function fixtureFinanceSource(): FinanceRowSource {
  const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;
  return {
    async ping() { return true; },
    async taxCodes() { return TAX_CODES.map((c) => ({ code: c.code, label: c.label, description: c.description, side: c.side, treatment: c.treatment, rate_bp: c.rateBp, reverse_charge: c.reverseCharge, review_required: c.reviewRequired, effective_from: c.effectiveFrom, effective_to: c.effectiveTo, legal_reference: c.legalReference, source_url: c.sourceUrl, active: true })); },
    async categories() { return CATEGORIES.map((c) => ({ code: c.code, label: c.label, pl_group: c.plGroup, kind: c.kind, default_tax_code: c.defaultTaxCode, asset_candidate: c.assetCandidate, requires_unit: c.requiresUnit, datev_account_skr03: c.code === 'accommodation_revenue' ? '8110' : null, datev_account_skr04: c.code === 'accommodation_revenue' ? '4110' : null, datev_confirmed: false, sort_order: c.sortOrder, active: true })); },
    async taxRates() { return TAX_RATE_SEED.map((r, i) => ({ id: `rate-${i}`, tax_type: r.taxType, jurisdiction: r.jurisdiction, rate_bp: r.rateBp, effective_from: r.effectiveFrom, effective_to: r.effectiveTo, legal_reference: r.legalReference, source_url: r.sourceUrl, review_required: r.reviewRequired, note: r.note })); },
    async policy() { return clone(POLICY); },
    async periods() { return clone(PERIODS).sort((a, b) => b.period_key.localeCompare(a.period_key)); },
    async counterparties() { return clone(FIXTURE_COUNTERPARTIES); },
    async accounts() { return clone(ACCOUNTS); },
    async transactions(q: TransactionQuery) {
      let rows = TX.filter((t) => (!q.from || t.booked_on >= q.from) && (!q.to || t.booked_on < q.to) && (!q.kind || t.kind === q.kind) && (!q.sourceType || t.source_type === q.sourceType) && (!q.unitId || t.unit_id === q.unitId)
        && (!q.reviewState || t.review_state === q.reviewState) && (!q.documentState || t.document_state === q.documentState) && (!q.reconciliationState || t.reconciliation_state === q.reconciliationState) && (!q.paymentState || t.payment_state === q.paymentState)
        && (!q.channel || t.channel === q.channel) && (!q.counterpartyId || t.counterparty_id === q.counterpartyId) && (!q.status || t.status === q.status)
        && (q.minGrossCents === null || q.minGrossCents === undefined || t.gross_cents >= q.minGrossCents) && (q.maxGrossCents === null || q.maxGrossCents === undefined || t.gross_cents <= q.maxGrossCents));
      if (q.search) { const s = q.search.toLowerCase(); rows = rows.filter((t) => [t.description, t.counterparty_label, t.booking_reference, t.supplier_invoice_no].some((x) => x?.toLowerCase().includes(s))); }
      if (q.category || q.taxCode) { const ids = new Set(LINES.filter((l) => (!q.category || l.category === q.category) && (!q.taxCode || l.tax_code === q.taxCode)).map((l) => l.transaction_id)); rows = rows.filter((t) => ids.has(t.id)); }
      const sort = q.sort ?? 'booked_desc';
      rows.sort((a, b) => sort.startsWith('amount') ? (sort.endsWith('asc') ? a.gross_cents - b.gross_cents : b.gross_cents - a.gross_cents) : (sort.endsWith('asc') ? a.booked_on.localeCompare(b.booked_on) : b.booked_on.localeCompare(a.booked_on)) || b.posted_at.localeCompare(a.posted_at));
      const start = (q.page - 1) * q.pageSize;
      return { rows: clone(rows.slice(start, start + q.pageSize)), total: rows.length };
    },
    async transaction(id) { return clone(TX.find((t) => t.id === id) ?? null); },
    async transactionsByBooking(intentId) { return clone(TX.filter((t) => t.booking_intent_id === intentId)); },
    async lines(ids) { const s = new Set(ids); return clone(LINES.filter((l) => s.has(l.transaction_id))); },
    async linesByFilter(f) {
      const kinds = f.kinds ? new Set(f.kinds) : null;
      return clone(ledger().filter(({ l, t }) => t.booked_on >= f.from && t.booked_on < f.to && (!f.category || l.category === f.category) && (!f.unitId || (l.unit_id ?? t.unit_id) === f.unitId) && (!f.taxCode || l.tax_code === f.taxCode) && (!f.classification || l.classification === f.classification) && (!f.assetState || l.asset_state === f.assetState) && (!kinds || kinds.has(t.kind))).map(({ l, t }) => ({ ...l, transaction: t })));
    },
    async overrides(ids) { const s = new Set(ids); return clone(OVERRIDES.filter((o) => s.has(o.target_id))); },
    async payments(q) {
      const rows = PAYMENTS.filter((p) => (!q.from || p.occurred_at.slice(0, 10) >= q.from) && (!q.to || p.occurred_at.slice(0, 10) < q.to) && (!q.source || p.source === q.source) && (!q.reconciliationState || p.reconciliation_state === q.reconciliationState)).sort((a, b) => b.occurred_at.localeCompare(a.occurred_at));
      const start = (q.page - 1) * q.pageSize;
      return { rows: clone(rows.slice(start, start + q.pageSize)), total: rows.length };
    },
    async payment(id) { return clone(PAYMENTS.find((p) => p.id === id) ?? null); },
    async paymentsByBooking(intentId) { return clone(PAYMENTS.filter((p) => p.booking_intent_id === intentId)); },
    async unmatchedPayments(limit) { return clone(PAYMENTS.filter((p) => ['unmatched', 'needs_review', 'partially_matched'].includes(p.reconciliation_state)).slice(0, limit)); },
    async openTransactionsForMatching(limit) { return clone(TX.filter((t) => t.status === 'posted' && ['unmatched', 'needs_review', 'partially_matched'].includes(t.reconciliation_state)).slice(0, limit)); },
    async reconciliations(f) {
      if (!f.transactionIds && !f.paymentIds) return clone(RECON.filter((r) => r.state === 'needs_review'));
      const t = new Set(f.transactionIds ?? []), p = new Set(f.paymentIds ?? []);
      return clone(RECON.filter((r) => (r.transaction_id && t.has(r.transaction_id)) || (r.payment_id && p.has(r.payment_id))));
    },
    async documents(q) {
      const rows = DOCS.filter((x) => (!q.type || x.document_type === q.type) && (!q.reviewState || x.review_state === q.reviewState) && (!q.search || x.original_filename.toLowerCase().includes(q.search.toLowerCase()))).sort((a, b) => b.received_at.localeCompare(a.received_at));
      const start = (q.page - 1) * q.pageSize;
      return { rows: clone(rows.slice(start, start + q.pageSize)), total: rows.length };
    },
    async document(id) { return clone(DOCS.find((x) => x.id === id) ?? null); },
    async documentLinks(f) {
      if (f.documentIds) { const s = new Set(f.documentIds); return clone(DOC_LINKS.filter((l) => s.has(l.document_id))); }
      if (f.targets) { const s = new Set(f.targets.map((t) => t.id)); return clone(DOC_LINKS.filter((l) => s.has(l.target_id))); }
      return [];
    },
    async invoices(q) { const rows = INVOICES.filter((i) => !q.status || i.status === q.status); return { rows: clone(rows), total: rows.length }; },
    async invoice(id) { const invoice = INVOICES.find((i) => i.id === id); return invoice ? { invoice: clone(invoice), lines: clone(INVOICE_LINES.filter((l) => l.invoice_id === id)) } : null; },
    async invoicesByBooking(intentId) { return clone(INVOICES.filter((i) => i.booking_intent_id === intentId)); },
    async taxPeriods() { return clone(TAX_PERIODS); },
    async taxEstimates(ids) { return clone(ids ? TAX_ESTIMATES.filter((e) => ids.includes(e.tax_period_id)) : TAX_ESTIMATES); },
    async taxAdjustments() { return clone(TAX_ADJUSTMENTS); },
    async taxNotices() { return clone(TAX_NOTICES); },
    async taxPayments() { return clone(TAX_PAYMENTS); },
    async reserves() { return clone(RESERVES).sort((a, b) => b.created_at.localeCompare(a.created_at)); },
    async assets() { return clone(ASSETS); },
    async exports(limit) { return clone(EXPORTS.slice(0, limit)); },
    async importBatches(limit) { return clone(IMPORTS.slice(0, limit)); },
    async importBatch(id) { const batch = IMPORTS.find((b) => b.id === id); return batch ? { batch: clone(batch), rows: clone(IMPORT_ROWS.filter((r) => r.batch_id === id)) } : null; },
    async minibarProducts() { return clone(PRODUCTS); },
    async minibarStock() { return stock(); },
    async minibarMovements(limit, productId) { return clone(MOVEMENTS.filter((m) => !productId || m.product_id === productId).sort((a, b) => b.occurred_on.localeCompare(a.occurred_on) || b.created_at.localeCompare(a.created_at)).slice(0, limit)); },
    async turnoverCosts(f) { return clone(TURNOVER_COSTS.filter((t) => (!f.from || t.departure >= f.from) && (!f.to || t.departure < f.to) && (!f.state || t.state === f.state))); },
    async plMonthly(from, to) { return plMonthly(from, to); },
    async vatMonthly(from, to) { return vatMonthly(from, to); },
    async cashMonthly(from, to) { return cashMonthly(from, to); },
    async unitMonthly(from, to) { return unitMonthly(from, to); },
    async exceptionCounts() { return exceptionCounts(); },
    async stays(from, to) { return clone(STAY_ROWS.filter((s) => s.check_in < to && s.check_out > from)); },
    async units() { return clone(FIXTURE_UNITS); },
    async ingestionSignals() { return [{ signal: 'booking_ingestion.success', observed_at: ts(0, 6), detail: '7 stays, 0 new' }, { signal: 'import.booking_com_reservations.success', observed_at: ts(-29), detail: 'reservations-2026-08.csv' }, { signal: 'import.paypal_activity.success', observed_at: ts(-1), detail: '11 rows' }, { signal: 'reconciliation.success', observed_at: ts(0, 6), detail: '2 proposals' }]; },
  };
}
