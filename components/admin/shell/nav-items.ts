/**
 * The navigation, as data. Three groups, fifteen destinations, nothing that does
 * not exist yet. A module is added here when it has genuine value, not
 * before.
 */

export type NavIcon = 'overview' | 'calendar' | 'bookings' | 'operations' | 'cleaning' | 'automations' | 'properties' | 'payments' | 'system' | 'finance' | 'inbox' | 'transactions' | 'taxes' | 'reports' | 'accountant';

export interface NavItem {
  href: string;
  label: string;
  icon: NavIcon;
  /** Matches the pathname prefix so nested routes keep their parent lit. */
  match: (pathname: string) => boolean;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

const startsWith = (prefix: string) => (pathname: string) => pathname === prefix || pathname.startsWith(`${prefix}/`);

export const NAV_GROUPS: NavGroup[] = [
  {
    label: 'Overview',
    items: [
      { href: '/admin', label: 'Today', icon: 'overview', match: (p) => p === '/admin' },
      { href: '/admin/calendar', label: 'Calendar', icon: 'calendar', match: startsWith('/admin/calendar') },
      { href: '/admin/bookings', label: 'Bookings', icon: 'bookings', match: startsWith('/admin/bookings') },
    ],
  },
  {
    label: 'Operations',
    items: [
      { href: '/admin/operations', label: 'Attention', icon: 'operations', match: startsWith('/admin/operations') },
      { href: '/admin/cleaning', label: 'Cleaning', icon: 'cleaning', match: startsWith('/admin/cleaning') },
      { href: '/admin/automations', label: 'Automations', icon: 'automations', match: startsWith('/admin/automations') },
      { href: '/admin/properties', label: 'Properties', icon: 'properties', match: startsWith('/admin/properties') },
      { href: '/admin/payments', label: 'Payments', icon: 'payments', match: startsWith('/admin/payments') },
      { href: '/admin/system', label: 'System', icon: 'system', match: startsWith('/admin/system') },
    ],
  },
  {
    // Finance is a separate domain (docs/finance/architecture.md). Six
    // destinations here; the finance layout carries the full section list.
    label: 'Finance',
    items: [
      { href: '/admin/finance', label: 'Finance', icon: 'finance', match: (p) => p === '/admin/finance' },
      { href: '/admin/finance/inbox', label: 'Finance inbox', icon: 'inbox', match: startsWith('/admin/finance/inbox') },
      { href: '/admin/finance/transactions', label: 'Transactions', icon: 'transactions', match: startsWith('/admin/finance/transactions') },
      { href: '/admin/finance/taxes', label: 'VAT & taxes', icon: 'taxes', match: (p) => p.startsWith('/admin/finance/taxes') || p.startsWith('/admin/finance/vat') },
      { href: '/admin/finance/profit-loss', label: 'Reports', icon: 'reports', match: (p) => ['/admin/finance/profit-loss', '/admin/finance/cash-flow', '/admin/finance/properties', '/admin/finance/revenue', '/admin/finance/expenses'].some((x) => p.startsWith(x)) },
      { href: '/admin/finance/accountant', label: 'Accountant', icon: 'accountant', match: startsWith('/admin/finance/accountant') },
    ],
  },
];

/** Every finance section, for the finance layout's sub-navigation. */
export const FINANCE_SECTIONS: Array<{ href: string; label: string; short?: string }> = [
  { href: '/admin/finance', label: 'Overview' },
  { href: '/admin/finance/inbox', label: 'Inbox' },
  { href: '/admin/finance/revenue', label: 'Revenue' },
  { href: '/admin/finance/expenses', label: 'Expenses' },
  { href: '/admin/finance/transactions', label: 'Transactions' },
  { href: '/admin/finance/documents', label: 'Documents' },
  { href: '/admin/finance/vat', label: 'VAT' },
  { href: '/admin/finance/taxes', label: 'Taxes' },
  { href: '/admin/finance/profit-loss', label: 'Profit & loss', short: 'P&L' },
  { href: '/admin/finance/cash-flow', label: 'Cash flow' },
  { href: '/admin/finance/properties', label: 'Properties' },
  { href: '/admin/finance/reconciliation', label: 'Reconciliation' },
  { href: '/admin/finance/minibar', label: 'Minibar' },
  { href: '/admin/finance/invoices', label: 'Invoices' },
  { href: '/admin/finance/imports', label: 'Imports' },
  { href: '/admin/finance/accountant', label: 'Accountant' },
  { href: '/admin/finance/settings', label: 'Settings' },
];

export const ALL_NAV_ITEMS: NavItem[] = NAV_GROUPS.flatMap((g) => g.items);
