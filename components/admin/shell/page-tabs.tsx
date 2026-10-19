'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

/** Tabs between the pages of one destination — the same place, seen two ways. */
export function PageTabs({ tabs, label }: { tabs: Array<{ href: string; label: string }>; label: string }) {
  const pathname = usePathname();
  return (
    <nav className="bc-page-tabs" aria-label={label}>
      {tabs.map((t) => (
        <Link key={t.href} href={t.href} aria-current={pathname === t.href || pathname.startsWith(`${t.href}/`) ? 'page' : undefined}>
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
