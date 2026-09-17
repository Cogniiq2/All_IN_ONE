'use client';

/**
 * ══════════════════════════════════════════════════════════════════════════
 * THE PAYPAL BUTTON.
 *
 * Minimal on purpose. PayPal's own button is a recognised, trusted control and
 * restyling it would be both against their brand rules and a worse experience;
 * everything around it is BoLaGio's, and it sits inside the existing modal
 * rather than replacing any of it.
 *
 * ── What this component knows ────────────────────────────────────────────
 *   the PayPal client id       public; identifies the merchant, authorises nothing
 *   the booking reference      BLG-XXXXXX
 *   a provider order id        needed by the SDK
 *
 * ── What it does not know, and cannot learn ──────────────────────────────
 *   the PayPal client secret, the Supabase service role key, the Beds24 token,
 *   any callback secret
 *
 * ── What it does not decide ──────────────────────────────────────────────
 *   the amount, the currency, whether the dates are free, whether the payment
 *   succeeded, whether the booking is confirmed
 *
 * `createOrder` asks OUR server, which reads the total from the row it wrote
 * from a live Beds24 offer. `onApprove` asks OUR server to capture, which asks
 * PayPal. The word "confirmed" never appears here: this component reports that
 * a payment is being confirmed and hands off to the status page, which reads
 * the server's answer.
 * ══════════════════════════════════════════════════════════════════════════
 */

import { useEffect, useRef, useState } from 'react';
import { useI18n } from '@/lib/i18n';
import {
  capturePayment,
  createPaymentOrder,
  fetchPaymentConfig,
  type PaymentConfig,
} from '@/lib/booking/client';

/** The slice of the PayPal SDK this component uses. */
interface PayPalSdk {
  Buttons(options: {
    style?: Record<string, string | number>;
    createOrder(): Promise<string>;
    onApprove(data: { orderID: string }): Promise<void>;
    onCancel?(): void;
    onError?(error: unknown): void;
  }): { render(container: HTMLElement): Promise<void>; close?(): void };
}

declare global {
  interface Window {
    paypal?: PayPalSdk;
  }
}

/** One in-flight load per page, so two mounts do not add two script tags. */
let sdkPromise: Promise<PayPalSdk> | null = null;

function loadSdk(config: PaymentConfig): Promise<PayPalSdk> {
  if (window.paypal) return Promise.resolve(window.paypal);
  if (sdkPromise) return sdkPromise;

  sdkPromise = new Promise<PayPalSdk>((resolve, reject) => {
    const script = document.createElement('script');
    const params = new URLSearchParams({
      'client-id': config.clientId,
      currency: config.currency,
      // Card fields and PayPal Credit are deliberately not enabled: each one
      // is a separate compliance and UX surface, and this flow is PayPal only
      // until a sandbox run has proven the simple case end to end.
      components: 'buttons',
      intent: 'capture',
    });
    script.src = `https://www.paypal.com/sdk/js?${params.toString()}`;
    script.async = true;
    script.onload = () =>
      window.paypal ? resolve(window.paypal) : reject(new Error('paypal_sdk_missing'));
    script.onerror = () => {
      // Allow a later retry rather than caching the failure forever.
      sdkPromise = null;
      reject(new Error('paypal_sdk_failed'));
    };
    document.head.appendChild(script);
  });
  return sdkPromise;
}

export interface PayPalButtonProps {
  reference: string;
  /** Called once the SERVER has accepted the capture. Never on approval alone. */
  onSettled: (result: { status: string; paymentStatus: string }) => void;
  onCancel: () => void;
  onError: (cause: unknown) => void;
}

export function PayPalButton({ reference, onSettled, onCancel, onError }: PayPalButtonProps) {
  const { locale } = useI18n();
  const de = locale === 'de';
  const container = useRef<HTMLDivElement | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'working' | 'failed'>('loading');

  /*
   * Props are mirrored into refs so the effect can depend on `reference`
   * alone. Without this, a parent re-render would produce new callback
   * identities, tear the PayPal button down and rebuild it mid-payment.
   */
  const handlers = useRef({ onSettled, onCancel, onError });
  handlers.current = { onSettled, onCancel, onError };

  useEffect(() => {
    let active = true;
    let instance: ReturnType<PayPalSdk['Buttons']> | undefined;

    (async () => {
      try {
        const config = await fetchPaymentConfig();
        const sdk = await loadSdk(config);
        if (!active || !container.current) return;

        instance = sdk.Buttons({
          style: { layout: 'vertical', shape: 'rect', label: 'pay', height: 48 },

          // The server creates the order and reads the amount from the booking
          // intent. This browser never sends one and never could.
          createOrder: async () => {
            const order = await createPaymentOrder(reference);
            return order.orderId;
          },

          // PayPal telling us the guest approved is a PROMPT, not evidence.
          // The server captures, PayPal decides, and the answer is validated
          // against the authoritative quote before anything is confirmed.
          onApprove: async () => {
            setState('working');
            try {
              const result = await capturePayment(reference);
              if (active) handlers.current.onSettled(result);
            } catch (cause) {
              if (active) handlers.current.onError(cause);
            }
          },

          onCancel: () => {
            // Nothing to undo locally. The hold stands until its lease runs
            // out, and the lease check verifies there is no payment before
            // anything is released.
            if (active) handlers.current.onCancel();
          },

          onError: (cause) => {
            if (active) handlers.current.onError(cause);
          },
        });

        await instance.render(container.current);
        if (active) setState('ready');
      } catch (cause) {
        if (!active) return;
        setState('failed');
        handlers.current.onError(cause);
      }
    })();

    return () => {
      active = false;
      try {
        instance?.close?.();
      } catch {
        // The SDK throws if the container is already gone. Nothing to do.
      }
    };
  }, [reference]);

  return (
    <div>
      <div ref={container} aria-busy={state === 'loading'} />

      {state === 'loading' && (
        <p className="py-3 text-center text-[13px]" style={{ color: 'hsl(var(--muted-foreground))' }}>
          {de ? 'Zahlung wird vorbereitet …' : 'Preparing payment …'}
        </p>
      )}

      {state === 'working' && (
        <p className="py-3 text-center text-[13px]" style={{ color: 'hsl(var(--muted-foreground))' }}>
          {/*
            "Being confirmed", never "confirmed". This browser has no way to
            know the reservation is secured — only the server does, and the
            status page reads it from there.
          */}
          {de
            ? 'Zahlung wird bestätigt — bitte schließen Sie dieses Fenster nicht.'
            : 'Confirming your payment — please do not close this window.'}
        </p>
      )}

      {state === 'failed' && (
        <p className="py-3 text-center text-[13px]" style={{ color: 'hsl(var(--muted-foreground))' }}>
          {de
            ? 'Die Zahlungsseite konnte nicht geladen werden. Es wurde nichts abgebucht.'
            : 'The payment page could not be loaded. Nothing has been charged.'}
        </p>
      )}
    </div>
  );
}
