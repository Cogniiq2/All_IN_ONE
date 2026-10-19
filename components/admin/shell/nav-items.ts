/**
 * The navigation, as data. Six destinations in the order a day is run —
 * today, the calendar, the bookings, the cleaning, the money, the
 * apartments — each a place nothing else duplicates. What needs a person is
 * not a destination but a signal: the "Needs you" row above the list.
 * Everything a day does not need sits behind a collapsed group.
 */

export type NavIcon = 'overview' | 'calendar' | 'bookings' | 'reservations' | 'performance' | 'operations' | 'cleaning' | 'automations' | 'properties' | 'payments' | 'system' | 'finance' | 'inbox' | 'transactions' | 'taxes' | 'reports' | 'accountant';

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
  /** Folded away until opened (or until one of its pages is the current one). */
  collapsible?: boolean;
}

const startsWith = (prefix: string) => (pathname: string) => pathname === prefix || pathname.startsWith(`${prefix}/`);

/** Where the attention signal leads. */
export const ATTENTION_ITEM: NavItem = { href: '/admin/operations', label: 'Needs you', icon: 'operations', match: startsWith('/admin/operations') };

export const NAV_GROUPS: NavGroup[] = [
  {
    label: 'Daily',
    items: [
      { href: '/admin', label: 'Today', icon: 'overview', match: (p) => p === '/admin' },
      { href: '/admin/calendar', label: 'Calendar', icon: 'calendar', match: startsWith('/admin/calendar') },
      { href: '/admin/reservations', label: 'Reservations', icon: 'reservations', match: startsWith('/admin/reservations') },
      { href: '/admin/cleaning', label: 'Cleaning', icon: 'cleaning', match: startsWith('/admin/cleaning') },
      // Finance is a separate domain (docs/finance/architecture.md); its own
      // layout carries the grouped section list.
      { href: '/admin/finance', label: 'Money', icon: 'finance', match: startsWith('/admin/finance') },
      // Apartments holds the per-apartment view and its performance over time.
      { href: '/admin/properties', label: 'Apartments', icon: 'properties', match: (p) => startsWith('/admin/properties')(p) || startsWith('/admin/performance')(p) },
    ],
  },
  {
    label: 'Behind the scenes',
    collapsible: true,
    items: [
      // Direct booking is switched off (DIRECT_BOOKING_ENABLED=false): its pages stay reachable, out of the way.
      { href: '/admin/bookings', label: 'Direct bookings', icon: 'bookings', match: startsWith('/admin/bookings') },
      { href: '/admin/payments', label: 'Payments', icon: 'payments', match: startsWith('/admin/payments') },
      { href: '/admin/automations', label: 'Automations', icon: 'automations', match: startsWith('/admin/automations') },
      { href: '/admin/system', label: 'System', icon: 'system', match: startsWith('/admin/system') },
    ],
  },
];

/** Tabs shared by the Apartments destination. */
export const APARTMENT_TABS: Array<{ href: string; label: string }> = [
  { href: '/admin/properties', label: 'Apartments' },
  { href: '/admin/performance', label: 'Performance' },
];

/**
 * Money, in six groups. Each section belongs to exactly one; the labels are
 * the owner's words (routes unchanged, so every existing link still works).
 */
export const FINANCE_GROUPS: Array<{ label: string; sections: Array<{ href: string; label: string; short?: string }> }> = [
  { label: 'Overview', sections: [{ href: '/admin/finance', label: 'Overview' }, { href: '/admin/finance/inbox', label: 'To do' }] },
  {
    label: 'Income',
    sections: [
      { href: '/admin/finance/revenue', label: 'Revenue' },
      { href: '/admin/finance/booking-com', label: 'Booking.com payouts' },
      { href: '/admin/finance/invoices', label: 'Invoices' },
      { href: '/admin/finance/minibar', label: 'Minibar' },
    ],
  },
  { label: 'Costs', sections: [{ href: '/admin/finance/expenses', label: 'Expenses' }, { href: '/admin/finance/documents', label: 'Receipts & documents' }] },
  {
    label: 'Tax',
    sections: [
      { href: '/admin/finance/vat', label: 'VAT return' },
      { href: '/admin/finance/taxes', label: 'Company taxes' },
      { href: '/admin/finance/accountant', label: 'For the accountant' },
    ],
  },
  {
    label: 'Reports',
    sections: [
      { href: '/admin/finance/profit-loss', label: 'Profit & loss', short: 'P&L' },
      { href: '/admin/finance/cash-flow', label: 'Cash flow' },
      { href: '/admin/finance/properties', label: 'By apartment' },
      { href: '/admin/finance/transactions', label: 'All entries' },
    ],
  },
  {
    label: 'Setup',
    sections: [
      { href: '/admin/finance/imports', label: 'Uploads' },
      { href: '/admin/finance/reconciliation', label: 'Bank matching' },
      { href: '/admin/finance/settings', label: 'Settings' },
    ],
  },
];

/** Every finance section, flat (command palette). */
export const FINANCE_SECTIONS: Array<{ href: string; label: string; short?: string }> = FINANCE_GROUPS.flatMap((g) => g.sections);

export const ALL_NAV_ITEMS: NavItem[] = [...NAV_GROUPS.flatMap((g) => g.items), ATTENTION_ITEM, { href: '/admin/performance', label: 'Performance', icon: 'performance', match: startsWith('/admin/performance') }];
