// Double-tap Option detector (pure state machine) plus the glue that feeds it from the Swift event-tap helper.
// Fires when two Option taps happen with no other key between them, each press under TAP_MS, the gap under GAP_MS.
const TAP_MS = 250, GAP_MS = 400;

function createDoubleTap({ onFire, tapMs = TAP_MS, gapMs = GAP_MS }) {
  let downAt = null, firstUp = null;
  return {
    // key: 'option' or anything else; state: 'down' | 'up'; t: milliseconds from any monotonic clock.
    feed(key, state, t) {
      if (key !== 'option') { if (state === 'down') { downAt = null; firstUp = null; } return; }
      if (state === 'down') {
        if (downAt !== null) return; // key repeat
        if (firstUp !== null && t - firstUp >= gapMs) firstUp = null;
        downAt = t; return;
      }
      if (downAt === null) return;
      const held = t - downAt; downAt = null;
      if (held >= tapMs) { firstUp = null; return; }
      if (firstUp === null) { firstUp = t; return; }
      firstUp = null; onFire();
    },
  };
}

// Spawns the helper and routes its JSON lines. Any failure (no binary, no Accessibility permission, exit) calls onFallback once so the caller can register Option+Space instead.
function startKeySource({ spawn, command, args = [], onKey, onFallback }) {
  let child = null, buffer = '', fell = false, stopped = false;
  const fall = (why) => { if (fell || stopped) return; fell = true; onFallback(why); };
  try { child = spawn(command, args, { stdio: ['ignore', 'pipe', 'ignore'] }); } catch (e) { fall('spawn'); return { stop() {} }; }
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', (chunk) => {
    buffer += chunk; const lines = buffer.split('\n'); buffer = lines.pop();
    for (const line of lines) {
      let m; try { m = JSON.parse(line); } catch { continue; }
      if (m.status === 'no-permission') fall('permission');
      else if (typeof m.key === 'string' && (m.state === 'down' || m.state === 'up') && Number.isFinite(m.t)) onKey(m.key, m.state, m.t);
    }
  });
  child.on('error', () => fall('spawn'));
  child.on('exit', () => fall('exit'));
  return { stop() { stopped = true; try { child.kill(); } catch {} } };
}

module.exports = { createDoubleTap, startKeySource, TAP_MS, GAP_MS };

// Compiles the Swift helper once (swiftc ships with the Xcode command line tools). Resolves the binary path, or null when it cannot be built.
function ensureHelper({ fs, execFile, source, out, platform = process.platform }) {
  return new Promise((resolve) => {
    if (platform !== 'darwin') return resolve(null);
    try { if (fs.statSync(out).mtimeMs >= fs.statSync(source).mtimeMs) return resolve(out); } catch {}
    fs.mkdirSync(require('node:path').dirname(out), { recursive: true });
    execFile('/usr/bin/swiftc', ['-O', source, '-o', out], { timeout: 120000 }, (error) => resolve(error ? null : out));
  });
}
module.exports.ensureHelper = ensureHelper;
