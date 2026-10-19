'use client';

import * as Dialog from '@radix-ui/react-dialog';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState, useTransition, type ReactNode } from 'react';
import { loadStaySheet, type StaySheetResult } from '@/lib/admin/stay-sheet';
import { formatInstant, formatIsoDate, formatMoney, pluralNights, weekdayShort } from '@/lib/admin/format';
import { bedroomPackageLabel, reservationClassPresentation, sourcePresentation, bookingStatePresentation } from '@/lib/admin/presentation';
import { CopyButton } from '@/components/admin/copy-button';

/**
 * ══════════════════════════════════════════════════════════════════════════
 * The calendar's stay sheet.
 *
 * A bar is a button; the board listens once for every bar (event
 * delegation), so the grid itself stays a server component. Opening a stay
 * shows what the calendar already knows at once, then fetches the full
 * record — guest, money, booking — through a permission-checked server
 * action. ← and → walk to the previous and next stay; the address carries
 * `?stay=` so an open stay is a link.
 * ══════════════════════════════════════════════════════════════════════════
 */

export interface StayRef {
  key: string;
  kind: 'intent' | 'reservation';
  reservationId: string | null;
  href: string | null;
  reference: string;
  label: string;
  unitSlug: string;
  unitName: string;
  checkIn: string;
  checkOut: string;
  nights: number;
  status: string;
  source: string;
  adults: number;
  children: number;
  occupies: boolean;
  channelReference: string | null;
}

