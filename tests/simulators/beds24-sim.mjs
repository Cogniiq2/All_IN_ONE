/**
 * ══════════════════════════════════════════════════════════════════════════
 * BEDS24 SIMULATOR — a controllable HTTP channel manager.
 *
 * Speaks the Beds24 V2 subset the live adapter uses — token, properties,
 * calendar, offers, bookings read/search/write — on a real port, so the REAL
 * `lib/integrations/beds24/*` code runs unmodified against it. Every
 * plausible provider behaviour the code must survive is a scripted MODE:
 *
 *   hold      success · conflict · timeout · server_error · malformed
 *             · response_lost (the booking is created, the socket dies)
 *             · reference_absent (no `reference` echoed)
 *             · mismatch (right id, wrong room/dates)
 *             · duplicate_result (two entries in the write response)
 *   finalize  success · failure (success:false) · response_lost
 *             · status_mismatch (lands in a different status)
 *   release   success · response_lost · timeout · still_closed (cancelled, but
 *             the nights stay closed — something else holds them)
 *   read      success · not_found · reference_absent · status_mismatch
 *             · timeout
 *   search    success · not_found · reference_absent · timeout
 *   calendar  success · timeout · server_error
 *   offers    success · unavailable · timeout · no_price
 *   token     success · unauthorized · timeout
 *
 * Inventory is a real per-room calendar: bookings in a BLOCKING status close
 * their nights, `POST /__sim/block` closes nights from "outside" (a
 * Booking.com reservation landing between quote and hold), and which
 * statuses block is a per-property setting — exactly the uncertainty the
 * live account has.
 *
 * Control API:
 *   POST /__sim/reset
 *   POST /__sim/config   { blockingStatuses: [...], honourIdempotency: bool, nightlyCents }
 *   POST /__sim/mode     { op, mode }
 *   POST /__sim/block    { roomId, from, to }        [from, to) closed externally
 *   POST /__sim/unblock  { roomId, from, to }
 *   GET  /__sim/state
 *   GET  /__sim/calls
 * ══════════════════════════════════════════════════════════════════════════
 */

import http from 'node:http';

const PROPERTIES = [
  { id: 354659, name: 'Schulstraße I (sim)', currency: 'EUR', roomTypes: [{ id: 731147, name: 'Apartment', maxPeople: 4, qty: 1 }] },
  { id: 354658, name: 'Schulstraße II (sim)', currency: 'EUR', roomTypes: [{ id: 731146, name: 'Apartment', maxPeople: 4, qty: 1 }] },
];

const DEFAULT_MODES = { token: 'success', calendar: 'success', offers: 'success', hold: 'success', finalize: 'success', release: 'success', read: 'success', search: 'success' };

