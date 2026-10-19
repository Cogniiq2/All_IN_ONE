'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { FINANCE_GROUPS } from '@/components/admin/shell/nav-items';

const isActive = (href: string, pathname: string) => (href === '/admin/finance' ? pathname === href : pathname === href || pathname.startsWith(`${href}/`));

/**
 * Money's navigation in two calm rows: six groups, then the pages of the
 * group you are in. Eighteen sections never appear at once.
 */
export function FinanceSubnav() {
  const pathname = usePathname();
  const current = FINANCE_GROUPS.find((g) => g.sections.some((s) => isActive(s.href, pathname))) ?? FINANCE_GROUPS[0];
  return (
    <nav className="bc-fin-nav" aria-label="Money sections">
      <div className="bc-fin-groups">
        {FINANCE_GROUPS.map((g) => (
          <Link key={g.label} href={g.sections[0].href} aria-current={g === current ? 'true' : undefined}>
            {g.label}
          </Link>
        ))}
      </div>
      {current.sections.length > 1 && (
        <div key={current.label} className="bc-fin-pages">
          {current.sections.map((s) => (
            <Link key={s.href} href={s.href} aria-current={isActive(s.href, pathname) ? 'page' : undefined}>
              {s.label}
            </Link>
          ))}
        </div>
      )}
    </nav>
  );
}
