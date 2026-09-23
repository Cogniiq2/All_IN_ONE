/**
 * ══════════════════════════════════════════════════════════════════════════
 * THE CHECKOUT SUMMARY — everything a guest must see before the button.
 *
 * § 312j Abs. 2 BGB requires the essential characteristics, the total price
 * and any additional costs to be shown clearly and directly before the order
 * button; Art. 246a EGBGB adds the trader's identity, the cancellation terms
 * and the notice that no right of withdrawal exists. They are rendered here,
 * together, in one block, in that order:
 *
 *   apartment · dates · nights · guests
 *   line items · TOTAL · price statement · charges payable on site
 *   contracting party
 *   cancellation terms            ← ALWAYS rendered: the text, or the gap
 *   right of withdrawal
 *   AGB and privacy links
 *
 * ── The cancellation block can no longer be silently empty ──────────────
 * It used to be `{quote?.cancellationPolicy && …}` — present when Beds24
 * returned text, absent otherwise, with nothing to say it was missing. Now
 * the block always renders. With approved terms it shows them; without, it
 * says plainly that online booking is not possible yet, and `checkoutReady()`
 * is false, which the dialog uses to withhold the button and the payment.
 *
 * Pure presentation: no hooks, no fetching, locale passed in. That is what
 * lets tests/checkout-legal.test.ts render it on the server and assert what a
 * guest would see.
 * ══════════════════════════════════════════════════════════════════════════
 */

import type { BookingQuote } from '@/lib/booking/types';
import type { CheckoutTerms } from '@/lib/legal/booking-terms';
import { formatDateOrDash } from '@/lib/booking/date-format';
import { formatMoney } from '@/lib/booking/client';

type Locale = 'de' | 'en';

/**
 * The order button's label. § 312j Abs. 3 BGB: the button must state, in its
 * own words, that pressing it creates an obligation to pay ("zahlungspflichtig
 * bestellen" or an equally unambiguous phrase — CJEU C-249/21). "Verbindlich
 * buchen" does not mention payment and was replaced. Counsel to confirm; see
 * LEGAL_REVIEW_REQUIRED.md.
 */
export const ORDER_BUTTON_LABEL = {
  de: 'Zahlungspflichtig buchen',
  en: 'Book and pay',
} as const;

/** Whether a bookable checkout may offer its button: a quote with approved terms. */
export function checkoutReady(quote: BookingQuote | null): quote is BookingQuote & { terms: CheckoutTerms } {
  return Boolean(quote && quote.terms);
}

