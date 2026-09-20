#!/usr/bin/env node
/**
 * The `/rest/v1` front door of the local stack.
 *
 * `supabase-js` addresses PostgREST at `${SUPABASE_URL}/rest/v1/...`, while a
 * bare PostgREST serves at `/`. This forwards the one to the other and does
 * nothing else — no auth, no rewriting of bodies, no caching — so the
 * application's requests reach PostgREST byte-for-byte as they would reach a
 * Supabase project's.
 *
 *   node scripts/stack-proxy.mjs <listen port> <postgrest port>
 */
import http from 'node:http';

const [listenPort, upstreamPort] = process.argv.slice(2).map(Number);
if (!listenPort || !upstreamPort) {
  console.error('usage: stack-proxy.mjs <listen port> <postgrest port>');
  process.exit(2);
}

const server = http.createServer((req, res) => {
  const url = req.url ?? '/';
  const path = url.startsWith('/rest/v1') ? url.slice('/rest/v1'.length) || '/' : url;
  const upstream = http.request(
    { host: '127.0.0.1', port: upstreamPort, method: req.method, path, headers: req.headers },
    (up) => {
      res.writeHead(up.statusCode ?? 502, up.headers);
      up.pipe(res);
    }
  );
  upstream.on('error', () => {
    res.writeHead(502, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ message: 'postgrest unreachable' }));
  });
  req.pipe(upstream);
});

server.listen(listenPort, '127.0.0.1');
