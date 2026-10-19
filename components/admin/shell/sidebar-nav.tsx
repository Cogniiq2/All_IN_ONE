'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ATTENTION_ITEM, NAV_GROUPS } from '@/components/admin/shell/nav-items';
import { Icon } from '@/components/admin/shell/nav-icon';
import { OPEN_PALETTE_EVENT } from '@/components/admin/shell/palette-event';

const useIsomorphicLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

/**
 * The navigation list with a single gliding marker.
 *
 * Above the list: search (⌘K) and the attention signal — "Needs you" with
 * its count, or a calm "All clear". Below the six destinations, the
 * "Behind the scenes" group stays folded unless one of its pages is open.
 *
 * The marker is one absolutely positioned hairline whose `--marker-y` is
 * measured from the active item's offset; only `transform` is animated. The
 * list itself is plain links with `aria-current`, so keyboard and assistive
 * users get exactly what the marker shows.
 */
export function SidebarNav({ attentionCount, onNavigate }: { attentionCount: number; onNavigate?: () => void }) {
  const pathname = usePathname();
  const navRef = useRef<HTMLElement>(null);
  const [marker, setMarker] = useState<{ y: number; visible: boolean }>({ y: 0, visible: false });
  const hiddenActive = NAV_GROUPS.some((g) => g.collapsible && g.items.some((i) => i.match(pathname)));
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  const [isMac, setIsMac] = useState(true);

  useEffect(() => setIsMac(/Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent)), []);

  useIsomorphicLayoutEffect(() => {
    const nav = navRef.current;
    if (!nav) return;
    const place = () => {
      const active = nav.querySelector<HTMLElement>('[aria-current="page"]');
      if (!active || active.offsetParent === null) {
        setMarker((m) => ({ ...m, visible: false }));
        return;
      }
      const navTop = nav.getBoundingClientRect().top;
      const rect = active.getBoundingClientRect();
      setMarker({ y: rect.top - navTop + nav.scrollTop + (rect.height - 22) / 2, visible: true });
    };
    place();
    // A group opening or closing moves the items below it.
    const t = setTimeout(place, 340);
    return () => clearTimeout(t);
  }, [pathname, openGroups]);

  const attentionActive = ATTENTION_ITEM.match(pathname);

  return (
    <nav ref={navRef} className="bc-nav" aria-label="Sections">
      <span
        className="bc-nav-marker"
        style={{ ['--marker-y' as string]: `${marker.y}px`, ['--marker-opacity' as string]: marker.visible ? 1 : 0 }}
        aria-hidden="true"
      />

      <button type="button" className="bc-nav-search" onClick={() => window.dispatchEvent(new Event(OPEN_PALETTE_EVENT))}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
          <circle cx="11" cy="11" r="6.5" />
          <path d="m20 20-4-4" />
        </svg>
        <span>Search</span>
        <kbd aria-hidden="true">{isMac ? '⌘K' : 'Ctrl K'}</kbd>
      </button>

      <Link
        href={ATTENTION_ITEM.href}
        className="bc-nav-attention"
        data-state={attentionCount > 0 ? 'alert' : 'clear'}
        aria-current={attentionActive ? 'page' : undefined}
        onClick={onNavigate}
      >
        <span className="bc-nav-attention-dot" aria-hidden="true" />
        <span>{attentionCount > 0 ? ATTENTION_ITEM.label : 'All clear'}</span>
        {attentionCount > 0 && (
          <span className="bc-nav-count" data-tone="critical" aria-label={`${attentionCount} items need attention`}>
            {attentionCount > 99 ? '99+' : attentionCount}
          </span>
        )}
      </Link>

      {NAV_GROUPS.map((group) => {
        const open = !group.collapsible || openGroups[group.label] === true || (openGroups[group.label] === undefined && hiddenActive);
        return (
          <div key={group.label} role="group" aria-labelledby={`nav-${group.label}`} className="bc-nav-section" data-open={open ? 'true' : undefined}>
            {group.collapsible ? (
              <button
                type="button"
                id={`nav-${group.label}`}
                className="bc-nav-group bc-nav-group-toggle"
                aria-expanded={open}
                onClick={() => setOpenGroups((g) => ({ ...g, [group.label]: !open }))}
              >
                {group.label}
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="m6 9 6 6 6-6" />
                </svg>
              </button>
            ) : (
              <div id={`nav-${group.label}`} className="bc-nav-group">
                {group.label}
              </div>
            )}
            <div className="bc-nav-items">
              <div>
                {group.items.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="bc-nav-item"
                    aria-current={item.match(pathname) ? 'page' : undefined}
                    tabIndex={open ? undefined : -1}
                    onClick={onNavigate}
                  >
                    <Icon name={item.icon} />
                    <span>{item.label}</span>
                  </Link>
                ))}
              </div>
            </div>
          </div>
        );
      })}
    </nav>
  );
}