export function CalendarBoard({ stays, today, children }: { stays: StayRef[]; today: string; children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const ordered = useMemo(() => [...stays].sort((a, b) => a.checkIn.localeCompare(b.checkIn) || a.unitName.localeCompare(b.unitName)), [stays]);
  const [openKey, setOpenKey] = useState<string | null>(params.get('stay'));

  const setUrl = useCallback(
    (key: string | null) => {
      const next = new URLSearchParams(params.toString());
      if (key) next.set('stay', key);
      else next.delete('stay');
      // The address follows without a navigation: the grid does not reload.
      window.history.replaceState(null, '', `${pathname}${next.size ? `?${next}` : ''}`);
    },
    [params, pathname]
  );

  const open = useCallback(
    (key: string | null) => {
      setOpenKey(key);
      setUrl(key);
    },
    [setUrl]
  );

  const current = ordered.find((s) => s.key === openKey) ?? null;
  const index = current ? ordered.indexOf(current) : -1;

  return (
    <div
      onClick={(e) => {
        const el = (e.target as HTMLElement).closest<HTMLElement>('[data-stay]');
        if (!el) return;
        e.preventDefault();
        open(el.dataset.stay ?? null);
      }}
    >
      {children}
      <Dialog.Root open={current !== null} onOpenChange={(o) => !o && open(null)}>
        <Dialog.Portal>
          <Dialog.Overlay className="bc-layer cs-overlay" />
          <Dialog.Content
            className="bc-layer cs-sheet"
            aria-describedby={undefined}
            onKeyDown={(e) => {
              if (e.key === 'ArrowRight' && index < ordered.length - 1) open(ordered[index + 1].key);
              if (e.key === 'ArrowLeft' && index > 0) open(ordered[index - 1].key);
            }}
          >
            {current && (
              <SheetBody
                key={current.key}
                stay={current}
                today={today}
                neighbours={neighbours(current, ordered)}
                position={{ index, total: ordered.length }}
                onPrev={index > 0 ? () => open(ordered[index - 1].key) : null}
                onNext={index < ordered.length - 1 ? () => open(ordered[index + 1].key) : null}
                onOpenPage={(href) => router.push(href)}
              />
            )}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}

/** The stays just before and after this one in the same apartment. */
function neighbours(stay: StayRef, all: StayRef[]) {
  const same = all.filter((s) => s.unitSlug === stay.unitSlug && s.key !== stay.key && s.occupies);
  const before = same.filter((s) => s.checkOut <= stay.checkIn).sort((a, b) => b.checkOut.localeCompare(a.checkOut))[0] ?? null;
  const after = same.filter((s) => s.checkIn >= stay.checkOut).sort((a, b) => a.checkIn.localeCompare(b.checkIn))[0] ?? null;
  return { before, after };
}

function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}

/** Where the stay is relative to today, in a few words. */
function moment(stay: StayRef, today: string): { text: string; tone: 'live' | 'soon' | 'past' | 'future' | 'off' } {
  if (!stay.occupies) return { text: stay.status === 'blocked' ? 'Blocked' : 'Cancelled', tone: 'off' };
  if (today < stay.checkIn) {
    const d = daysBetween(today, stay.checkIn);
    return { text: d === 1 ? 'Arrives tomorrow' : `Arrives in ${d} days`, tone: d <= 3 ? 'soon' : 'future' };
  }
  if (today === stay.checkIn) return { text: 'Arrives today', tone: 'soon' };
  if (today < stay.checkOut) return { text: `In house · night ${daysBetween(stay.checkIn, today) + 1} of ${stay.nights}`, tone: 'live' };
  if (today === stay.checkOut) return { text: 'Leaves today', tone: 'soon' };
  const d = daysBetween(stay.checkOut, today);
  return { text: d === 1 ? 'Left yesterday' : `Left ${d} days ago`, tone: 'past' };
}

const COUNTRY = typeof Intl !== 'undefined' && 'DisplayNames' in Intl ? new Intl.DisplayNames(['en'], { type: 'region' }) : null;

function countryName(code: string | null): string | null {
  if (!code || !/^[A-Za-z]{2}$/.test(code)) return code;
  try {
    return COUNTRY?.of(code.toUpperCase()) ?? code;
  } catch {
    return code;
  }
}

function flag(code: string | null): string {
  if (!code || !/^[A-Za-z]{2}$/.test(code)) return '';
  return String.fromCodePoint(...code.toUpperCase().split('').map((c) => 0x1f1a5 + c.charCodeAt(0)));
}

function SheetBody({
  stay,
  today,
  neighbours: around,
  position,
  onPrev,
  onNext,
  onOpenPage,
}: {
  stay: StayRef;
  today: string;
  neighbours: { before: StayRef | null; after: StayRef | null };
  position: { index: number; total: number };
  onPrev: (() => void) | null;
  onNext: (() => void) | null;
  onOpenPage: (href: string) => void;
}) {
  const [result, setResult] = useState<StaySheetResult | null>(null);
  const [loading, startLoading] = useTransition();

  useEffect(() => {
    if (!stay.reservationId) return;
    let alive = true;
    startLoading(async () => {
      const r = await loadStaySheet(stay.reservationId!);
      if (alive) setResult(r);
    });
    return () => {
      alive = false;
    };
  }, [stay.reservationId]);

  const detail = result?.ok ? result.reservation : null;
  const money = result?.ok ? result.money : null;
  const state = stay.kind === 'reservation' ? reservationClassPresentation(stay.status) : bookingStatePresentation(stay.status);
  const m = moment(stay, today);
  const name = detail ? [detail.guestFirstName, detail.guestLastName].filter(Boolean).join(' ') || stay.label : stay.label;
  const party = stay.adults + stay.children;
  const setup = bedroomPackageLabel(detail?.bedroomPackage ?? null);
  const eur = (c: number | null) => (c === null ? '—' : formatMoney(c, 'EUR'));
  const gapBefore = around.before ? daysBetween(around.before.checkOut, stay.checkIn) : null;
  const gapAfter = around.after ? daysBetween(stay.checkOut, around.after.checkIn) : null;

  return (
    <>
      <header className="cs-head">
        <div className="cs-head-top">
          <span className="cs-moment" data-tone={m.tone}>
            <i aria-hidden="true" />
            {m.text}
          </span>
          <div className="cs-nav">
            <span className="cs-count">
              {position.index + 1} / {position.total}
            </span>
            <button type="button" className="cs-icon" onClick={onPrev ?? undefined} disabled={!onPrev} aria-label="Previous stay">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="m15 6-6 6 6 6" />
              </svg>
            </button>
            <button type="button" className="cs-icon" onClick={onNext ?? undefined} disabled={!onNext} aria-label="Next stay">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="m9 6 6 6-6 6" />
              </svg>
            </button>
            <Dialog.Close className="cs-icon" aria-label="Close">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
                <path d="M6 6l12 12M18 6 6 18" />
              </svg>
            </Dialog.Close>
          </div>
        </div>
        <Dialog.Title className="cs-title">{name}</Dialog.Title>
        <p className="cs-sub">
          <span className="cs-channel" data-channel={stay.source}>
            <i aria-hidden="true" />
            {sourcePresentation(stay.source).label}
          </span>
          <span className="bc-badge" data-tone={state.tone}>
            <i className="bc-glyph" data-glyph={state.glyph} aria-hidden="true" />
            {state.label}
          </span>
          <span>{stay.unitName}</span>
        </p>
      </header>

      {/* The stay as a ribbon: arrival → nights → departure. */}
      <div className="cs-ribbon">
        <DateTile label="Check-in" iso={stay.checkIn} />
        <div className="cs-nights" aria-label={pluralNights(stay.nights)}>
          <span className="cs-nights-line">
            {Array.from({ length: Math.min(stay.nights, 14) }, (_, i) => (
              <i key={i} data-past={stay.occupies && addIso(stay.checkIn, i) < today ? 'true' : undefined} style={{ ['--i' as string]: i }} />
            ))}
          </span>
          <strong>{pluralNights(stay.nights)}</strong>
        </div>
        <DateTile label="Check-out" iso={stay.checkOut} align="end" />
      </div>

      <div className="cs-body" data-loading={loading && !result ? 'true' : undefined}>
        <Group title="Stay">
          <Row label="Apartment" value={stay.unitName} />
          <Row label="Guests" value={party > 0 ? `${stay.adults} ${stay.adults === 1 ? 'adult' : 'adults'}${stay.children ? `, ${stay.children} ${stay.children === 1 ? 'child' : 'children'}` : ''}` : detail?.guests ? `${detail.guests}` : null} />
          <Row label="Bedrooms" value={setup ?? (detail ? 'Not stated by the channel' : null)} quiet={!setup} />
          <Row
            label="Before"
            value={around.before ? `${around.before.label} left ${gapBefore === 0 ? 'the same day — same-day changeover' : `${gapBefore} ${gapBefore === 1 ? 'night' : 'nights'} earlier`}` : 'No stay before in view'}
            quiet={!around.before}
            tone={gapBefore === 0 ? 'caution' : undefined}
          />
          <Row
            label="After"
            value={around.after ? `${around.after.label} arrives ${gapAfter === 0 ? 'the same day — same-day changeover' : `${gapAfter} ${gapAfter === 1 ? 'night' : 'nights'} later`}` : 'Nothing booked after in view'}
            quiet={!around.after}
            tone={gapAfter === 0 ? 'caution' : undefined}
          />
        </Group>

        {stay.reservationId && (
          <Group title="Guest">
            <Row label="Name" value={detail ? name : null} />
            <Row label="From" value={detail?.guestCountry ? `${flag(detail.guestCountry)} ${countryName(detail.guestCountry)}` : detail ? 'Not stated' : null} quiet={detail !== null && !detail.guestCountry} />
            <Row
              label="Email"
              value={
                detail?.guestEmail ? (
                  <span className="cs-contact">
                    <a href={`mailto:${detail.guestEmail}`}>{detail.guestEmail}</a>
                    <CopyButton value={detail.guestEmail} className="cs-copy">
                      <></>
                    </CopyButton>
                  </span>
                ) : detail ? (
                  'Not passed on by the channel'
                ) : null
              }
              quiet={detail !== null && !detail.guestEmail}
            />
            <Row
              label="Phone"
              value={
                detail?.guestPhone ? (
                  <span className="cs-contact">
                    <a href={`tel:${detail.guestPhone.replace(/\s/g, '')}`}>{detail.guestPhone}</a>
                    <CopyButton value={detail.guestPhone} className="cs-copy">
                      <></>
                    </CopyButton>
                  </span>
                ) : detail ? (
                  'Not passed on by the channel'
                ) : null
              }
              quiet={detail !== null && !detail.guestPhone}
            />
          </Group>
        )}

        {money && (
          <Group title="Money">
            <div className="cs-money">
              <Figure label="Guest paid" value={eur(money.grossCents)} />
              <Figure label={`VAT ${money.vatRateBp ? `${money.vatRateBp / 100} %` : ''}`} value={eur(money.vatCents)} note="for the Finanzamt" />
              <Figure label="Booking.com" value={money.commissionCents === null ? 'not known yet' : `− ${eur(money.commissionCents)}`} note={money.commissionSource === 'beds24' ? 'as reported to Beds24' : money.commissionSource === 'statement' ? 'from the statement' : undefined} />
              <Figure label="Stays with BoLaGio" value={eur(money.keptCents)} strong />
            </div>
            <p className="cs-note">
              {money.payoutState === 'paid_out'
                ? `Paid out ${eur(money.payoutCents)} on ${formatIsoDate(money.payoutDate, 'long')}.`
                : money.payoutState === 'expected'
                  ? `Payout of ${eur(money.payoutCents)} expected after the stay; confirmed by the Booking.com statement.`
                  : 'Payout not known yet.'}
              {money.vatMonth ? ` VAT belongs to the ${formatIsoDate(`${money.vatMonth}-01`, 'long').replace(/^1 /, '')} return.` : ''}
            </p>
          </Group>
        )}

        <Group title="Booking">
          <Row label="Channel" value={sourcePresentation(stay.source).label} />
          {stay.channelReference && (
            <Row
              label={stay.source === 'booking_com' ? 'Booking.com no.' : 'Channel no.'}
              value={
                <CopyButton value={stay.channelReference} className="cs-mono">
                  {stay.channelReference}
                </CopyButton>
              }
            />
          )}
          <Row label={stay.kind === 'reservation' ? 'Beds24 id' : 'Reference'} value={<span className="cs-mono">{stay.reference}</span>} />
          <Row label="Booked" value={detail?.bookedAt ? formatInstant(detail.bookedAt) : detail ? 'Not stated' : null} />
          {detail?.cancelledAt && <Row label="Cancelled" value={formatInstant(detail.cancelledAt)} tone="caution" />}
          <Row label="Last update" value={detail ? `${formatInstant(detail.lastSyncedAt)} from Beds24` : null} quiet />
        </Group>

        {result && !result.ok && <p className="cs-error">{result.message}</p>}
      </div>

      <footer className="cs-foot">
        <span className="cs-hint" aria-hidden="true">
          <kbd>←</kbd>
          <kbd>→</kbd> previous / next · <kbd>esc</kbd> close
        </span>
        {stay.href && (
          <button type="button" className="bc-btn primary" onClick={() => onOpenPage(stay.href!)}>
            Open full reservation
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M5 12h14m-5-5 5 5-5 5" />
            </svg>
          </button>
        )}
      </footer>
    </>
  );
}

function addIso(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function DateTile({ label, iso, align }: { label: string; iso: string; align?: 'end' }) {
  return (
    <div className="cs-date" data-align={align}>
      <span className="cs-date-label">{label}</span>
      <span className="cs-date-day">{formatIsoDate(iso, 'day')}</span>
      <span className="cs-date-rest">
        {weekdayShort(iso)} · {formatIsoDate(iso, 'long').split(' ').slice(1).join(' ')}
      </span>
    </div>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="cs-group">
      <h3>{title}</h3>
      <dl>{children}</dl>
    </section>
  );
}

function Row({ label, value, quiet, tone }: { label: string; value: ReactNode; quiet?: boolean; tone?: 'caution' }) {
  return (
    <div className="cs-row" data-quiet={quiet ? 'true' : undefined} data-tone={tone}>
      <dt>{label}</dt>
      <dd>{value ?? <span className="cs-skel" aria-label="Loading" />}</dd>
    </div>
  );
}

function Figure({ label, value, note, strong }: { label: string; value: string; note?: string; strong?: boolean }) {
  return (
    <div className="cs-figure" data-strong={strong ? 'true' : undefined}>
      <span>{label}</span>
      <strong>{value}</strong>
      {note && <small>{note}</small>}
    </div>
  );
}
