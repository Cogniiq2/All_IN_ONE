'use client';

import * as Dialog from '@radix-ui/react-dialog';
import { Command } from 'cmdk';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState, useTransition } from 'react';
import { ALL_NAV_ITEMS } from '@/components/admin/shell/nav-items';
import { Icon } from '@/components/admin/shell/nav-icon';
import { searchBookingsAction } from '@/lib/admin/actions';
import type { BookingSummaryDto } from '@/lib/admin/dto';
import { formatStay } from '@/lib/admin/format';
import { bookingStatePresentation } from '@/lib/admin/presentation';
import { BOOKING_REFERENCE_PATTERN } from '@/lib/booking/reference';

interface PropertyEntry {
  slug: string;
  name: string;
}

/**
 * ⌘K / Ctrl-K.
 *
 * Navigation, a jump to a property, "go to today", and a booking lookup by
 * reference or surname through a read-only server action. No command here
 * changes anything: the palette moves the operator, it never acts for them.
 */
export function CommandPalette({ properties }: { properties: PropertyEntry[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<BookingSummaryDto[]>([]);
  const [searching, startSearch] = useTransition();
  const latest = useRef(0);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (!open) {
      setQuery('');
      setResults([]);
    }
  }, [open]);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      return;
    }
    const id = ++latest.current;
    const timer = setTimeout(() => {
      startSearch(async () => {
        const res = await searchBookingsAction(q);
        if (id === latest.current) setResults(res.ok ? res.items : []);
      });
    }, 180);
    return () => clearTimeout(timer);
  }, [query]);

  const go = useCallback(
    (href: string) => {
      setOpen(false);
      router.push(href);
    },
    [router]
  );

  const looksLikeReference = BOOKING_REFERENCE_PATTERN.test(query.trim().toUpperCase());

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Portal>
        <Dialog.Overlay className="bc-cmd-overlay" />
        <Dialog.Content className="bc-cmd" aria-describedby={undefined}>
          <Dialog.Title className="sr-only">Command palette</Dialog.Title>
          <Command label="Command palette" shouldFilter={!query.trim() || !looksLikeReference} loop>
            <Command.Input value={query} onValueChange={setQuery} placeholder="Go to, or find a booking by reference or surname…" autoFocus />
            <Command.List>
              <Command.Empty>{searching ? 'Searching…' : 'Nothing matches.'}</Command.Empty>

              {(results.length > 0 || looksLikeReference) && (
                <Command.Group heading="Bookings">
                  {looksLikeReference && results.length === 0 && (
                    <Command.Item value={`open ${query}`} onSelect={() => go(`/admin/bookings/${query.trim().toUpperCase()}`)}>
                      <Icon name="bookings" />
                      <span>
                        Open <span className="bc-ref">{query.trim().toUpperCase()}</span>
                      </span>
                      <span className="bc-cmd-hint">Enter</span>
                    </Command.Item>
                  )}
                  {results.map((b) => (
                    <Command.Item key={b.reference} value={`${b.reference} ${b.guestLabel ?? ''} ${b.unitName}`} onSelect={() => go(`/admin/bookings/${b.reference}`)}>
                      <Icon name="bookings" />
                      <span className="bc-ref">{b.reference}</span>
                      <span className="truncate">
                        {b.guestLabel ?? '—'} · {b.unitName}
                      </span>
                      <span className="bc-cmd-hint">
                        {formatStay(b.checkIn, b.checkOut)} · {bookingStatePresentation(b.status).label}
                      </span>
                    </Command.Item>
                  ))}
                </Command.Group>
              )}

              <Command.Group heading="Go to">
                {ALL_NAV_ITEMS.map((item) => (
                  <Command.Item key={item.href} value={`go ${item.label}`} onSelect={() => go(item.href)}>
                    <Icon name={item.icon} />
                    <span>{item.label}</span>
                  </Command.Item>
                ))}
                <Command.Item value="go to today calendar" onSelect={() => go('/admin/calendar')}>
                  <Icon name="calendar" />
                  <span>Calendar — today</span>
                </Command.Item>
              </Command.Group>

              {properties.length > 0 && (
                <Command.Group heading="Properties">
                  {properties.map((p) => (
                    <Command.Item key={p.slug} value={`property ${p.name}`} onSelect={() => go(`/admin/bookings?unit=${encodeURIComponent(p.slug)}`)}>
                      <Icon name="properties" />
                      <span>{p.name}</span>
                      <span className="bc-cmd-hint">bookings</span>
                    </Command.Item>
                  ))}
                </Command.Group>
              )}
            </Command.List>
          </Command>
          <div className="bc-cmd-foot" aria-hidden="true">
            <span>
              <kbd className="bc-kbd">↑↓</kbd> move
            </span>
            <span>
              <kbd className="bc-kbd">↵</kbd> open
            </span>
            <span>
              <kbd className="bc-kbd">esc</kbd> close
            </span>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
