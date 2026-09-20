/**
 * ══════════════════════════════════════════════════════════════════════════
 * PAYPAL SIMULATOR — a controllable HTTP provider, not a function mock.
 *
 * Speaks the subset of PayPal's REST surface the adapter uses, on a real
 * port, so the REAL `lib/payments/paypal/*` code — token fetch, request ids,
 * error classification, webhook verification round trip — runs unmodified
 * against it. Every failure mode a real integration meets is a scripted
 * MODE, set through a control API the tests drive:
 *
 *   success · decline · pending · timeout (never answers) · server_error
 *   · malformed (200 with a non-JSON body) · response_lost (the write takes
 *   effect, then the socket dies) · wrong_amount · wrong_currency
 *   · already_captured · not_found · unauthorized
 *
 * Webhooks are delivered by the simulator itself to a target URL, with the
 * five paypal-* headers and a signature the verify endpoint checks, in the
 * orderings that bite: immediate, delayed, duplicate, reordered, none.
 *
 *   node tests/simulators/paypal-sim.mjs [port]        standalone
 *   import { startPayPalSim } from './paypal-sim.mjs'   in-process
 *
 * Control API (all JSON):
 *   POST /__sim/reset
 *   POST /__sim/config   { webhookTarget, webhookId, autoWebhook, webhookDelayMs }
 *   POST /__sim/mode     { op, mode }      op ∈ token|create_order|get_order|capture|refund|verify
 *   POST /__sim/approve  { orderId }       the buyer approved at PayPal
 *   POST /__sim/webhook  { orderId?, captureId?, type, count?, delayMs? }
 *   GET  /__sim/state
 *   GET  /__sim/calls
 *
 * Nothing here is reachable from a deployed application: the adapter only
 * honours PAYPAL_SIMULATOR_URL on APP_ENV=local, and the environment rules
 * refuse it anywhere else.
 * ══════════════════════════════════════════════════════════════════════════
 */

import http from 'node:http';
import { createHmac, randomBytes } from 'node:crypto';

const DEFAULT_MODES = { token: 'success', create_order: 'success', get_order: 'success', capture: 'success', refund: 'success', verify: 'success' };

