// Loopback WebSocket bridge: xterm in the desktop app <-> a session's raw terminal bytes. RFC 6455 server side, no deps.
import http from 'node:http';
import crypto from 'node:crypto';

const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
const LOOPBACK = new Set(['127.0.0.1', 'localhost', '::1']);
const DEFAULT_ORIGINS = [/^null$/, /^file:\/\//, /^http:\/\/localhost(:\d+)?$/, /^http:\/\/127\.0\.0\.1(:\d+)?$/];

export const frame = (op, payload = Buffer.alloc(0)) => {
  const n = payload.length;
  const head = n < 126 ? Buffer.from([0x80 | op, n])
    : n < 65536 ? Buffer.from([0x80 | op, 126, n >> 8, n & 255])
    : (() => { const h = Buffer.alloc(10); h[0] = 0x80 | op; h[1] = 127; h.writeBigUInt64BE(BigInt(n), 2); return h; })();
  return Buffer.concat([head, payload]);
};
const closeFrame = (code, reason = '') => { const b = Buffer.alloc(2); b.writeUInt16BE(code); return frame(8, Buffer.concat([b, Buffer.from(reason)])); };
const safeEq = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); };

export function createTermBridge({ sessions, clock, host = '127.0.0.1', port = 0, token, allowNonLoopback = false,
  origins = [], maxBuffered = 8 * 1024 * 1024, maxPayload = 1024 * 1024, pingMs = 30000 } = {}) {
  if (!sessions) throw new TypeError('termbridge: sessions required');
  if (!allowNonLoopback && !LOOPBACK.has(host)) throw new Error(`termbridge: refusing non-loopback host ${host}`);
  const allowed = [...DEFAULT_ORIGINS, ...origins.map((o) => (o instanceof RegExp ? o : new RegExp(`^${o.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')}$`)))];
  const conns = new Set();
  let server = null, timer = null, tok = token;

  const reject = (socket, code, text) => { socket.end(`HTTP/1.1 ${code} ${text}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`); };

  async function accept(req, socket, url, id, proto) {
    const key = req.headers['sec-websocket-key'];
    socket.write(['HTTP/1.1 101 Switching Protocols', 'Upgrade: websocket', 'Connection: Upgrade',
      `Sec-WebSocket-Accept: ${crypto.createHash('sha1').update(key + GUID).digest('base64')}`,
      ...(proto ? [`Sec-WebSocket-Protocol: ${proto}`] : []), '', ''].join('\r\n'));
    socket.setNoDelay(true);
    const c = { socket, missed: 0, unsub: null, dead: false, buf: Buffer.alloc(0), frag: null };
    conns.add(c);
    const fail = (code, reason) => {
      if (c.dead) return;
      c.dead = true;
      try { c.unsub?.(); } catch { /* ignore */ } c.unsub = null;
      try { socket.end(closeFrame(code, reason)); } catch { /* gone */ }
      setTimeout(() => socket.destroy(), 1000).unref();
    };
    const out = (buf) => {
      if (c.dead) return;
      if (socket.writableLength > maxBuffered) return fail(1013, 'backpressure');
      socket.write(buf);
    };
    c.out = out; c.fail = fail;
    socket.on('close', () => { c.dead = true; conns.delete(c); try { c.unsub?.(); } catch { /* ignore */ } c.unsub = null; });
    socket.on('error', () => socket.destroy());
    socket.on('end', () => socket.destroy()); // http sockets are half-open by default; a vanished client must free the session

    const control = (text) => {
      let m; try { m = JSON.parse(text); } catch { return; }
      if (!m || typeof m !== 'object') return;
      if (m.type === 'ping') out(frame(1, Buffer.from('{"type":"pong"}')));
      else if (m.type === 'resize') {
        const ok = (v) => Number.isInteger(v) && v >= 1 && v <= 1000;
        if (ok(m.cols) && ok(m.rows)) Promise.resolve().then(() => sessions.resize(id, m.cols, m.rows)).catch(() => {});
      }
    };
    const message = (op, data) => {
      if (op === 2) Promise.resolve().then(() => sessions.sendBytes(id, new Uint8Array(data))).catch(() => {});
      else control(data.toString('utf8'));
    };
    const parse = () => {
      for (;;) {
        const b = c.buf;
        if (c.dead || b.length < 2) return;
        const fin = !!(b[0] & 0x80), op = b[0] & 15;
        if (b[0] & 0x70) return fail(1002, 'reserved bits');
        if (!(b[1] & 0x80)) return fail(1002, 'unmasked frame');
        let len = b[1] & 127, off = 2;
        if (len === 126) { if (b.length < 4) return; len = b.readUInt16BE(2); off = 4; }
        else if (len === 127) { if (b.length < 10) return; const big = b.readBigUInt64BE(2); if (big > BigInt(maxPayload)) return fail(1009, 'too big'); len = Number(big); off = 10; }
        if (op >= 8 && (!fin || len > 125)) return fail(1002, 'bad control frame');
        if (len > maxPayload || (c.frag && c.frag.len + len > maxPayload)) return fail(1009, 'too big');
        if (b.length < off + 4 + len) return;
        const mask = b.subarray(off, off + 4);
        const data = Buffer.from(b.subarray(off + 4, off + 4 + len));
        for (let i = 0; i < len; i++) data[i] ^= mask[i & 3];
        c.buf = b.subarray(off + 4 + len);
        c.missed = 0;
        if (op === 8) { c.dead = true; try { socket.end(closeFrame(len >= 2 ? data.readUInt16BE(0) : 1000)); } catch { /* gone */ } return; }
        if (op === 9) { out(frame(10, data)); continue; }
        if (op === 10) continue;
        if (op === 1 || op === 2) {
          if (c.frag) return fail(1002, 'expected continuation');
          if (fin) message(op, data); else c.frag = { op, parts: [data], len };
        } else if (op === 0) {
          if (!c.frag) return fail(1002, 'unexpected continuation');
          c.frag.parts.push(data); c.frag.len += len;
          if (fin) { const f = c.frag; c.frag = null; message(f.op, Buffer.concat(f.parts)); }
        } else return fail(1002, 'bad opcode');
      }
    };
    socket.on('data', (d) => { c.buf = c.buf.length ? Buffer.concat([c.buf, d]) : d; parse(); });

    // Subscribe before the snapshot so no output is lost between them; hold live bytes until the snapshot is out.
    const pending = []; let ready = false;
    try {
      c.unsub = await sessions.stream(id, (bytes) => { const f = frame(2, Buffer.from(bytes)); if (ready) out(f); else pending.push(f); });
      const snap = await sessions.screen(id);
      if (c.dead) { c.unsub?.(); c.unsub = null; return; }
      out(frame(2, Buffer.from(snap?.ansi ?? '')));
      ready = true;
      for (const f of pending) out(f);
    } catch { fail(1011, 'session error'); }
  }

  async function onUpgrade(req, socket) {
    socket.on('error', () => socket.destroy());
    const url = new URL(req.url, 'http://x');
    const origin = req.headers.origin;
    const protos = String(req.headers['sec-websocket-protocol'] ?? '').split(',').map((s) => s.trim()).filter(Boolean);
    const proto = protos.find((p) => safeEq(p, tok));
    if (!(safeEq(url.searchParams.get('token') ?? '', tok) || proto)) return reject(socket, 403, 'Forbidden');
    if (origin !== undefined && !allowed.some((r) => r.test(origin))) return reject(socket, 403, 'Forbidden');
    const m = /^\/session\/([^/]+)$/.exec(url.pathname);
    if (!m) return reject(socket, 404, 'Not Found');
    const id = decodeURIComponent(m[1]);
    let known = false;
    try { known = (await sessions.list()).some((s) => (typeof s === 'string' ? s : s?.id) === id); } catch { /* treat as unknown */ }
    if (!known) return reject(socket, 404, 'Not Found');
    if (req.headers.upgrade?.toLowerCase() !== 'websocket' || !req.headers['sec-websocket-key'] || req.headers['sec-websocket-version'] !== '13') return reject(socket, 400, 'Bad Request');
    await accept(req, socket, url, id, proto);
  }

  return {
    async start() {
      if (server) throw new Error('termbridge: already started');
      tok = token ?? crypto.randomBytes(32).toString('hex');
      server = http.createServer((req, res) => { res.writeHead(426).end(); });
      server.on('upgrade', (req, socket) => { onUpgrade(req, socket).catch(() => socket.destroy()); });
      await new Promise((ok, no) => { server.once('error', no); server.listen(port, host, ok); });
      timer = setInterval(() => {
        for (const c of conns) {
          if (c.dead) continue;
          if (c.missed >= 2) { c.dead = true; c.socket.destroy(); continue; }
          c.missed++; c.out(frame(9));
        }
      }, pingMs);
      timer.unref();
      const p = server.address().port;
      return { url: `ws://${host.includes(':') ? `[${host}]` : host}:${p}`, port: p, token: tok };
    },
    async stop() {
      clearInterval(timer); timer = null;
      for (const c of conns) { try { c.socket.end(closeFrame(1001, 'shutdown')); } catch { /* gone */ } c.socket.destroy(); }
      const s = server; server = null;
      if (s) await new Promise((ok) => { s.close(ok); s.closeAllConnections?.(); });
    },
    connections: () => conns.size,
  };
}
export default createTermBridge;
