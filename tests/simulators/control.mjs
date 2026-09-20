/**
 * A tiny client for the simulators' control APIs, shared by the integration
 * tests and the Playwright suite. Plain fetch; no dependencies.
 */
export function simControl(baseUrl) {
  const call = async (path, body) => {
    const response = await fetch(`${baseUrl}${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!response.ok) throw new Error(`${path} → ${response.status}: ${await response.text()}`);
    return response.json();
  };
  return {
    reset: () => call('/__sim/reset', {}),
    config: (config) => call('/__sim/config', config),
    mode: (op, mode) => call('/__sim/mode', { op, mode }),
    state: () => call('/__sim/state'),
    calls: () => call('/__sim/calls'),
    // PayPal
    approve: (orderId, webhook = true) => call('/__sim/approve', { orderId, webhook }),
    webhook: (input) => call('/__sim/webhook', input),
    // Beds24
    block: (roomId, from, to) => call('/__sim/block', { roomId, from, to }),
    unblock: (roomId, from, to) => call('/__sim/unblock', { roomId, from, to }),
  };
}
