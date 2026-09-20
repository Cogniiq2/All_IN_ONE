'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { FINANCE_SECTIONS } from '@/components/admin/shell/nav-items';

export function FinanceSubnav() {
  const pathname = usePathname();
  return (
    <nav className="bc-fin-subnav" aria-label="Finance sections">
      {FINANCE_SECTIONS.map((s) => {
        const active = s.href === '/admin/finance' ? pathname === s.href : pathname === s.href || pathname.startsWith(`${s.href}/`);
        return (
          <Link key={s.href} href={s.href} aria-current={active ? 'page' : undefined}>
            {s.label}
          </Link>
        );
      })}
    </nav>
  );
}
