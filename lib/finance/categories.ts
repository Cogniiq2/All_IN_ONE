/**
 * Management P&L categories — the catalogue mirrored from the migration.
 * The database rows are the runtime truth; this mirror serves pure code and
 * the fixtures, and a test proves both agree.
 *
 * `plGroup` decides where a category lands in the management P&L
 * (docs/finance/architecture.md §P&L). Categories are NOT statutory
 * accounts; the DATEV mapping is a proposal the accountant confirms.
 */

export type PlGroup = 'revenue' | 'direct_cost' | 'property_cost' | 'company_cost' | 'depreciation' | 'interest' | 'other_adjustment' | 'tax' | 'balance' | 'excluded';
export type CategoryKind = 'revenue' | 'expense' | 'neutral';

export interface Category {
  code: string;
  label: string;
  plGroup: PlGroup;
  kind: CategoryKind;
  defaultTaxCode: string | null;
  assetCandidate: boolean;
  requiresUnit: boolean;
  sortOrder: number;
}

const c = (code: string, label: string, plGroup: PlGroup, kind: CategoryKind, defaultTaxCode: string | null, sortOrder: number, assetCandidate = false, requiresUnit = false): Category => ({
  code, label, plGroup, kind, defaultTaxCode, assetCandidate, requiresUnit, sortOrder,
});

export const CATEGORIES: readonly Category[] = [
  c('accommodation_revenue', 'Accommodation', 'revenue', 'revenue', 'DE_ACCOMMODATION_REDUCED', 10, false, true),
  c('accommodation_ancillary', 'Accommodation ancillary', 'revenue', 'revenue', 'DE_ANCILLARY_REVIEW', 11, false, true),
  c('minibar_sales', 'Minibar sales', 'revenue', 'revenue', null, 12, false, true),
  c('other_guest_charges', 'Other guest charges', 'revenue', 'revenue', 'DE_REVIEW_REQUIRED', 13, false, true),
  c('other_revenue', 'Other revenue', 'revenue', 'revenue', 'DE_REVIEW_REQUIRED', 19),
  c('cleaning', 'Cleaning', 'direct_cost', 'expense', 'DE_STANDARD', 20, false, true),
  c('laundry', 'Laundry', 'direct_cost', 'expense', 'DE_STANDARD', 21, false, true),
  c('guest_supplies', 'Guest supplies', 'direct_cost', 'expense', 'DE_REVIEW_REQUIRED', 22, false, true),
  c('minibar_purchases', 'Minibar purchases', 'direct_cost', 'expense', 'DE_REVIEW_REQUIRED', 23),
  c('minibar_cogs', 'Minibar cost of goods sold', 'direct_cost', 'expense', 'DE_OUTSIDE_SCOPE', 24, false, true),
  c('ota_commission', 'OTA commission', 'direct_cost', 'expense', 'DE_REVERSE_CHARGE', 25, false, true),
  c('ota_fees', 'OTA fees', 'direct_cost', 'expense', 'DE_REVIEW_REQUIRED', 26, false, true),
  c('payment_fees', 'Payment processing fees', 'direct_cost', 'expense', 'DE_EXEMPT', 27, false, true),
  c('repairs', 'Repairs', 'property_cost', 'expense', 'DE_STANDARD', 30, false, true),
  c('maintenance', 'Maintenance', 'property_cost', 'expense', 'DE_STANDARD', 31, false, true),
  c('furniture', 'Furniture', 'property_cost', 'expense', 'DE_STANDARD', 32, true, true),
  c('equipment', 'Equipment & appliances', 'property_cost', 'expense', 'DE_STANDARD', 33, true, true),
  c('utilities', 'Utilities', 'property_cost', 'expense', 'DE_REVIEW_REQUIRED', 34, false, true),
  c('electricity', 'Electricity', 'property_cost', 'expense', 'DE_STANDARD', 35, false, true),
  c('heating', 'Heating', 'property_cost', 'expense', 'DE_REVIEW_REQUIRED', 36, false, true),
  c('water', 'Water & waste water', 'property_cost', 'expense', 'DE_REVIEW_REQUIRED', 37, false, true),
  c('internet', 'Internet & TV', 'property_cost', 'expense', 'DE_STANDARD', 38, false, true),
  c('insurance', 'Insurance', 'property_cost', 'expense', 'DE_EXEMPT', 39, false, true),
  c('property_costs', 'Property costs (rent, HOA, ground)', 'property_cost', 'expense', 'DE_REVIEW_REQUIRED', 40, false, true),
  c('software', 'Software / SaaS', 'company_cost', 'expense', 'DE_REVIEW_REQUIRED', 50),
  c('marketing', 'Marketing', 'company_cost', 'expense', 'DE_REVIEW_REQUIRED', 51),
  c('advertising', 'Advertising', 'company_cost', 'expense', 'DE_REVIEW_REQUIRED', 52),
  c('professional_services', 'Professional services', 'company_cost', 'expense', 'DE_STANDARD', 53),
  c('tax_adviser', 'Tax adviser', 'company_cost', 'expense', 'DE_STANDARD', 54),
  c('legal', 'Legal', 'company_cost', 'expense', 'DE_STANDARD', 55),
  c('bank_fees', 'Bank fees', 'company_cost', 'expense', 'DE_EXEMPT', 56),
  c('office_admin', 'Office & administration', 'company_cost', 'expense', 'DE_REVIEW_REQUIRED', 57),
  c('travel', 'Travel', 'company_cost', 'expense', 'DE_REVIEW_REQUIRED', 58),
  c('depreciation', 'Depreciation (management)', 'depreciation', 'expense', 'DE_OUTSIDE_SCOPE', 70),
  c('interest', 'Interest', 'interest', 'expense', 'DE_EXEMPT', 71),
  c('other_adjustment', 'Other adjustments', 'other_adjustment', 'neutral', 'DE_OUTSIDE_SCOPE', 72),
  c('taxes_non_operating', 'Company taxes (KSt, Soli, GewSt)', 'tax', 'expense', 'DE_OUTSIDE_SCOPE', 80),
  c('vat_settlement', 'VAT settlement (payment / refund)', 'balance', 'neutral', 'DE_OUTSIDE_SCOPE', 90),
  c('asset_acquisition', 'Fixed asset acquisition (balance)', 'balance', 'neutral', 'DE_STANDARD', 91, true, true),
  c('other', 'Other', 'company_cost', 'expense', 'DE_REVIEW_REQUIRED', 99),
];

const BY_CODE = new Map(CATEGORIES.map((x) => [x.code, x]));

export function category(code: string): Category | undefined {
  return BY_CODE.get(code);
}

export function categoryLabel(code: string): string {
  return BY_CODE.get(code)?.label ?? code;
}

export const PL_GROUP_LABEL: Readonly<Record<PlGroup, string>> = {
  revenue: 'Revenue',
  direct_cost: 'Direct operating costs',
  property_cost: 'Property operating costs',
  company_cost: 'General company costs',
  depreciation: 'Depreciation',
  interest: 'Interest',
  other_adjustment: 'Other adjustments',
  tax: 'Company taxes',
  balance: 'Balance items (not P&L)',
  excluded: 'Excluded',
};

/** Categories that belong in the management P&L (balance items are not). */
export function isPlCategory(code: string): boolean {
  const g = BY_CODE.get(code)?.plGroup;
  return g !== undefined && g !== 'balance' && g !== 'excluded';
}