export function CheckoutSummary({
  locale,
  unitName,
  arrival,
  departure,
  nights,
  guests,
  quote,
  quoteLoading,
  bookable,
}: {
  locale: Locale;
  unitName: string;
  arrival?: string;
  departure?: string;
  nights?: number;
  guests: number;
  quote: BookingQuote | null;
  quoteLoading: boolean;
  bookable: boolean;
}) {
  const de = locale === 'de';
  const terms = quote?.terms ?? null;
  const muted = { color: 'hsl(var(--muted-foreground))' } as const;

  return (
    <div>
      <div className="p-4" style={{ background: 'hsl(var(--secondary) / 0.55)', borderRadius: 'var(--radius-md)' }}>
        <dl className="space-y-1.5 text-[13.5px]">
          <Row label={de ? 'Apartment' : 'Apartment'} value={unitName} />
          <Row label={de ? 'Zeitraum' : 'Dates'} value={`${formatDateOrDash(arrival)} – ${formatDateOrDash(departure)}`} />
          <Row label={de ? 'Nächte' : 'Nights'} value={nights ? String(nights) : '—'} />
          <Row label={de ? 'Personen' : 'Guests'} value={String(guests)} />

          {/*
            Line items, exactly as priced. Every mandatory component is listed
            and included in the total; nothing is derived or pre-selected here.
          */}
          {quote?.components.map((component) => (
            <Row
              key={component.code}
              label={component.label[locale]}
              value={formatMoney(component.amountCents, quote.currency, locale)}
            />
          ))}

          <div className="pt-2" style={{ borderTop: '1px solid hsl(var(--border))' }}>
            <Row
              label={de ? 'Gesamtpreis' : 'Total price'}
              value={
                quote
                  ? formatMoney(quote.totalCents, quote.currency, locale)
                  : quoteLoading
                  ? de ? 'wird geprüft …' : 'checking …'
                  : de ? 'auf Anfrage' : 'on request'
              }
              muted={!quote}
              strong
            />
          </div>
        </dl>

        {terms && (
          <p className="mt-2 text-[12px] leading-relaxed" style={muted} data-legal="price-statement">
            {terms.price.statement[locale]}
          </p>
        )}

        {terms && terms.price.onSiteCharges.length > 0 && (
          <div className="mt-2 text-[12px] leading-relaxed" data-legal="on-site-charges">
            <p className="font-semibold">{de ? 'Zusätzlich vor Ort zu zahlen:' : 'Additionally payable on site:'}</p>
            <ul className="mt-1 space-y-0.5" style={muted}>
              {terms.price.onSiteCharges.map((charge) => (
                <li key={charge.label.de}>
                  {charge.label[locale]}: {charge.amount[locale]}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {bookable && (
        <section
          aria-labelledby="checkout-terms-heading"
          className="mt-4 space-y-3 p-4 text-[12.5px] leading-relaxed"
          style={{ border: '1px solid hsl(var(--border))', borderRadius: 'var(--radius-md)' }}
          data-legal="terms"
        >
          <h4 id="checkout-terms-heading" className="sr-only">
            {de ? 'Vertragsinformationen' : 'Contract information'}
          </h4>

          {terms?.test && (
            <p className="font-semibold" style={{ color: 'hsl(var(--destructive))' }} data-legal="test-terms">
              {de ? 'Testumgebung — keine echte Buchung.' : 'Test environment — not a real booking.'}
            </p>
          )}

          {terms && (
            <p data-legal="contracting-party">
              <span className="font-semibold">{de ? 'Ihr Vertragspartner: ' : 'Your contracting party: '}</span>
              {terms.contractingParty}
            </p>
          )}

          {/* ALWAYS rendered. Either the approved text or the stated gap. */}
          <div data-legal="cancellation">
            <p className="font-semibold">{de ? 'Stornierungsbedingungen' : 'Cancellation terms'}</p>
            {terms ? (
              <p className="mt-1 whitespace-pre-line" style={muted}>{terms.cancellation.text[locale]}</p>
            ) : quoteLoading ? (
              <p className="mt-1" style={muted}>{de ? 'werden geladen …' : 'loading …'}</p>
            ) : (
              <p className="mt-1" style={{ color: 'hsl(var(--destructive))' }} data-legal="terms-missing">
                {de
                  ? 'Die Stornierungsbedingungen für eine Online-Buchung sind noch nicht freigegeben. Eine Online-Buchung und Zahlung ist deshalb derzeit nicht möglich — senden Sie uns gerne eine Anfrage.'
                  : 'The cancellation terms for online booking have not been released yet. Online booking and payment are therefore not possible at the moment — please send us an enquiry instead.'}
              </p>
            )}
          </div>

          {terms && (
            <div data-legal="withdrawal">
              <p className="font-semibold">{de ? 'Widerrufsrecht' : 'Right of withdrawal'}</p>
              <p className="mt-1 whitespace-pre-line" style={muted}>{terms.withdrawal.text[locale]}</p>
            </div>
          )}

          {/*
            Incorporation of the AGB (§ 305 Abs. 2 BGB): an express reference
            and the chance to read them before the contract. No pre-ticked box
            and no marketing opt-in on this screen, pre-selected or otherwise.
          */}
          <p data-legal="links">
            {de ? 'Es gelten unsere ' : 'Our '}
            <a href={terms?.agb.path ?? '/agb'} className="underline underline-offset-2" target="_blank" rel="noopener noreferrer">
              {de ? 'Allgemeinen Geschäftsbedingungen' : 'terms and conditions'}
            </a>
            {de ? '. Informationen zum Datenschutz finden Sie in unserer ' : ' apply. Information on data protection is set out in our '}
            <a href={terms?.privacy.path ?? '/datenschutz'} className="underline underline-offset-2" target="_blank" rel="noopener noreferrer">
              {de ? 'Datenschutzerklärung' : 'privacy notice'}
            </a>
            .
          </p>
        </section>
      )}
    </div>
  );
}

function Row({ label, value, muted = false, strong = false }: { label: string; value: string; muted?: boolean; strong?: boolean }) {
  return (
    <div className="flex justify-between gap-4">
      <dt style={{ color: 'hsl(var(--muted-foreground))' }}>{label}</dt>
      <dd
        className={`text-right ${strong ? 'font-semibold' : 'font-medium'}`}
        style={{ color: muted ? 'hsl(var(--muted-foreground))' : 'hsl(var(--foreground))' }}
      >
        {value}
      </dd>
    </div>
  );
}