export function createBeds24Sim() {
  const state = freshState();
  function freshState() {
    return {
      modes: { ...DEFAULT_MODES },
      config: { blockingStatuses: ['new', 'confirmed', 'request'], honourIdempotency: true, nightlyCents: 14_000, cleaningCents: 4_500, token: 'sim-beds24-token' },
      bookings: new Map(),
      blocks: [],
      idempotency: new Map(),
      calls: [],
      counter: 900_000,
    };
  }

  function json(res, status, body) {
    const text = JSON.stringify(body);
    res.writeHead(status, { 'content-type': 'application/json', 'content-length': Buffer.byteLength(text) });
    res.end(text);
  }
  function failure(mode, req, res) {
    switch (mode) {
      case 'timeout': return true;
      case 'server_error': json(res, 500, { success: false, error: 'internal' }); return true;
      case 'malformed': res.writeHead(200, { 'content-type': 'application/json' }); res.end('{not json'); return true;
      case 'unauthorized': json(res, 401, { success: false, error: 'invalid token' }); return true;
      default: return false;
    }
  }

  /* ── Inventory ───────────────────────────────────────────────────────── */

  const addDays = (date, n) => { const d = new Date(`${date}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  function nightsClosed(roomId, from, toExclusive) {
    const closed = new Set();
    for (const b of state.bookings.values()) {
      if (String(b.roomId) !== String(roomId)) continue;
      if (!state.config.blockingStatuses.includes(b.status)) continue;
      for (let d = b.arrival; d < b.departure; d = addDays(d, 1)) if (d >= from && d < toExclusive) closed.add(d);
    }
    for (const blk of state.blocks) {
      if (String(blk.roomId) !== String(roomId)) continue;
      for (let d = blk.from; d < blk.to; d = addDays(d, 1)) if (d >= from && d < toExclusive) closed.add(d);
    }
    return closed;
  }
  function calendar(roomId, propertyId, from, toInclusive) {
    const toExclusive = addDays(toInclusive, 1);
    const closed = nightsClosed(roomId, from, toExclusive);
    // Compressed runs, as Beds24 sends them.
    const runs = [];
    let d = from;
    while (d < toExclusive) {
      const avail = closed.has(d) ? 0 : 1;
      let end = d;
      while (addDays(end, 1) < toExclusive && (closed.has(addDays(end, 1)) ? 0 : 1) === avail) end = addDays(end, 1);
      runs.push({ from: d, to: end, numAvail: avail, minStay: 1, maxStay: 30, price1: state.config.nightlyCents / 100 });
      d = addDays(end, 1);
    }
    return { success: true, data: [{ roomId: Number(roomId), propertyId: Number(propertyId), calendar: runs }] };
  }

  function bookingView(b, { omitReference = false, statusOverride = null } = {}) {
    const view = { id: b.id, roomId: b.roomId, propertyId: b.propertyId, status: statusOverride ?? b.status, arrival: b.arrival, departure: b.departure, numAdult: b.numAdult, numChild: b.numChild, price: b.price, referer: b.referer, reference: b.reference, notes: b.notes };
    if (omitReference) delete view.reference;
    return view;
  }

  async function handle(req, res) {
    const url = new URL(req.url, 'http://sim');
    const body = await readBody(req);
    state.calls.push({ method: req.method, path: url.pathname, query: Object.fromEntries(url.searchParams), idempotencyKey: req.headers['idempotency-key'] ?? null, body: safeParse(body), at: Date.now() });
    if (url.pathname.startsWith('/__sim/')) return control(url, res, body);

    if (url.pathname === '/authentication/token') {
      if (failure(state.modes.token, req, res)) return;
      if (!req.headers.refreshtoken) return json(res, 401, { success: false });
      return json(res, 200, { token: state.config.token, expiresIn: 86400 });
    }
    if (req.headers.token !== state.config.token) return json(res, 401, { success: false, error: 'invalid token' });

    if (url.pathname === '/properties') {
      return json(res, 200, { success: true, data: PROPERTIES.map((p) => ({ id: p.id, name: p.name, currency: p.currency, roomTypes: url.searchParams.get('includeAllRooms') === 'true' ? p.roomTypes : undefined })) });
    }

    if (url.pathname === '/inventory/rooms/calendar') {
      if (failure(state.modes.calendar, req, res)) return;
      const q = url.searchParams;
      return json(res, 200, calendar(q.get('roomId'), q.get('propertyId'), q.get('startDate'), q.get('endDate')));
    }

    if (url.pathname === '/inventory/rooms/offers') {
      const mode = state.modes.offers;
      if (failure(mode, req, res)) return;
      const q = url.searchParams;
      const roomId = q.get('roomId'); const propertyId = q.get('propertyId');
      const arrival = q.get('arrival'); const departure = q.get('departure');
      const closed = nightsClosed(roomId, arrival, departure);
      const nights = Math.round((Date.parse(departure) - Date.parse(arrival)) / 86_400_000);
      const offers = mode === 'unavailable' || closed.size > 0 || nights < 1
        ? []
        : [{ offerId: 1, name: 'Standard', price: mode === 'no_price' ? undefined : (state.config.nightlyCents * nights) / 100, currency: 'EUR', fees: [{ name: 'Endreinigung', amount: state.config.cleaningCents / 100, type: 'fixed' }] }];
      return json(res, 200, { success: true, data: [{ propertyId: Number(propertyId), roomTypes: [{ roomId: Number(roomId), offers }] }] });
    }

    if (url.pathname === '/bookings' && req.method === 'GET') {
      const q = url.searchParams;
      if (q.get('id')) {
        const mode = state.modes.read;
        if (failure(mode, req, res)) return;
        const b = state.bookings.get(String(q.get('id')));
        if (!b || mode === 'not_found') return json(res, 200, { success: true, data: [] });
        const view = bookingView(b, { omitReference: mode === 'reference_absent', statusOverride: mode === 'status_mismatch' ? 'request' : null });
        if (mode === 'mismatch') { view.roomId = 999999; view.arrival = addDays(b.arrival, 1); }
        return json(res, 200, { success: true, data: [view] });
      }
      const mode = state.modes.search;
      if (failure(mode, req, res)) return;
      if (mode === 'not_found') return json(res, 200, { success: true, data: [] });
      const rows = Array.from(state.bookings.values()).filter((b) =>
        (!q.get('roomId') || String(b.roomId) === q.get('roomId')) &&
        (!q.get('propertyId') || String(b.propertyId) === q.get('propertyId')) &&
        (!q.get('arrivalFrom') || b.arrival >= q.get('arrivalFrom')) &&
        (!q.get('arrivalTo') || b.arrival <= q.get('arrivalTo')));
      return json(res, 200, { success: true, data: rows.map((b) => bookingView(b, { omitReference: mode === 'reference_absent' })) });
    }

    if (url.pathname === '/bookings' && req.method === 'POST') {
      const items = safeParse(body);
      if (!Array.isArray(items) || items.length === 0) return json(res, 400, { success: false });
      const item = items[0];
      const key = req.headers['idempotency-key'];

      if (item.id === undefined || item.id === null) {
        /* create — the hold */
        const mode = state.modes.hold;
        if (failure(mode, req, res)) return;
        if (mode === 'conflict') return json(res, 200, [{ success: false, errors: [{ field: 'arrival', message: 'not available' }] }]);
        if (key && state.config.honourIdempotency && state.idempotency.has(key)) {
          const b = state.bookings.get(state.idempotency.get(key));
          return json(res, 200, [{ success: true, new: bookingView(b) }]);
        }
        const closed = nightsClosed(item.roomId, item.arrival, item.departure);
        if (closed.size > 0) return json(res, 200, [{ success: false, errors: [{ field: 'arrival', message: 'not available' }] }]);
        const b = { id: ++state.counter, roomId: item.roomId, propertyId: item.propertyId, status: item.status ?? 'new', arrival: item.arrival, departure: item.departure, numAdult: item.numAdult, numChild: item.numChild, price: item.price, referer: item.referer, reference: item.reference, notes: item.notes, createdAt: new Date().toISOString() };
        state.bookings.set(String(b.id), b);
        if (key) state.idempotency.set(key, String(b.id));
        if (mode === 'response_lost') return req.socket.destroy();
        let view = bookingView(b, { omitReference: mode === 'reference_absent' });
        if (mode === 'mismatch') view = { ...view, roomId: 999999, arrival: addDays(b.arrival, 1), departure: addDays(b.departure, 1) };
        const out = [{ success: true, new: view }];
        if (mode === 'duplicate_result') out.push({ success: true, new: { ...view, id: b.id + 1 } });
        return json(res, 200, out);
      }

      /* modify — finalize or release */
      const b = state.bookings.get(String(item.id));
      if (!b) return json(res, 200, [{ success: false, errors: [{ field: 'id', message: 'not found' }] }]);
      if (item.status === 'cancelled') {
        const mode = state.modes.release;
        if (failure(mode, req, res)) return;
        b.status = 'cancelled';
        b.notes = item.notes ?? b.notes;
        if (mode === 'still_closed') state.blocks.push({ roomId: b.roomId, from: b.arrival, to: b.departure, reason: 'phantom' });
        if (mode === 'response_lost') return req.socket.destroy();
        return json(res, 200, [{ success: true, modified: bookingView(b) }]);
      }
      const mode = state.modes.finalize;
      if (failure(mode, req, res)) return;
      if (mode === 'failure') return json(res, 200, [{ success: false, errors: [{ field: 'status', message: 'not accepted' }] }]);
      b.status = mode === 'status_mismatch' ? 'request' : item.status;
      if (mode === 'response_lost') return req.socket.destroy();
      return json(res, 200, [{ success: true, modified: bookingView(b) }]);
    }

    return json(res, 404, { success: false, error: 'unknown endpoint' });
  }

  function control(url, res, body) {
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
      case '/__sim/block':
        state.blocks.push({ roomId: parsed.roomId, from: parsed.from, to: parsed.to, reason: parsed.reason ?? 'external' });
        return json(res, 200, { ok: true, blocks: state.blocks });
      case '/__sim/unblock':
        state.blocks = state.blocks.filter((b) => !(String(b.roomId) === String(parsed.roomId) && b.from === parsed.from && b.to === parsed.to));
        return json(res, 200, { ok: true, blocks: state.blocks });
      case '/__sim/state':
        return json(res, 200, { modes: state.modes, config: { ...state.config, token: undefined }, bookings: Array.from(state.bookings.values()), blocks: state.blocks });
      case '/__sim/calls':
        return json(res, 200, state.calls);
      default:
        return json(res, 404, { error: 'unknown control' });
    }
  }

  const server = http.createServer((req, res) => {
    handle(req, res).catch((cause) => json(res, 500, { success: false, error: String(cause) }));
  });

  return {
    server,
    state,
    listen: (port = 0) => new Promise((resolve) => server.listen(port, '127.0.0.1', () => resolve(`http://127.0.0.1:${server.address().port}`))),
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}

export async function startBeds24Sim(port = 0) {
  const sim = createBeds24Sim();
  const url = await sim.listen(port);
  return { ...sim, url };
}

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

if (process.argv[1] && process.argv[1].endsWith('beds24-sim.mjs')) {
  const port = Number(process.argv[2] ?? 0);
  startBeds24Sim(port).then((sim) => console.log(`beds24-sim listening on ${sim.url}`));
}
