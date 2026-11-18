// Client for the "Suffice Keys" helper: it writes "trigger <x> <y>" (global screen coords) to a Unix socket on each double-tap of Option.
// Reconnects with backoff while the helper is absent; the socket path is overridable (SUFFICE_KEYS_SOCK) so tests never touch the real helper.
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');

function createKeysClient({ onTrigger, env = process.env, minDelay = 1000, maxDelay = 30000 }) {
  const sockPath = env.SUFFICE_KEYS_SOCK || path.join(os.homedir(), 'Library', 'Application Support', 'Suffice', 'keys.sock');
  let on = false, socket = null, timer = null, delay = minDelay;
  const retry = () => { if (!on || timer) return; timer = setTimeout(() => { timer = null; connect(); }, delay); timer.unref?.(); delay = Math.min(maxDelay, delay * 2); };
  function connect() {
    if (!on || socket) return;
    let buffer = '';
    const s = socket = net.createConnection(sockPath);
    s.setEncoding('utf8');
    s.on('connect', () => { delay = minDelay; });
    s.on('data', (chunk) => {
      buffer += chunk;
      const lines = buffer.split('\n'); buffer = lines.pop();
      for (const line of lines) { const m = /^trigger (-?\d+) (-?\d+)$/.exec(line.trim()); if (m) onTrigger({ x: Number(m[1]), y: Number(m[2]) }); }
    });
    s.on('error', () => {});
    s.on('close', () => { if (socket === s) socket = null; retry(); });
  }
  return {
    sockPath,
    setEnabled(value) {
      on = value === true;
      if (on) { delay = minDelay; connect(); return; }
      clearTimeout(timer); timer = null; const s = socket; socket = null; s?.destroy();
    },
  };
}

module.exports = { createKeysClient };