export function createPayPalSim() {
  const state = freshState();

  function freshState() {
    return {
      modes: { ...DEFAULT_MODES },
      config: { webhookTarget: null, webhookId: 'WH-SIM-ID', autoWebhook: 'immediate', webhookDelayMs: 0, secret: 'sim-webhook-secret' },
      orders: new Map(),
      captures: new Map(),
      refunds: new Map(),
      requestIds: new Map(),
      events: new Map(),
      deliveries: [],
      calls: [],
      counter: 0,
    };
  }

  const nextId = (prefix) => `${prefix}${String(++state.counter).padStart(6, '0')}${randomBytes(2).toString('hex').toUpperCase()}`;
  const money = (cents, currency) => ({ currency_code: currency, value: `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, '0')}` });

  function json(res, status, body) {
    const text = JSON.stringify(body);
    res.writeHead(status, { 'content-type': 'application/json', 'content-length': Buffer.byteLength(text) });
    res.end(text);
  }
  function issue(res, status, name) {
    json(res, status, { name: status === 422 ? 'UNPROCESSABLE_ENTITY' : 'INVALID_REQUEST', details: [{ issue: name }], debug_id: 'sim' });
  }

  /** Apply the common failure modes. Returns true when the response was handled. */
  function failure(mode, req, res) {
    switch (mode) {
      case 'timeout':
        // Never answer. The client's own timeout classifies this as uncertain.
        return true;
      case 'server_error':
        json(res, 503, { name: 'SERVICE_UNAVAILABLE' });
        return true;
      case 'malformed':
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end('<html>not json</html>');
        return true;
      case 'unauthorized':
        json(res, 401, { error: 'invalid_client' });
        return true;
      case 'not_found':
        json(res, 404, { name: 'RESOURCE_NOT_FOUND' });
        return true;
      default:
        return false;
    }
  }

  function orderView(order) {
    const capture = order.capture ? state.captures.get(order.capture) : null;
    const refunds = Array.from(state.refunds.values()).filter((r) => r.captureId === order.capture);
    return {
      id: order.id,
      intent: 'CAPTURE',
      status: order.status,
      links: [{ href: `https://sim.paypal.local/checkoutnow?token=${order.id}`, rel: 'approve', method: 'GET' }],
      purchase_units: [
        {
          reference_id: 'default',
          custom_id: order.customId,
          invoice_id: order.invoiceId,
          amount: money(order.amountCents, order.currency),
          payments: {
            captures: capture ? [captureView(capture)] : undefined,
            refunds: refunds.length > 0 ? refunds.map(refundView) : undefined,
          },
        },
      ],
    };
  }
  function captureView(c) {
    return { id: c.id, status: c.status, amount: money(c.amountCents, c.currency), custom_id: c.customId, invoice_id: c.invoiceId, final_capture: true, create_time: c.createdAt,
      supplementary_data: { related_ids: { order_id: c.orderId } } };
  }
  function refundView(r) {
    return { id: r.id, status: r.status, amount: money(r.amountCents, r.currency), custom_id: r.customId, create_time: r.createdAt };
  }

  /* ── Webhooks ────────────────────────────────────────────────────────── */

  function buildEvent(type, resource) {
    const id = `WH-${randomBytes(8).toString('hex').toUpperCase()}-${randomBytes(6).toString('hex').toUpperCase()}`;
    const event = { id, event_type: type, create_time: new Date().toISOString(), resource_type: type.startsWith('PAYMENT.CAPTURE.REFUNDED') ? 'refund' : type.startsWith('PAYMENT.CAPTURE.') ? 'capture' : 'checkout-order', resource, summary: type };
    state.events.set(id, event);
    return event;
  }

  function signatureFor(eventId, transmissionId, transmissionTime) {
    return createHmac('sha256', state.config.secret).update(`${transmissionId}|${transmissionTime}|${eventId}|${state.config.webhookId}`).digest('base64');
  }

  async function deliver(event, { tamper = false } = {}) {
    const target = state.config.webhookTarget;
    if (!target) {
      state.deliveries.push({ eventId: event.id, type: event.event_type, delivered: false, reason: 'no target' });
      return { delivered: false };
    }
    const transmissionId = randomBytes(8).toString('hex');
    const transmissionTime = new Date().toISOString();
    const sig = signatureFor(event.id, transmissionId, transmissionTime);
    const headers = {
      'content-type': 'application/json',
      'paypal-auth-algo': 'SHA256withRSA',
      'paypal-cert-url': 'https://sim.paypal.local/cert.pem',
      'paypal-transmission-id': transmissionId,
      'paypal-transmission-sig': tamper ? 'tampered' : sig,
      'paypal-transmission-time': transmissionTime,
    };
    // The signature covers the transmission, not our re-serialised bytes: the
    // verify endpoint recomputes it from the headers and the event id.
    try {
      const response = await fetch(target, { method: 'POST', headers, body: JSON.stringify(event) });
      const record = { eventId: event.id, type: event.event_type, delivered: true, status: response.status, tamper };
      state.deliveries.push(record);
      return record;
    } catch (cause) {
      const record = { eventId: event.id, type: event.event_type, delivered: false, reason: String(cause) };
      state.deliveries.push(record);
      return record;
    }
  }

  function scheduleAuto(type, resource) {
    const event = buildEvent(type, resource);
    const plan = state.config.autoWebhook;
    const delay = state.config.webhookDelayMs || 0;
    if (plan === 'none') return event;
    if (plan === 'immediate') setTimeout(() => void deliver(event), 5);
    if (plan === 'delayed') setTimeout(() => void deliver(event), Math.max(delay, 50));
    if (plan === 'duplicate') {
      setTimeout(() => void deliver(event), 5);
      setTimeout(() => void deliver(event), 60);
      setTimeout(() => void deliver(event), 140);
    }
    return event;
  }

  /* ── The provider surface ───────────────────────────────────────────── */

  async function handle(req, res) {
    const url = new URL(req.url, 'http://sim');
    const body = await readBody(req);
    state.calls.push({ method: req.method, path: url.pathname, requestId: req.headers['paypal-request-id'] ?? null, body: body ? safeParse(body) : null, at: Date.now() });

    /* control */
    if (url.pathname.startsWith('/__sim/')) return control(url, req, res, body);

    const auth = req.headers.authorization ?? '';
    if (url.pathname === '/v1/oauth2/token') {
      if (failure(state.modes.token, req, res)) return;
      if (!auth.startsWith('Basic ')) return json(res, 401, { error: 'invalid_client' });
      return json(res, 200, { access_token: 'sim-access-token', token_type: 'Bearer', expires_in: 3600 });
    }
    if (auth !== 'Bearer sim-access-token') return json(res, 401, { error: 'invalid_token' });

    if (url.pathname === '/v2/checkout/orders' && req.method === 'POST') {
      const mode = state.modes.create_order;
      if (failure(mode, req, res)) return;
      const requestId = req.headers['paypal-request-id'];
      if (requestId && state.requestIds.has(requestId)) {
        // PayPal's idempotency: the same request id returns the first order.
        return json(res, 200, orderView(state.orders.get(state.requestIds.get(requestId))));
      }
      const parsed = safeParse(body) ?? {};
      const unit = parsed.purchase_units?.[0] ?? {};
      const amountCents = toCents(unit.amount?.value);
      if (mode === 'rejected' || amountCents === null) return issue(res, 422, 'INVALID_REQUEST');
      const order = { id: nextId('SIM-ORD-'), status: 'CREATED', amountCents, currency: unit.amount?.currency_code ?? 'EUR', customId: unit.custom_id, invoiceId: unit.invoice_id, capture: null, createdAt: new Date().toISOString() };
      state.orders.set(order.id, order);
      if (requestId) state.requestIds.set(requestId, order.id);
      if (mode === 'response_lost') return req.socket.destroy();
      return json(res, 201, orderView(order));
    }

    const orderMatch = /^\/v2\/checkout\/orders\/([^/]+)$/.exec(url.pathname);
    if (orderMatch && req.method === 'GET') {
      if (failure(state.modes.get_order, req, res)) return;
      const order = state.orders.get(decodeURIComponent(orderMatch[1]));
      if (!order) return json(res, 404, { name: 'RESOURCE_NOT_FOUND' });
      return json(res, 200, orderView(order));
    }

    const captureMatch = /^\/v2\/checkout\/orders\/([^/]+)\/capture$/.exec(url.pathname);
    if (captureMatch && req.method === 'POST') {
      const mode = state.modes.capture;
      if (failure(mode, req, res)) return;
      const order = state.orders.get(decodeURIComponent(captureMatch[1]));
      if (!order) return json(res, 404, { name: 'RESOURCE_NOT_FOUND' });
      if (order.capture) return issue(res, 422, 'ORDER_ALREADY_CAPTURED');
      if (mode === 'already_captured') return issue(res, 422, 'ORDER_ALREADY_CAPTURED');
      if (order.status !== 'APPROVED') return issue(res, 422, 'ORDER_NOT_APPROVED');
      if (mode === 'decline') {
        // PayPal keeps the order APPROVED; the buyer may restart with another instrument.
        scheduleAuto('PAYMENT.CAPTURE.DENIED', { id: nextId('SIM-CAP-'), status: 'DECLINED', amount: money(order.amountCents, order.currency), custom_id: order.customId, supplementary_data: { related_ids: { order_id: order.id } } });
        return issue(res, 422, 'INSTRUMENT_DECLINED');
      }
      const capture = {
        id: nextId('SIM-CAP-'), orderId: order.id,
        status: mode === 'pending' ? 'PENDING' : 'COMPLETED',
        amountCents: mode === 'wrong_amount' ? order.amountCents - 100 : order.amountCents,
        currency: mode === 'wrong_currency' ? 'USD' : order.currency,
        customId: order.customId, invoiceId: order.invoiceId, createdAt: new Date().toISOString(),
      };
      state.captures.set(capture.id, capture);
      order.capture = capture.id;
      order.status = 'COMPLETED';
      scheduleAuto(capture.status === 'PENDING' ? 'PAYMENT.CAPTURE.PENDING' : 'PAYMENT.CAPTURE.COMPLETED', captureView(capture));
      if (mode === 'response_lost') return req.socket.destroy();
      return json(res, 201, orderView(order));
    }

    const refundMatch = /^\/v2\/payments\/captures\/([^/]+)\/refund$/.exec(url.pathname);
    if (refundMatch && req.method === 'POST') {
      const mode = state.modes.refund;
      if (failure(mode, req, res)) return;
      const capture = state.captures.get(decodeURIComponent(refundMatch[1]));
      if (!capture) return json(res, 404, { name: 'RESOURCE_NOT_FOUND' });
      const requestId = req.headers['paypal-request-id'];
      if (requestId && state.requestIds.has(requestId)) {
        return json(res, 201, refundView(state.refunds.get(state.requestIds.get(requestId))));
      }
      const parsed = safeParse(body) ?? {};
      const amountCents = toCents(parsed.amount?.value) ?? capture.amountCents;
      const already = Array.from(state.refunds.values()).filter((r) => r.captureId === capture.id && r.status === 'COMPLETED').reduce((n, r) => n + r.amountCents, 0);
      if (mode === 'rejected' || already + amountCents > capture.amountCents) return issue(res, 422, 'REFUND_AMOUNT_EXCEEDED');
      const refund = { id: nextId('SIM-REF-'), captureId: capture.id, orderId: capture.orderId, status: mode === 'pending' ? 'PENDING' : 'COMPLETED', amountCents, currency: parsed.amount?.currency_code ?? capture.currency, customId: capture.customId, createdAt: new Date().toISOString() };
      state.refunds.set(refund.id, refund);
      if (requestId) state.requestIds.set(requestId, refund.id);
      if (refund.status === 'COMPLETED') {
        capture.status = already + amountCents >= capture.amountCents ? 'REFUNDED' : 'PARTIALLY_REFUNDED';
        scheduleAuto('PAYMENT.CAPTURE.REFUNDED', { ...refundView(refund), supplementary_data: { related_ids: { order_id: capture.orderId } } });
      }
      if (mode === 'response_lost') return req.socket.destroy();
      return json(res, 201, refundView(refund));
    }

    if (url.pathname === '/v1/notifications/verify-webhook-signature' && req.method === 'POST') {
      if (failure(state.modes.verify, req, res)) return;
      const parsed = safeParse(body) ?? {};
      const eventId = parsed.webhook_event?.id;
      const expected = eventId ? signatureFor(eventId, parsed.transmission_id, parsed.transmission_time) : null;
      const ok = state.modes.verify === 'success' && expected !== null && parsed.transmission_sig === expected && parsed.webhook_id === state.config.webhookId && state.events.has(eventId);
      return json(res, 200, { verification_status: ok ? 'SUCCESS' : 'FAILURE' });
    }

    return json(res, 404, { name: 'RESOURCE_NOT_FOUND' });
  }

  async function control(url, req, res, body) {
    const parsed = safeParse(body) ?? {};
    switch (url.pathname) {
      case '/__sim/reset': {
        const fresh = freshState();
        for (const key of Object.keys(fresh)) state[key] = fresh[key];
        return json(res, 200, { ok: true });
      }
      case '/__sim/config':
        Object.assign(state.config, parsed);
        return json(res, 200, { ok: true, config: state.config });
      case '/__sim/mode':
        if (!(parsed.op in state.modes)) return json(res, 400, { error: 'unknown op' });
        state.modes[parsed.op] = parsed.mode;
        return json(res, 200, { ok: true, modes: state.modes });
      case '/__sim/approve': {
        const order = state.orders.get(parsed.orderId);
        if (!order) return json(res, 404, { error: 'no such order' });
        if (order.status === 'CREATED') order.status = 'APPROVED';
        if (parsed.webhook !== false) scheduleAuto('CHECKOUT.ORDER.APPROVED', { id: order.id, status: 'APPROVED', purchase_units: [{ custom_id: order.customId, amount: money(order.amountCents, order.currency) }] });
        return json(res, 200, { ok: true, order: orderView(order) });
      }
      case '/__sim/webhook': {
        let resource;
        if (parsed.captureId) {
          const c = state.captures.get(parsed.captureId);
          if (!c) return json(res, 404, { error: 'no such capture' });
          resource = captureView(c);
        } else if (parsed.orderId) {
          const o = state.orders.get(parsed.orderId);
          if (!o) return json(res, 404, { error: 'no such order' });
          resource = o.capture ? captureView(state.captures.get(o.capture)) : { id: o.id, status: o.status, purchase_units: [{ custom_id: o.customId, amount: money(o.amountCents, o.currency) }] };
        } else if (parsed.eventId) {
          const e = state.events.get(parsed.eventId);
          if (!e) return json(res, 404, { error: 'no such event' });
          const records = [];
          for (let i = 0; i < (parsed.count ?? 1); i += 1) records.push(await deliver(e, { tamper: parsed.tamper === true }));
          return json(res, 200, { ok: true, event: e, deliveries: records });
        } else {
          return json(res, 400, { error: 'orderId, captureId or eventId required' });
        }
        if (parsed.resourceOverride) Object.assign(resource, parsed.resourceOverride);
        const event = buildEvent(parsed.type, resource);
        const records = [];
        for (let i = 0; i < (parsed.count ?? 1); i += 1) {
          if (parsed.delayMs) await new Promise((r) => setTimeout(r, parsed.delayMs));
          records.push(await deliver(event, { tamper: parsed.tamper === true }));
        }
        return json(res, 200, { ok: true, event, deliveries: records });
      }
      case '/__sim/state':
        return json(res, 200, {
          modes: state.modes, config: { ...state.config, secret: undefined },
          orders: Array.from(state.orders.values()), captures: Array.from(state.captures.values()),
          refunds: Array.from(state.refunds.values()), events: Array.from(state.events.values()).map((e) => ({ id: e.id, type: e.event_type })),
          deliveries: state.deliveries,
        });
      case '/__sim/calls':
        return json(res, 200, state.calls);
      default:
        return json(res, 404, { error: 'unknown control' });
    }
  }

  const server = http.createServer((req, res) => {
    handle(req, res).catch((cause) => {
      json(res, 500, { name: 'SIM_ERROR', message: String(cause) });
    });
  });

  return {
    server,
    state,
    listen: (port = 0) => new Promise((resolve) => server.listen(port, '127.0.0.1', () => resolve(`http://127.0.0.1:${server.address().port}`))),
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}

export async function startPayPalSim(port = 0) {
  const sim = createPayPalSim();
  const url = await sim.listen(port);
  return { ...sim, url };
}

/* ── Helpers ─────────────────────────────────────────────────────────── */

function readBody(req) {
  return new Promise((resolve) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', () => resolve(''));
  });
}
function safeParse(text) {
  try { return text ? JSON.parse(text) : null; } catch { return null; }
}
function toCents(value) {
  if (typeof value !== 'string') return null;
  const m = /^(\d+)(?:\.(\d{1,2}))?$/.exec(value.trim());
  if (!m) return null;
  return Number(m[1]) * 100 + Number((m[2] ?? '').padEnd(2, '0'));
}

if (process.argv[1] && process.argv[1].endsWith('paypal-sim.mjs')) {
  const port = Number(process.argv[2] ?? 0);
  startPayPalSim(port).then((sim) => console.log(`paypal-sim listening on ${sim.url}`));
}
