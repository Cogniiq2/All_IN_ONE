#!/usr/bin/env node
/**
 * BoLaGio n8n package — deterministic workflow generator.
 *
 *   node n8n/build.mjs              writes n8n/workflows/*.json
 *   node n8n/build.mjs --out DIR    writes the same files into DIR
 *
 * Every workflow is described in plain JavaScript below and serialised with
 * stable ids (derived from names), fixed positions and no timestamps, so the
 * committed JSON is regenerable byte for byte. No dependencies.
 *
 * Isolation on the shared Cogniiq/BoLaGio instance: every workflow name starts
 * with "BoLaGio ·", carries the tag "bolagio", reads only BOLAGIO_* variables,
 * references only credentials named "BoLaGio …", and reports errors to the
 * BoLaGio error workflow. Nothing here touches a Cogniiq resource.
 */

import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// ─────────────────────────────────────────────────────────────────────────────
// Deterministic identifiers
// ─────────────────────────────────────────────────────────────────────────────

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

/** 16-character n8n workflow id derived from the workflow name. */
function workflowId(name) {
  const digest = createHash('sha256').update('bolagio-workflow:' + name).digest();
  let id = '';
  for (let i = 0; i < 16; i += 1) id += ALPHABET[digest[i] % ALPHABET.length];
  return id;
}

/** UUID-shaped node id derived from workflow name + node name. */
function nodeId(workflowName, nodeName) {
  const h = createHash('sha256').update('bolagio-node:' + workflowName + ':' + nodeName).digest('hex');
  const variant = ['8', '9', 'a', 'b'][parseInt(h[16], 16) % 4];
  return h.slice(0, 8) + '-' + h.slice(8, 12) + '-4' + h.slice(13, 16) + '-' + variant + h.slice(17, 20) + '-' + h.slice(20, 32);
}

/** UUID-shaped id for a condition inside a Switch / If node. */
function conditionId(workflowName, nodeName, index) {
  return nodeId(workflowName, nodeName + '#condition#' + index);
}

/** Placeholder credential id; n8n resolves the credential by NAME on import. */
function credentialPlaceholderId(name) {
  return workflowId('credential:' + name);
}

// ─────────────────────────────────────────────────────────────────────────────
// Workflow names, ids, environment
// ─────────────────────────────────────────────────────────────────────────────

const NAMES = {
  pump: 'BoLaGio · Outbox Event Pump',
  guest: 'BoLaGio · Guest Message',
  cleaning: 'BoLaGio · Cleaning Routing',
  alert: 'BoLaGio · Operational Alert',
  health: 'BoLaGio · Health Poll',
  error: 'BoLaGio · Error Handler',
};

const IDS = Object.fromEntries(Object.entries(NAMES).map(([key, name]) => [key, workflowId(name)]));

const FILES = {
  pump: 'bolagio-outbox-event-pump.json',
  guest: 'bolagio-guest-message.json',
  cleaning: 'bolagio-cleaning-routing.json',
  alert: 'bolagio-operational-alert.json',
  health: 'bolagio-health-poll.json',
  error: 'bolagio-error-handler.json',
};

const SMTP_CREDENTIAL = { smtp: { id: credentialPlaceholderId('BoLaGio SMTP'), name: 'BoLaGio SMTP' } };

const WORKER = 'n8n-bolagio';
const CLAIM_LIMIT = 20;

// ─────────────────────────────────────────────────────────────────────────────
// Shared Code-node JavaScript.
//
// The blocks below are copied verbatim into every workflow that needs them.
// They are written with String.raw and plain concatenation (no template
// interpolation) so that what is committed is exactly what n8n runs.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The signed request to the BoLaGio internal API. Identical text in every
 * workflow. The body STRING is built by the caller, signed here, and handed to
 * n8n's HTTP helper unchanged — the signature is over the bytes that leave the
 * node, never over a re-serialised object.
 */
const SIGNED_REQUEST = String.raw`// ═══ BoLaGio internal API client — identical in every "BoLaGio ·" workflow ═══
// HMAC-SHA256 over "v1:<unix seconds>:<raw body>" (docs/n8n-booking-contract.md §2).
// The body string is built once, signed, and sent unchanged. A GET signs "".
// Requires: NODE_FUNCTION_ALLOW_BUILTIN to include "crypto", env access in Code nodes.
const crypto = require('crypto');
const helpers = this.helpers;

function bolagioConfig() {
  const site = String($env.BOLAGIO_SITE_URL || '').replace(new RegExp('/+$'), '');
  const secret = String($env.BOLAGIO_N8N_INTERNAL_SECRET || '');
  if (!new RegExp('^https?://').test(site)) throw new Error('BOLAGIO_SITE_URL is not set (expected https://host without trailing slash)');
  if (!secret) throw new Error('BOLAGIO_N8N_INTERNAL_SECRET is not set');
  return { site, secret };
}

function bolagioSignature(secret, timestamp, rawBody) {
  return 'v1=' + crypto.createHmac('sha256', secret).update('v1:' + timestamp + ':' + rawBody).digest('hex');
}

async function bolagioRequest(method, path, rawBody) {
  const config = bolagioConfig();
  const body = method === 'GET' ? '' : String(rawBody);
  const timestamp = String(Math.floor(Date.now() / 1000));
  const headers = {
    'x-bolagio-timestamp': timestamp,
    'x-bolagio-signature': bolagioSignature(config.secret, timestamp, body),
    accept: 'application/json',
  };
  const options = {
    method: method,
    url: config.site + path,
    headers: headers,
    returnFullResponse: true,
    ignoreHttpStatusErrors: true,
    timeout: 20000,
  };
  if (method !== 'GET') {
    headers['content-type'] = 'application/json';
    options.body = body;
    options.json = false;
  }
  const response = await helpers.httpRequest(options);
  const status = Number(response.statusCode);
  let data = response.body;
  if (typeof data === 'string') {
    if (data.length === 0) data = null;
    else { try { data = JSON.parse(data); } catch (err) { data = { raw: data.slice(0, 200) }; } }
  }
  if (data === undefined) data = null;
  return { status: status, data: data };
}

function bolagioExpect(result, path) {
  if (result.status === 401) throw new Error('BoLaGio ' + path + ': 401 (secret mismatch, clock skew or re-serialised body)');
  if (result.status < 200 || result.status >= 300) throw new Error('BoLaGio ' + path + ': HTTP ' + result.status);
  return result.data;
}
// ═══ end of shared client ═══
`;

