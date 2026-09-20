/**
 * The navigation, as data. Two groups, nine destinations, nothing that does
 * not exist yet. A module is added here when it has genuine value, not
 * before.
 */

export type NavIcon = 'overview' | 'calendar' | 'bookings' | 'operations' | 'cleaning' | 'automations' | 'properties' | 'payments' | 'system';

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
];

export const ALL_NAV_ITEMS: NavItem[] = NAV_GROUPS.flatMap((g) => g.items);
