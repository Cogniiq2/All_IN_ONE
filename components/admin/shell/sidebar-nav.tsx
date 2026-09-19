'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { NAV_GROUPS } from '@/components/admin/shell/nav-items';
import { Icon } from '@/components/admin/shell/nav-icon';

const useIsomorphicLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

/**
 * The navigation list with a single gliding marker.
 *
 * The marker is one absolutely positioned hairline whose `--marker-y` is
 * measured from the active item's offset. A route change moves it on the
 * brand curve; only `transform` is animated. The list itself is plain links
 * with `aria-current`, so keyboard and assistive users get exactly what the
 * marker shows.
 */
export function SidebarNav({ attentionCount, onNavigate }: { attentionCount: number; onNavigate?: () => void }) {
  const pathname = usePathname();
  const navRef = useRef<HTMLElement>(null);
  const [marker, setMarker] = useState<{ y: number; visible: boolean }>({ y: 0, visible: false });

  useIsomorphicLayoutEffect(() => {
    const nav = navRef.current;
    if (!nav) return;
    const active = nav.querySelector<HTMLElement>('[aria-current="page"]');
    if (!active) {
      setMarker((m) => ({ ...m, visible: false }));
      return;
    }
    const navTop = nav.getBoundingClientRect().top;
    const rect = active.getBoundingClientRect();
    setMarker({ y: rect.top - navTop + nav.scrollTop + (rect.height - 22) / 2, visible: true });
  }, [pathname]);

  return (
    <nav ref={navRef} className="bc-nav" aria-label="Sections">
      <span
        className="bc-nav-marker"
        style={{ ['--marker-y' as string]: `${marker.y}px`, ['--marker-opacity' as string]: marker.visible ? 1 : 0 }}
        aria-hidden="true"
      />
      {NAV_GROUPS.map((group) => (
        <div key={group.label} role="group" aria-labelledby={`nav-${group.label}`}>
          <div id={`nav-${group.label}`} className="bc-nav-group">
            {group.label}
          </div>
          {group.items.map((item) => {
            const active = item.match(pathname);
            const count = item.icon === 'operations' && attentionCount > 0 ? attentionCount : null;
            return (
              <Link key={item.href} href={item.href} className="bc-nav-item" aria-current={active ? 'page' : undefined} onClick={onNavigate}>
                <Icon name={item.icon} />
                <span>{item.label}</span>
                {count !== null && (
                  <span className="bc-nav-count" data-tone="critical" aria-label={`${count} items need attention`}>
                    {count > 99 ? '99+' : count}
                  </span>
                )}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