/** Error text hygiene: strip e-mail addresses, cap the length. Identical everywhere. */
const REDACT = String.raw`// Error text never carries guest data: e-mail addresses are masked, length capped.
function redact(text) {
  const raw = text === undefined || text === null ? '' : (typeof text === 'string' ? text : (text.message || JSON.stringify(text)));
  return String(raw).replace(new RegExp('[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}', 'g'), '[email]').slice(0, 400);
}
`;

/** Transport resolution: unset → disabled; unknown value → error (never a silent skip). */
function transportResolver(variable, allowed) {
  return String.raw`function resolveTransport() {
  const value = String($env.` + variable + String.raw` || 'disabled').trim().toLowerCase();
  const allowed = ` + JSON.stringify(allowed) + String.raw`;
  if (!allowed.includes(value)) throw new Error('` + variable + String.raw` has an unsupported value; expected one of ' + allowed.join(', '));
  return value;
}
`;
}

/** Alert → generic webhook payload (Slack / Teams / Discord incoming webhooks). Identical text in both alert paths. */
const ALERT_FORMATTER = String.raw`// Generic incoming-webhook payload: "text" is read by Slack and Teams, "content" by Discord.
// Alert bodies carry a booking reference and a code — never guest data.
function formatAlert(alert) {
  const level = String(alert.level || 'HIGH').toUpperCase();
  const environment = String(alert.environment || $env.BOLAGIO_ENVIRONMENT || 'unknown');
  const lines = ['[' + environment + '] ' + level + ' · ' + alert.code + ' — ' + alert.title];
  if (alert.detail) lines.push(String(alert.detail));
  if (alert.reference) lines.push('Reference: ' + alert.reference);
  const text = lines.join('\n');
  return {
    level: level,
    code: String(alert.code),
    title: String(alert.title),
    detail: alert.detail ? String(alert.detail) : undefined,
    reference: alert.reference ? String(alert.reference) : undefined,
    environment: environment,
    source: 'bolagio-n8n',
    text: text,
    content: text,
  };
}
`;

// ─────────────────────────────────────────────────────────────────────────────
// Node builders
// ─────────────────────────────────────────────────────────────────────────────

function makeBuilder(workflowName) {
  const nodes = [];
  const connections = {};

  function add(name, type, typeVersion, parameters, position, extra = {}) {
    const node = { parameters, id: nodeId(workflowName, name), name, type, typeVersion, position };
    if (extra.credentials) node.credentials = extra.credentials;
    if (extra.onError) node.onError = extra.onError;
    if (extra.notes) node.notes = extra.notes;
    nodes.push(node);
    return name;
  }

  function connect(from, to, fromIndex = 0, toIndex = 0) {
    const entry = (connections[from] ??= { main: [] });
    while (entry.main.length <= fromIndex) entry.main.push([]);
    entry.main[fromIndex].push({ node: to, type: 'main', index: toIndex });
  }

  const code = (name, jsCode, position, mode = 'runOnceForAllItems', extra = {}) =>
    add(name, 'n8n-nodes-base.code', 2, { mode, jsCode }, position, extra);

  const noOp = (name, position) => add(name, 'n8n-nodes-base.noOp', 1, {}, position);

  const executeWorkflow = (name, targetId, position) =>
    add(
      name,
      'n8n-nodes-base.executeWorkflow',
      1.1,
      {
        workflowId: { __rl: true, mode: 'id', value: targetId },
        mode: 'once',
        options: { waitForSubWorkflow: true },
      },
      position,
      { onError: 'continueRegularOutput' }
    );

  const subWorkflowTrigger = (name, position) =>
    add(name, 'n8n-nodes-base.executeWorkflowTrigger', 1.1, { inputSource: 'passthrough' }, position);

  const schedule = (name, interval, position) =>
    add(name, 'n8n-nodes-base.scheduleTrigger', 1.2, { rule: { interval: [interval] } }, position);

  /** A string-equals Switch on `$json.<field>` with named outputs and a fallback "extra" output. */
  function stringSwitch(name, field, outputs, position) {
    const values = outputs.map((value, index) => ({
      conditions: {
        options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 2 },
        conditions: [
          {
            id: conditionId(workflowName, name, index),
            leftValue: '={{ $json.' + field + ' }}',
            rightValue: value,
            operator: { type: 'string', operation: 'equals' },
          },
        ],
        combinator: 'and',
      },
      renameOutput: true,
      outputKey: value,
    }));
    return add(
      name,
      'n8n-nodes-base.switch',
      3.2,
      { rules: { values }, options: { fallbackOutput: 'extra' } },
      position
    );
  }

  function ifEquals(name, field, value, position) {
    return add(
      name,
      'n8n-nodes-base.if',
      2.2,
      {
        conditions: {
          options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 2 },
          conditions: [
            {
              id: conditionId(workflowName, name, 0),
              leftValue: '={{ $json.' + field + ' }}',
              rightValue: value,
              operator: { type: 'string', operation: 'equals' },
            },
          ],
          combinator: 'and',
        },
        options: {},
      },
      position
    );
  }

  /** HTTP POST of `$json.<field>` as JSON to `$env.<urlVariable>`; errors become items. */
  function jsonWebhook(name, urlVariable, field, position) {
    return add(
      name,
      'n8n-nodes-base.httpRequest',
      4.2,
      {
        method: 'POST',
        url: '={{ $env.' + urlVariable + ' }}',
        sendHeaders: true,
        headerParameters: { parameters: [{ name: 'content-type', value: 'application/json' }] },
        sendBody: true,
        contentType: 'json',
        specifyBody: 'json',
        jsonBody: '={{ JSON.stringify($json.' + field + ') }}',
        options: { timeout: 15000 },
      },
      position,
      { onError: 'continueRegularOutput' }
    );
  }

  function email(name, params, position) {
    return add(
      name,
      'n8n-nodes-base.emailSend',
      2.1,
      { fromEmail: '={{ $env.BOLAGIO_MAIL_FROM }}', options: { appendAttribution: false }, ...params },
      position,
      { credentials: SMTP_CREDENTIAL, onError: 'continueRegularOutput' }
    );
  }

  /** Transport switch: rule 0 is always "disabled"; the fallback output is wired to the same node as "disabled". */
  function transportSwitch(name, transports, position) {
    if (transports[0] !== 'disabled') throw new Error('transport switch must list disabled first');
    return stringSwitch(name, 'transport', transports, position);
  }

  function wireTransportFallback(switchName, transports, disabledTarget) {
    connect(switchName, disabledTarget, transports.length, 0); // the "extra" fallback output
  }

  return {
    add, connect, code, noOp, executeWorkflow, subWorkflowTrigger, schedule, stringSwitch, ifEquals,
    jsonWebhook, email, transportSwitch, wireTransportFallback,
    build(extraSettings = {}) {
      return { nodes, connections, extraSettings };
    },
  };
}

