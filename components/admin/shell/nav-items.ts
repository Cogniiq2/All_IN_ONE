/**
 * The navigation, as data. Two groups: the owner's daily workflow first, in
 * the order a day is run — what is happening, the calendar, the bookings,
 * the cleaning, the money, the apartments — then everything an operator or
 * developer may need but a day does not. Nothing here that does not exist.
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
}

const startsWith = (prefix: string) => (pathname: string) => pathname === prefix || pathname.startsWith(`${prefix}/`);

export const NAV_GROUPS: NavGroup[] = [
  {
    label: 'Daily',
    items: [
      { href: '/admin', label: 'Overview', icon: 'overview', match: (p) => p === '/admin' },
      { href: '/admin/calendar', label: 'Calendar', icon: 'calendar', match: startsWith('/admin/calendar') },
      { href: '/admin/reservations', label: 'Reservations', icon: 'reservations', match: startsWith('/admin/reservations') },
      { href: '/admin/cleaning', label: 'Cleaning', icon: 'cleaning', match: startsWith('/admin/cleaning') },
      // Finance is a separate domain (docs/finance/architecture.md); its own
      // layout carries the full section list.
      { href: '/admin/finance', label: 'Finance', icon: 'finance', match: startsWith('/admin/finance') },
      { href: '/admin/properties', label: 'Properties', icon: 'properties', match: startsWith('/admin/properties') },
    ],
  },
  {
    label: 'More',
    items: [
      { href: '/admin/operations', label: 'Needs attention', icon: 'operations', match: startsWith('/admin/operations') },
      // Operating performance, deliberately outside Finance: gross booking
      // value from the channel manager is a different kind of truth from the
      // reconciled, VAT-correct figures Finance owns.
      { href: '/admin/performance', label: 'Performance', icon: 'performance', match: startsWith('/admin/performance') },
      { href: '/admin/bookings', label: 'Direct bookings', icon: 'bookings', match: startsWith('/admin/bookings') },
      { href: '/admin/payments', label: 'Payments', icon: 'payments', match: startsWith('/admin/payments') },
      { href: '/admin/automations', label: 'Automations', icon: 'automations', match: startsWith('/admin/automations') },
      { href: '/admin/system', label: 'System', icon: 'system', match: startsWith('/admin/system') },
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
  { href: '/admin/finance/booking-com', label: 'Booking.com' },
  { href: '/admin/finance/minibar', label: 'Minibar' },
  { href: '/admin/finance/invoices', label: 'Invoices' },
  { href: '/admin/finance/imports', label: 'Imports' },
  { href: '/admin/finance/accountant', label: 'Accountant' },
  { href: '/admin/finance/settings', label: 'Settings' },
];

export const ALL_NAV_ITEMS: NavItem[] = NAV_GROUPS.flatMap((g) => g.items);