function finish(name, id, built, { errorWorkflow = IDS.error } = {}) {
  const settings = { executionOrder: 'v1', timezone: 'Europe/Berlin', ...built.extraSettings };
  if (errorWorkflow) settings.errorWorkflow = errorWorkflow;
  return {
    name,
    nodes: built.nodes,
    connections: built.connections,
    settings,
    tags: [{ name: 'bolagio' }],
    id,
    active: false,
    pinData: {},
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// (A) Outbox Event Pump
// ─────────────────────────────────────────────────────────────────────────────

const GUEST_KINDS = {
  'booking.confirmed': 'booking_confirmation',
  'guest.prearrival_ready': 'prearrival',
  'guest.checkin_ready': 'checkin',
  'guest.checkout_ready': 'checkout',
  'review.requested': 'review_request',
};
const CLEANING_ACTIONS = {
  'cleaning.required': 'upsert',
  'cleaning.rescheduled': 'upsert',
  'cleaning.cancelled': 'cancel',
};
const ALERT_TYPES = [
  'booking.paid_unfinalized',
  'booking.manual_review_required',
  'booking.release_failed',
  'booking.cancellation_requested',
  'payment.refunded',
  'payment.failed',
  'invoice.required',
];
const SILENT_TYPES = ['booking.held', 'payment.order_created', 'payment.completed', 'booking.cancelled', 'booking.expired'];

const ROUTES = [
  'guest:booking_confirmation',
  'guest:prearrival',
  'guest:checkin',
  'guest:checkout',
  'guest:review_request',
  'cleaning',
  'alert',
  'silent',
  'unsupported',
];

const CLAIM_CODE =
  SIGNED_REQUEST +
  String.raw`
// Claim a batch. The claim is a five-minute LEASE, not a removal: an execution that
// dies mid-batch leaves rows whose lease lapses, and the next claim picks them up.
const WORKER = '` + WORKER + String.raw`';
const body = JSON.stringify({ action: 'claim', worker: WORKER, limit: ` + String(CLAIM_LIMIT) + String.raw` });
const claimed = bolagioExpect(await bolagioRequest('POST', '/api/internal/outbox', body), '/api/internal/outbox');
const events = claimed && Array.isArray(claimed.events) ? claimed.events : [];
// One item per event; no events → no items → the rest of the workflow does not run.
return events.map(function (event) {
  return { json: {
    eventId: String(event.id),
    type: String(event.type),
    version: Number(event.version),
    reference: event.reference === undefined ? null : event.reference,
    occurredAt: event.occurredAt,
    attempt: Number(event.attempt || 1),
    payload: event.payload && typeof event.payload === 'object' ? event.payload : {},
    worker: WORKER,
  } };
});
`;

const CLASSIFY_CODE = String.raw`// Decide what an event means. Only known (type, version 1) pairs get a route;
// everything else is refused explicitly, so an unknown event dead-letters visibly
// instead of being acknowledged away.
const GUEST_KINDS = ` + JSON.stringify(GUEST_KINDS, null, 2) + String.raw`;
const CLEANING_ACTIONS = ` + JSON.stringify(CLEANING_ACTIONS, null, 2) + String.raw`;
const ALERT_TYPES = ` + JSON.stringify(ALERT_TYPES) + String.raw`;
const SILENT_TYPES = ` + JSON.stringify(SILENT_TYPES) + String.raw`;

const event = $input.item.json;
const type = String(event.type || '');
let route = 'unsupported';
let kind = null;
let cleaningAction = null;

if (event.version === 1) {
  if (Object.prototype.hasOwnProperty.call(GUEST_KINDS, type)) { kind = GUEST_KINDS[type]; route = 'guest:' + kind; }
  else if (Object.prototype.hasOwnProperty.call(CLEANING_ACTIONS, type)) { cleaningAction = CLEANING_ACTIONS[type]; route = 'cleaning'; }
  else if (ALERT_TYPES.includes(type)) route = 'alert';
  else if (SILENT_TYPES.includes(type)) route = 'silent';
}

return { json: Object.assign({}, event, { route: route, kind: kind, cleaningAction: cleaningAction }) };
`;

const SILENT_CODE = String.raw`// Acknowledged without side effects: the event is informational for n8n.
const event = $input.first().json;
return [{ json: { eventId: event.eventId, ok: true, outcome: 'silent', type: event.type } }];
`;

const UNSUPPORTED_CODE = String.raw`// Refused on purpose. The backend retries with backoff and dead-letters after eight
// attempts, where an operator sees "unsupported type/version" in the ops queue.
const event = $input.first().json;
return [{ json: { eventId: event.eventId, ok: false, error: 'unsupported type/version', type: event.type, version: event.version } }];
`;

const SETTLE_CODE =
  SIGNED_REQUEST +
  REDACT +
  String.raw`
// Settle the event this loop iteration handled: ack when the handler reported ok,
// otherwise fail with its error (the backend schedules the retry).
const WORKER = '` + WORKER + String.raw`';
const current = $('Classify event').first().json;
const result = $input.first().json || {};
const eventId = String(result.eventId || current.eventId);
const ok = result.ok === true;

if (ok) {
  const body = JSON.stringify({ action: 'ack', worker: WORKER, eventId: eventId });
  const data = bolagioExpect(await bolagioRequest('POST', '/api/internal/outbox', body), '/api/internal/outbox');
  return [{ json: { eventId: eventId, settled: 'ack', acknowledged: data ? data.acknowledged === true : false, type: current.type } }];
}

const error = redact(result.error || 'handler returned no result');
const body = JSON.stringify({ action: 'fail', worker: WORKER, eventId: eventId, error: error });
const data = bolagioExpect(await bolagioRequest('POST', '/api/internal/outbox', body), '/api/internal/outbox');
return [{ json: { eventId: eventId, settled: 'fail', recorded: data ? data.recorded === true : false, error: error, type: current.type } }];
`;

function buildPump() {
  const b = makeBuilder(NAMES.pump);
  const trigger = b.schedule('Every 60 seconds', { field: 'seconds', secondsInterval: 60 }, [0, 400]);
  const claim = b.code('Claim events', CLAIM_CODE, [240, 400]);
  const loop = b.add('Loop over events', 'n8n-nodes-base.splitInBatches', 3, { batchSize: 1, options: {} }, [480, 400]);
  const done = b.noOp('Batch complete', [720, 160]);
  const classify = b.code('Classify event', CLASSIFY_CODE, [720, 480], 'runOnceForEachItem');
  const route = b.stringSwitch('Route by type', 'route', ROUTES, [960, 480]);

  const guestNodes = [
    ['Guest Message · Confirmation', 0],
    ['Guest Message · Pre-arrival', 1],
    ['Guest Message · Check-in', 2],
    ['Guest Message · Check-out', 3],
    ['Guest Message · Review request', 4],
  ].map(([name, row]) => b.executeWorkflow(name, IDS.guest, [1260, 40 + row * 160]));
  const cleaning = b.executeWorkflow('Cleaning Routing', IDS.cleaning, [1260, 840]);
  const alert = b.executeWorkflow('Operational Alert', IDS.alert, [1260, 1000]);
  const silent = b.code('Handled silently', SILENT_CODE, [1260, 1160]);
  const unsupported = b.code('Reject unsupported event', UNSUPPORTED_CODE, [1260, 1320]);
  const settle = b.code('Settle event (ack or fail)', SETTLE_CODE, [1560, 480]);

  b.connect(trigger, claim);
  b.connect(claim, loop);
  b.connect(loop, done, 0);
  b.connect(loop, classify, 1);
  b.connect(classify, route);
  guestNodes.forEach((name, index) => b.connect(route, name, index));
  b.connect(route, cleaning, 5);
  b.connect(route, alert, 6);
  b.connect(route, silent, 7);
  b.connect(route, unsupported, 8);
  b.connect(route, unsupported, ROUTES.length); // fallback output → refused as well
  for (const name of [...guestNodes, cleaning, alert, silent, unsupported]) b.connect(name, settle);
  b.connect(settle, loop); // back edge: next event

  return finish(NAMES.pump, IDS.pump, b.build());
}

// ─────────────────────────────────────────────────────────────────────────────
// (B) Guest Message — one sub-workflow, `kind` as input, serves the five flows
// ─────────────────────────────────────────────────────────────────────────────

const MESSAGING_TRANSPORTS = ['disabled', 'test', 'smtp'];

const PREPARE_CODE =
  SIGNED_REQUEST +
  transportResolver('BOLAGIO_MESSAGING_TRANSPORT', MESSAGING_TRANSPORTS) +
  String.raw`
// Ask the backend for a delivery slot. The backend renders the template, checks the
// booking is still confirmed and enforces exactly-once per (booking, kind); n8n only
// transports. The transport is resolved BEFORE claiming, so a misconfigured
// instance never claims a slot it cannot fill.
const KINDS = ['booking_confirmation', 'prearrival', 'checkin', 'checkout', 'review_request'];
const input = $input.first().json;
const kind = String(input.kind || '');
const reference = String(input.reference || '');
const eventId = input.eventId ? String(input.eventId) : undefined;
if (!KINDS.includes(kind)) throw new Error('guest message kind is not supported: ' + kind);
if (!new RegExp('^BLG-[A-Z0-9]{6}$').test(reference)) throw new Error('booking reference is missing or malformed');
const transport = resolveTransport();

const body = JSON.stringify(eventId ? { action: 'prepare', kind: kind, reference: reference, eventId: eventId } : { action: 'prepare', kind: kind, reference: reference });
const prepared = bolagioExpect(await bolagioRequest('POST', '/api/internal/messages', body), '/api/internal/messages');
if (!prepared || typeof prepared.outcome !== 'string') throw new Error('prepare returned no outcome');

// Only the fields the transport needs leave this node. The message (with the
// guest address) is present only on "claimed" and is consumed by the send node.
return [{ json: {
  eventId: eventId || null,
  reference: reference,
  kind: kind,
  transport: transport,
  outcome: prepared.outcome,
  deliveryId: prepared.deliveryId || null,
  attempt: prepared.attempt || null,
  reason: prepared.reason || null,
  message: prepared.outcome === 'claimed' ? prepared.message : null,
} }];
`;

const NOT_CLAIMED_CODE = String.raw`// No send. already_sent / suppressed / backoff / not_retryable / in_progress → ack the
// event (the ledger owns the outcome; in_progress means another worker holds the lease).
// unknown_reference is a data fault: fail the event so it is visible.
const item = $input.first().json;
const ACK_OUTCOMES = ['already_sent', 'suppressed', 'in_progress', 'backoff', 'not_retryable'];
if (ACK_OUTCOMES.includes(item.outcome)) {
  return [{ json: { eventId: item.eventId, reference: item.reference, kind: item.kind, ok: true, outcome: item.outcome, sent: false } }];
}
return [{ json: { eventId: item.eventId, reference: item.reference, kind: item.kind, ok: false, outcome: item.outcome, sent: false, error: 'prepare outcome ' + String(item.outcome) } }];
`;

const SKIP_CODE = String.raw`// Transport disabled: nothing is sent. The delivery is completed as "skipped" with
// provider "disabled", which is FINAL for this (booking, kind) — see n8n/test-mode.md.
const item = $input.first().json;
return [{ json: { eventId: item.eventId, reference: item.reference, kind: item.kind, deliveryId: item.deliveryId, completion: { outcome: 'skipped', provider: 'disabled' } } }];
`;

const TEST_SEND_CODE = String.raw`// Test transport: no message leaves n8n. The delivery is completed as "sent" with
// provider "test" — the backend refuses this provider on production.
const item = $input.first().json;
return [{ json: { eventId: item.eventId, reference: item.reference, kind: item.kind, deliveryId: item.deliveryId, completion: { outcome: 'sent', provider: 'test', providerMessageId: 'test-' + item.deliveryId } } }];
`;

const SMTP_RESULT_CODE =
  REDACT +
  String.raw`
// Interpret the Send Email node's output. Its error (if any) became an item because
// the node continues on error; the message id comes from the SMTP response.
const prepared = $('Prepare message').first().json;
const sent = $input.first().json || {};
let completion;
if (sent.error !== undefined && sent.error !== null) {
  completion = { outcome: 'failed', provider: 'smtp', error: redact(sent.error), retryable: true };
} else {
  const rejected = Array.isArray(sent.rejected) && sent.rejected.length > 0;
  completion = rejected
    ? { outcome: 'failed', provider: 'smtp', error: 'SMTP rejected the recipient', retryable: false }
    : { outcome: 'sent', provider: 'smtp', providerMessageId: sent.messageId ? String(sent.messageId).slice(0, 200) : undefined };
}
return [{ json: { eventId: prepared.eventId, reference: prepared.reference, kind: prepared.kind, deliveryId: prepared.deliveryId, completion: completion } }];
`;

const COMPLETE_CODE =
  SIGNED_REQUEST +
  String.raw`
// Settle the delivery slot with the backend, then report to the pump:
//   ok: true  → the pump acks the outbox event
//   ok: false → the pump fails it with the error (retry with backoff)
const item = $input.first().json;
const completion = item.completion;
const payload = { action: 'complete', deliveryId: item.deliveryId, outcome: completion.outcome, provider: completion.provider };
if (completion.providerMessageId) payload.providerMessageId = completion.providerMessageId;
if (completion.error) payload.error = completion.error;
if (completion.retryable !== undefined) payload.retryable = completion.retryable;
const body = JSON.stringify(payload);
const data = bolagioExpect(await bolagioRequest('POST', '/api/internal/messages', body), '/api/internal/messages');
const recorded = data ? data.recorded === true : false;
const ok = completion.outcome !== 'failed';
return [{ json: {
  eventId: item.eventId, reference: item.reference, kind: item.kind, deliveryId: item.deliveryId,
  ok: ok, outcome: completion.outcome, provider: completion.provider, recorded: recorded,
  sent: completion.outcome === 'sent',
  error: ok ? undefined : ('delivery failed via ' + completion.provider + ': ' + String(completion.error || 'unspecified')),
} }];
`;

const RETURN_CODE = String.raw`// The sub-workflow's answer to the pump. Always {eventId, ok, error?}; never throws.
const item = $input.first().json || {};
return [{ json: {
  eventId: item.eventId || null,
  reference: item.reference || null,
  kind: item.kind || null,
  ok: item.ok === true,
  outcome: item.outcome || null,
  sent: item.sent === true,
  error: item.ok === true ? undefined : String(item.error || 'unspecified'),
} }];
`;

function buildGuestMessage() {
  const b = makeBuilder(NAMES.guest);
  const trigger = b.subWorkflowTrigger('When called by the pump', [0, 300]);
  const prepare = b.code('Prepare message', PREPARE_CODE, [240, 300]);
  const claimed = b.ifEquals('Claimed?', 'outcome', 'claimed', [480, 300]);
  const transport = b.transportSwitch('Messaging transport', MESSAGING_TRANSPORTS, [720, 200]);
  const notClaimed = b.code('Acknowledge without sending', NOT_CLAIMED_CODE, [720, 520]);
  const skip = b.code('Skip (transport disabled)', SKIP_CODE, [1000, 60]);
  const testSend = b.code('Simulate send (test transport)', TEST_SEND_CODE, [1000, 220]);
  const smtp = b.email(
    'Send e-mail (SMTP)',
    {
      toEmail: '={{ $json.message.to }}',
      subject: '={{ $json.message.subject }}',
      emailFormat: 'both',
      text: '={{ $json.message.text }}',
      html: '={{ $json.message.html || $json.message.text }}',
    },
    [1000, 380]
  );
  const smtpResult = b.code('Record SMTP result', SMTP_RESULT_CODE, [1240, 380]);
  const complete = b.code('Complete delivery', COMPLETE_CODE, [1500, 220]);
  const result = b.code('Return result', RETURN_CODE, [1760, 300]);

  b.connect(trigger, prepare);
  b.connect(prepare, claimed);
  b.connect(claimed, transport, 0);
  b.connect(claimed, notClaimed, 1);
  b.connect(transport, skip, 0);
  b.connect(transport, testSend, 1);
  b.connect(transport, smtp, 2);
  b.wireTransportFallback(transport, MESSAGING_TRANSPORTS, skip);
  b.connect(smtp, smtpResult);
  b.connect(skip, complete);
  b.connect(testSend, complete);
  b.connect(smtpResult, complete);
  b.connect(complete, result);
  b.connect(notClaimed, result);

  return finish(NAMES.guest, IDS.guest, b.build());
}

// ─────────────────────────────────────────────────────────────────────────────
// (C) Cleaning Routing
// ─────────────────────────────────────────────────────────────────────────────

const CLEANING_TRANSPORTS = ['disabled', 'webhook'];

const CLEANING_ITEM_CODE =
  transportResolver('BOLAGIO_CLEANING_TRANSPORT', CLEANING_TRANSPORTS) +
  String.raw`
// One deterministic work item per stay, keyed on the booking reference. required and
// rescheduled both UPSERT the same key; cancelled CANCELS it — a downstream tool can
// never end up with two tasks for one turnover.
const event = $input.first().json;
const payload = event.payload && typeof event.payload === 'object' ? event.payload : {};
const reference = String(payload.reference || event.reference || '');
if (!new RegExp('^BLG-[A-Z0-9]{6}$').test(reference)) throw new Error('cleaning event without a booking reference');
const action = event.cleaningAction === 'cancel' ? 'cancel' : 'upsert';
const workItem = {
  action: action,
  key: 'bolagio:turnover:' + reference,
  reference: reference,
  unitSlug: payload.unitSlug === undefined ? null : payload.unitSlug,
  departure: payload.departure === undefined ? null : payload.departure,
  nextArrival: payload.nextArrival === undefined ? null : payload.nextArrival,
  sameDay: payload.sameDay === true,
  windowStart: payload.windowStart === undefined ? null : payload.windowStart,
  windowEnd: payload.windowEnd === undefined ? null : payload.windowEnd,
};
if (payload.previousDeparture !== undefined) workItem.previousDeparture = payload.previousDeparture;
return [{ json: { eventId: event.eventId, reference: reference, type: event.type, transport: resolveTransport(), workItem: workItem } }];
`;

const CLEANING_SKIP_CODE = String.raw`// Transport disabled: the turnover stays a fact in the backend (bolagio_turnovers);
// nothing is routed. The event is acknowledged so it does not pile up.
const item = $input.first().json;
return [{ json: { eventId: item.eventId, reference: item.reference, ok: true, outcome: 'skipped', transport: 'disabled' } }];
`;

const CLEANING_RESULT_CODE =
  REDACT +
  String.raw`
// Interpret the webhook call. A transport error became an item (continue on error);
// anything else is a 2xx and the work item is considered delivered.
const built = $('Build work item').first().json;
const response = $input.first().json || {};
if (response.error !== undefined && response.error !== null) {
  return [{ json: { eventId: built.eventId, reference: built.reference, ok: false, outcome: 'webhook_failed', error: 'cleaning webhook: ' + redact(response.error) } }];
}
return [{ json: { eventId: built.eventId, reference: built.reference, ok: true, outcome: 'delivered', transport: 'webhook', action: built.workItem.action } }];
`;

function buildCleaning() {
  const b = makeBuilder(NAMES.cleaning);
  const trigger = b.subWorkflowTrigger('When called by the pump', [0, 200]);
  const build = b.code('Build work item', CLEANING_ITEM_CODE, [240, 200]);
  const transport = b.transportSwitch('Cleaning transport', CLEANING_TRANSPORTS, [480, 200]);
  const skip = b.code('Skip (transport disabled)', CLEANING_SKIP_CODE, [760, 80]);
  const webhook = b.jsonWebhook('POST to cleaning webhook', 'BOLAGIO_CLEANING_WEBHOOK_URL', 'workItem', [760, 320]);
  const result = b.code('Return result', CLEANING_RESULT_CODE, [1000, 320]);

  b.connect(trigger, build);
  b.connect(build, transport);
  b.connect(transport, skip, 0);
  b.connect(transport, webhook, 1);
  b.wireTransportFallback(transport, CLEANING_TRANSPORTS, skip);
  b.connect(webhook, result);

  return finish(NAMES.cleaning, IDS.cleaning, b.build());
}

// ─────────────────────────────────────────────────────────────────────────────
// (D) Operational Alert
// ─────────────────────────────────────────────────────────────────────────────

const ALERT_TRANSPORTS = ['disabled', 'webhook', 'email'];

const EVENT_ALERTS = {
  'booking.paid_unfinalized': { level: 'CRITICAL', title: 'Paid booking not finalised at the channel manager' },
  'booking.manual_review_required': { level: 'CRITICAL', title: 'Booking needs a human decision' },
  'booking.release_failed': { level: 'HIGH', title: 'Hold could not be verifiably released' },
  'booking.cancellation_requested': { level: 'HIGH', title: 'Guest requested a cancellation' },
  'payment.refunded': { level: 'HIGH', title: 'Refund recorded' },
  'payment.failed': { level: 'MEDIUM', title: 'Payment capture denied by the provider' },
  'invoice.required': { level: 'MEDIUM', title: 'Invoice required for a confirmed booking' },
};

const SHAPE_ALERT_CODE =
  transportResolver('BOLAGIO_ALERT_TRANSPORT', ALERT_TRANSPORTS) +
  ALERT_FORMATTER +
  String.raw`
// Accepts either a pre-shaped alert ({ alert: {level, code, title, detail, reference?, environment?} })
// from the Health Poll, or an outbox event from the pump. Guest data is never read.
const EVENT_ALERTS = ` + JSON.stringify(EVENT_ALERTS, null, 2) + String.raw`;
const input = $input.first().json;
let alert;
if (input.alert && typeof input.alert === 'object') {
  alert = input.alert;
} else {
  const type = String(input.type || 'unknown');
  const payload = input.payload && typeof input.payload === 'object' ? input.payload : {};
  const known = EVENT_ALERTS[type] || { level: 'HIGH', title: 'Operational event ' + type };
  const details = ['Outbox event ' + type, 'attempt ' + String(input.attempt || 1)];
  if (payload.code) details.push('code ' + String(payload.code));
  if (payload.reason) details.push('reason ' + String(payload.reason).slice(0, 120));
  if (payload.amountCents !== undefined && payload.currency) details.push('amount ' + String(payload.amountCents) + ' ' + String(payload.currency) + ' (cents)');
  if (payload.partial === true) details.push('partial refund');
  alert = {
    level: known.level,
    code: payload.code ? String(payload.code) : type,
    title: known.title,
    detail: details.join(' · '),
    reference: input.reference || payload.reference || null,
  };
}
const formatted = formatAlert(alert);
return [{ json: {
  eventId: input.eventId || null,
  transport: resolveTransport(),
  alert: formatted,
  subject: '[BoLaGio ' + formatted.environment + '] ' + formatted.level + ' ' + formatted.code,
  text: formatted.text,
} }];
`;

const ALERT_SKIP_CODE = String.raw`// Transport disabled: the alert is not delivered anywhere. The event is acknowledged;
// the condition itself stays visible on /admin/system and /api/internal/health.
const item = $input.first().json;
return [{ json: { eventId: item.eventId, ok: true, outcome: 'skipped', transport: 'disabled', code: item.alert.code } }];
`;

const ALERT_RESULT_CODE =
  REDACT +
  String.raw`
// Interpret the delivery node's output (webhook or e-mail). Errors became items.
const shaped = $('Shape alert').first().json;
const response = $input.first().json || {};
if (response.error !== undefined && response.error !== null) {
  return [{ json: { eventId: shaped.eventId, ok: false, outcome: 'delivery_failed', code: shaped.alert.code, error: 'alert transport ' + shaped.transport + ': ' + redact(response.error) } }];
}
return [{ json: { eventId: shaped.eventId, ok: true, outcome: 'delivered', transport: shaped.transport, code: shaped.alert.code } }];
`;

function buildAlert() {
  const b = makeBuilder(NAMES.alert);
  const trigger = b.subWorkflowTrigger('When called', [0, 300]);
  const shape = b.code('Shape alert', SHAPE_ALERT_CODE, [240, 300]);
  const transport = b.transportSwitch('Alert transport', ALERT_TRANSPORTS, [480, 300]);
  const skip = b.code('Skip (transport disabled)', ALERT_SKIP_CODE, [760, 100]);
  const webhook = b.jsonWebhook('POST to alert webhook', 'BOLAGIO_ALERT_WEBHOOK_URL', 'alert', [760, 300]);
  const mail = b.email(
    'Send alert e-mail',
    { toEmail: '={{ $env.BOLAGIO_ALERT_EMAIL_TO }}', subject: '={{ $json.subject }}', emailFormat: 'text', text: '={{ $json.text }}' },
    [760, 500]
  );
  const result = b.code('Return result', ALERT_RESULT_CODE, [1000, 400]);

  b.connect(trigger, shape);
  b.connect(shape, transport);
  b.connect(transport, skip, 0);
  b.connect(transport, webhook, 1);
  b.connect(transport, mail, 2);
  b.wireTransportFallback(transport, ALERT_TRANSPORTS, skip);
  b.connect(webhook, result);
  b.connect(mail, result);

  return finish(NAMES.alert, IDS.alert, b.build());
}

// ─────────────────────────────────────────────────────────────────────────────
// (E) Health Poll
// ─────────────────────────────────────────────────────────────────────────────

const HEALTH_CODE =
  SIGNED_REQUEST +
  REDACT +
  String.raw`
// Poll the operational verdict and alert only on CHANGE. State lives in the
// workflow's static data (persisted for production executions, not manual runs):
//   activeCodes        sorted "LEVEL:code" entries for CRITICAL/HIGH alerts last seen
//   alerting           whether an alert for active codes is currently outstanding
//   failures           consecutive polls that produced no verdict (503 / unreachable)
//   unreachableAlerted whether the "no verdict" alert has been sent
const state = $getWorkflowStaticData('global');
const health = state.bolagioHealth || { activeCodes: [], alerting: false, failures: 0, unreachableAlerted: false };
const FAILURES_BEFORE_ALERT = 2;
const output = [];

function emit(level, code, title, detail, environment, reference) {
  output.push({ json: { alert: { level: level, code: code, title: title, detail: detail, environment: environment, reference: reference || null } } });
}

let result = null;
let transportError = null;
try {
  result = await bolagioRequest('GET', '/api/internal/health', '');
} catch (err) {
  transportError = redact(err);
}

const verdict = result && result.status === 200 && result.data && Array.isArray(result.data.alerts) ? result.data : null;

if (!verdict) {
  health.failures += 1;
  const why = transportError
    ? 'unreachable: ' + transportError
    : (result && result.status === 401 ? 'HTTP 401: signature refused' : 'HTTP ' + String(result ? result.status : 'none') + ': no verdict');
  if (health.failures >= FAILURES_BEFORE_ALERT && !health.unreachableAlerted) {
    health.unreachableAlerted = true;
    emit('CRITICAL', 'HEALTH_NO_VERDICT', 'Health endpoint produced no verdict', why + ' (' + String(health.failures) + ' consecutive polls)', $env.BOLAGIO_ENVIRONMENT || 'unknown');
  }
  state.bolagioHealth = health;
  return output;
}

const environment = String(verdict.environment || $env.BOLAGIO_ENVIRONMENT || 'unknown');
const counts = verdict.counts || {};
const countText = 'counts CRITICAL=' + String(counts.CRITICAL || 0) + ' HIGH=' + String(counts.HIGH || 0) + ' MEDIUM=' + String(counts.MEDIUM || 0);

if (health.failures > 0 || health.unreachableAlerted) {
  if (health.unreachableAlerted) emit('MEDIUM', 'HEALTH_VERDICT_RESTORED', 'Health endpoint answering again', countText, environment);
  health.failures = 0;
  health.unreachableAlerted = false;
}

const active = verdict.alerts.filter(function (a) { return a && (a.level === 'CRITICAL' || a.level === 'HIGH'); });
const codes = Array.from(new Set(active.map(function (a) { return String(a.level) + ':' + String(a.code); }))).sort();
const previous = Array.isArray(health.activeCodes) ? health.activeCodes : [];
const appeared = codes.filter(function (c) { return !previous.includes(c); });

if (appeared.length > 0) {
  const level = appeared.some(function (c) { return c.startsWith('CRITICAL:'); }) ? 'CRITICAL' : 'HIGH';
  const lines = appeared.map(function (c) {
    const parts = c.split(':');
    const a = active.find(function (x) { return String(x.level) === parts[0] && String(x.code) === parts.slice(1).join(':'); }) || {};
    const refs = Array.isArray(a.references) ? a.references.slice(0, 5).join(', ') : '';
    return c + (a.count ? ' ×' + String(a.count) : '') + (a.title ? ' — ' + String(a.title) : '') + (refs ? ' [' + refs + ']' : '');
  });
  emit(level, 'HEALTH_ALERTS', 'New ' + level + ' condition on ' + environment, lines.join('\n') + '\n' + countText, environment);
  health.alerting = true;
} else if (codes.length === 0 && health.alerting) {
  emit('MEDIUM', 'HEALTH_ALL_CLEAR', 'All CRITICAL/HIGH conditions cleared on ' + environment, countText, environment);
  health.alerting = false;
}

health.activeCodes = codes;
state.bolagioHealth = health;
return output;
`;

function buildHealth() {
  const b = makeBuilder(NAMES.health);
  const trigger = b.schedule('Every 5 minutes', { field: 'minutes', minutesInterval: 5 }, [0, 200]);
  const poll = b.code('Poll health and diff state', HEALTH_CODE, [240, 200]);
  const alert = b.executeWorkflow('Operational Alert', IDS.alert, [480, 200]);
  b.connect(trigger, poll);
  b.connect(poll, alert);
  return finish(NAMES.health, IDS.health, b.build());
}

// ─────────────────────────────────────────────────────────────────────────────
// (F) Error Handler — self-contained transport, never calls another workflow,
//     never points at itself: an error here cannot start a loop.
// ─────────────────────────────────────────────────────────────────────────────

const SHAPE_ERROR_CODE =
  transportResolver('BOLAGIO_ALERT_TRANSPORT', ALERT_TRANSPORTS) +
  ALERT_FORMATTER +
  REDACT +
  String.raw`
// The Error Trigger item: { execution: {id, url, error, lastNodeExecuted, mode}, workflow: {id, name} }.
const ERROR_HANDLER_ID = '` + IDS.error + String.raw`';
const input = $input.first().json || {};
const workflow = input.workflow || {};
const execution = input.execution || {};
// Guard against a loop even if a future edit wires this workflow to itself.
if (String(workflow.id || '') === ERROR_HANDLER_ID) return [];
// Only BoLaGio workflows are reported here; a Cogniiq workflow pointing at this
// handler by mistake is ignored rather than alerted on the BoLaGio channel.
if (!String(workflow.name || '').startsWith('BoLaGio ·')) return [];
const message = execution.error && execution.error.message ? execution.error.message : (execution.error ? execution.error : 'unknown error');
const details = [
  'Workflow ' + String(workflow.name || workflow.id || 'unknown'),
  'node ' + String(execution.lastNodeExecuted || 'unknown'),
  'execution ' + String(execution.id || 'unknown'),
  redact(message),
];
if (execution.url) details.push(String(execution.url));
const formatted = formatAlert({
  level: 'HIGH',
  code: 'N8N_WORKFLOW_ERROR',
  title: 'A BoLaGio workflow execution failed',
  detail: details.join('\n'),
  reference: null,
});
return [{ json: {
  transport: resolveTransport(),
  alert: formatted,
  subject: '[BoLaGio ' + formatted.environment + '] ' + formatted.level + ' ' + formatted.code,
  text: formatted.text,
} }];
`;

function buildErrorHandler() {
  const b = makeBuilder(NAMES.error);
  const trigger = b.add('On workflow error', 'n8n-nodes-base.errorTrigger', 1, {}, [0, 300]);
  const shape = b.code('Shape error alert', SHAPE_ERROR_CODE, [240, 300]);
  const transport = b.transportSwitch('Alert transport', ALERT_TRANSPORTS, [480, 300]);
  const skip = b.noOp('Skip (transport disabled)', [760, 100]);
  const webhook = b.jsonWebhook('POST to alert webhook', 'BOLAGIO_ALERT_WEBHOOK_URL', 'alert', [760, 300]);
  const mail = b.email(
    'Send alert e-mail',
    { toEmail: '={{ $env.BOLAGIO_ALERT_EMAIL_TO }}', subject: '={{ $json.subject }}', emailFormat: 'text', text: '={{ $json.text }}' },
    [760, 500]
  );

  b.connect(trigger, shape);
  b.connect(shape, transport);
  b.connect(transport, skip, 0);
  b.connect(transport, webhook, 1);
  b.connect(transport, mail, 2);
  b.wireTransportFallback(transport, ALERT_TRANSPORTS, skip);

  return finish(NAMES.error, IDS.error, b.build(), { errorWorkflow: null });
}

// ─────────────────────────────────────────────────────────────────────────────
// Output
// ─────────────────────────────────────────────────────────────────────────────

export const WORKFLOWS = {
  [FILES.pump]: buildPump,
  [FILES.guest]: buildGuestMessage,
  [FILES.cleaning]: buildCleaning,
  [FILES.alert]: buildAlert,
  [FILES.health]: buildHealth,
  [FILES.error]: buildErrorHandler,
};

export function render(build) {
  return JSON.stringify(build(), null, 2) + '\n';
}

function main(argv) {
  const here = dirname(fileURLToPath(import.meta.url));
  const outIndex = argv.indexOf('--out');
  const outDir = resolve(outIndex >= 0 && argv[outIndex + 1] ? argv[outIndex + 1] : join(here, 'workflows'));
  mkdirSync(outDir, { recursive: true });
  for (const [file, build] of Object.entries(WORKFLOWS)) {
    writeFileSync(join(outDir, file), render(build), 'utf8');
    process.stdout.write(file + '\n');
  }
}

const invokedDirectly = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) main(process.argv.slice(2));
