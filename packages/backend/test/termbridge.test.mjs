import test from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import crypto from 'node:crypto';
import { createTermBridge } from '../src/termbridge/index.mjs';

const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
const B = (x) => Buffer.from(x);

function fakeSessions() {
  const s = { ids: ['a'], subs: new Map(), sent: [], resizes: [], unsubs: 0, ansi: 'SNAP' };
  s.list = () => s.ids.map((id) => ({ id }));
  s.screen = () => ({ text: 't', ansi: s.ansi });
  s.stream = (id, cb) => { const set = s.subs.get(id) ?? new Set(); s.subs.set(id, set); set.add(cb); return () => { s.unsubs++; set.delete(cb); }; };
  s.sendBytes = (id, b) => { s.sent.push(Buffer.from(b)); };
  s.resize = (id, c, r) => { s.resizes.push([c, r]); };
  s.emit = (id, bytes) => { for (const cb of s.subs.get(id) ?? []) cb(bytes); };
  return s;
}

const maskedFrame = (op, payload, { fin = true, mask = true, forceLen } = {}) => {
  const n = payload.length;
  const lenBytes = (forceLen === 64 || n >= 65536) ? (() => { const b = Buffer.alloc(9); b[0] = 127; b.writeBigUInt64BE(BigInt(n), 1); return b; })()
    : n < 126 ? Buffer.from([n]) : (() => { const b = Buffer.alloc(3); b[0] = 126; b.writeUInt16BE(n, 1); return b; })();
  if (mask) lenBytes[0] |= 0x80;
  const key = crypto.randomBytes(4);
  const body = mask ? Buffer.from(payload).map((v, i) => v ^ key[i & 3]) : Buffer.from(payload);
  return Buffer.concat([Buffer.from([(fin ? 0x80 : 0) | op]), lenBytes, mask ? key : Buffer.alloc(0), body]);
};

// Minimal client: handshake over node:net, then a frame queue.
function connect(port, path, headers = {}, halfOpen = false) {
  return new Promise((resolve) => {
    const sock = net.connect({ port, host: '127.0.0.1', allowHalfOpen: halfOpen });
    const key = crypto.randomBytes(16).toString('base64');
    let buf = Buffer.alloc(0), head = null, closed = false;
    const frames = [], waiters = [];
    const pump = () => {
      for (;;) {
        if (buf.length < 2) break;
        let len = buf[1] & 127, off = 2;
        if (len === 126) { if (buf.length < 4) break; len = buf.readUInt16BE(2); off = 4; }
        else if (len === 127) { if (buf.length < 10) break; len = Number(buf.readBigUInt64BE(2)); off = 10; }
        if (buf.length < off + len) break;
        frames.push({ op: buf[0] & 15, data: buf.subarray(off, off + len) });
        buf = buf.subarray(off + len);
      }
      while (waiters.length && frames.length) waiters.shift()(frames.shift());
    };
    const client = {
      sock, frames, get closed() { return closed; },
      next: () => new Promise((r) => { frames.length ? r(frames.shift()) : waiters.push(r); }),
      send: (op, p, o) => sock.write(maskedFrame(op, p, o)),
      raw: (b) => sock.write(b),
      ended: () => new Promise((r) => (closed ? r() : sock.once('close', r))),
    };
    sock.on('data', (d) => {
      buf = Buffer.concat([buf, d]);
      if (!head) {
        const i = buf.indexOf('\r\n\r\n'); if (i < 0) return;
        head = buf.subarray(0, i).toString(); buf = buf.subarray(i + 4);
        const status = Number(head.split(' ')[1]);
        resolve({ status, head, key, client });
      }
      pump();
    });
    sock.on('close', () => { closed = true; });
    sock.on('error', () => {});
    sock.write([`GET ${path} HTTP/1.1`, 'Host: 127.0.0.1', 'Upgrade: websocket', 'Connection: Upgrade',
      `Sec-WebSocket-Key: ${key}`, 'Sec-WebSocket-Version: 13', ...Object.entries(headers).map(([k, v]) => `${k}: ${v}`), '', ''].join('\r\n'));
  });
}

async function setup(opts = {}) {
  const sessions = fakeSessions();
  const bridge = createTermBridge({ sessions, clock: { now: () => 0 }, ...opts });
  const info = await bridge.start();
  const open = (path = '/session/a', headers = {}, q = `?token=${info.token}`, half = false) => connect(info.port, path + q, headers, half);
  return { sessions, bridge, info, open };
}
const closeCode = (f) => f.data.readUInt16BE(0);
const tick = (ms = 50) => new Promise((r) => setTimeout(r, ms));

test('handshake accept key, snapshot then ordered stream', async () => {
  const { sessions, bridge, open } = await setup();
  const r = await open();
  assert.equal(r.status, 101);
  const want = crypto.createHash('sha1').update(r.key + GUID).digest('base64');
  assert.match(r.head, new RegExp(`Sec-WebSocket-Accept: ${want.replace(/[+/=]/g, '\\$&')}`, 'i'));
  sessions.emit('a', B('early')); // may race the snapshot; must still follow it
  sessions.emit('a', B('one')); sessions.emit('a', B('two'));
  const got = [];
  for (let i = 0; i < 4; i++) got.push((await r.client.next()).data.toString());
  assert.equal(got[0], 'SNAP');
  assert.deepEqual(got.slice(1), ['early', 'one', 'two']);
  assert.equal(bridge.connections(), 1);
  r.client.sock.destroy(); await bridge.stop();
});

test('token missing/wrong => 403; protocol token accepted', async () => {
  const { bridge, info, open } = await setup();
  assert.equal((await open('/session/a', {}, '')).status, 403);
  assert.equal((await open('/session/a', {}, '?token=' + '0'.repeat(64))).status, 403);
  assert.equal((await open('/session/a', {}, '?token=short')).status, 403);
  const r = await open('/session/a', { 'Sec-WebSocket-Protocol': info.token }, '');
  assert.equal(r.status, 101);
  assert.match(r.head, new RegExp(`Sec-WebSocket-Protocol: ${info.token}`, 'i'));
  r.client.sock.destroy(); await bridge.stop();
});

test('origin allow-list', async () => {
  const { bridge, open } = await setup({ origins: ['https://app.example'] });
  assert.equal((await open('/session/a', { Origin: 'https://evil.example' })).status, 403);
  assert.equal((await open('/session/a', { Origin: 'http://localhost.evil.com' })).status, 403);
  for (const o of ['null', 'file://', 'http://localhost:5173', 'http://127.0.0.1:3000', 'https://app.example']) {
    const r = await open('/session/a', { Origin: o });
    assert.equal(r.status, 101, o); r.client.sock.destroy();
  }
  await bridge.stop();
});

test('unknown session => 404; non-loopback host refused', async () => {
  const { bridge, open } = await setup();
  assert.equal((await open('/session/nope')).status, 404);
  assert.equal((await open('/other')).status, 404);
  await bridge.stop();
  assert.throws(() => createTermBridge({ sessions: fakeSessions(), host: '0.0.0.0' }), /non-loopback/);
  assert.doesNotThrow(() => createTermBridge({ sessions: fakeSessions(), host: '0.0.0.0', allowNonLoopback: true }));
});

test('client bytes reach sendBytes byte-exact (0x00-0xFF), incl. fragmented', async () => {
  const { sessions, bridge, open } = await setup();
  const r = await open(); await r.client.next();
  const all = Buffer.from(Array.from({ length: 256 }, (_, i) => i));
  r.client.send(2, all);
  const a = all.subarray(0, 100), b2 = all.subarray(100);
  r.client.send(2, a, { fin: false }); r.client.send(0, b2);
  await tick();
  assert.equal(sessions.sent.length, 2);
  assert.ok(sessions.sent[0].equals(all)); assert.ok(sessions.sent[1].equals(all));
  r.client.sock.destroy(); await bridge.stop();
});

test('64-bit length and 16-bit length frames', async () => {
  const { sessions, bridge, open } = await setup();
  const r = await open(); await r.client.next();
  const big = crypto.randomBytes(70000);
  r.client.send(2, big); // 64-bit length encoding
  r.client.send(2, big.subarray(0, 300)); // 16-bit
  r.client.send(2, big.subarray(0, 5), { forceLen: 64 }); // 64-bit encoding of a small payload
  await tick(100);
  assert.ok(sessions.sent[0].equals(big));
  assert.ok(sessions.sent[1].equals(big.subarray(0, 300)));
  assert.ok(sessions.sent[2].equals(big.subarray(0, 5)));
  r.client.sock.destroy(); await bridge.stop();
});

test('resize validation, ping, junk ignored', async () => {
  const { sessions, bridge, open } = await setup();
  const r = await open(); await r.client.next();
  for (const m of [{ type: 'resize', cols: 80, rows: 24 }, { type: 'resize', cols: 1000, rows: 1 },
    { type: 'resize', cols: 0, rows: 24 }, { type: 'resize', cols: 1001, rows: 5 }, { type: 'resize', cols: 80.5, rows: 5 },
    { type: 'resize', cols: '80', rows: 5 }, { type: 'resize' }, { type: 'nope' }, [1], null]) r.client.send(1, B(JSON.stringify(m)));
  r.client.send(1, B('not json{'));
  r.client.send(1, B('{"type":"ping"}'));
  const pong = await r.client.next();
  assert.equal(pong.op, 1); assert.equal(JSON.parse(pong.data).type, 'pong');
  assert.deepEqual(sessions.resizes, [[80, 24], [1000, 1]]);
  assert.equal(bridge.connections(), 1); // junk never killed it
  r.client.sock.destroy(); await bridge.stop();
});

test('protocol ping gets pong; oversized => 1009; unmasked => 1002', async () => {
  const { bridge, open } = await setup({ maxPayload: 1024 });
  let r = await open(); await r.client.next();
  r.client.send(9, B('hi'));
  const p = await r.client.next(); assert.equal(p.op, 10); assert.equal(p.data.toString(), 'hi');
  r.client.send(2, Buffer.alloc(2000));
  let f = await r.client.next(); assert.equal(f.op, 8); assert.equal(closeCode(f), 1009);
  await r.client.ended();

  r = await open(); await r.client.next();
  r.client.send(2, B('x'), { forceLen: 64 }); // sanity: still fine
  r.client.raw(maskedFrame(2, B('x'), { mask: false }));
  f = await r.client.next(); assert.equal(f.op, 8); assert.equal(closeCode(f), 1002);

  r = await open(); await r.client.next();
  r.client.send(2, B('a'), { fin: false }); r.client.send(2, B('b')); // new data frame mid-fragment
  f = await r.client.next(); assert.equal(closeCode(f), 1002);
  await bridge.stop();
});

test('backpressure drops a slow client with 1013', async () => {
  const { sessions, bridge, open } = await setup({ maxBuffered: 64 * 1024 });
  const r = await open(); await r.client.next();
  r.client.sock.pause();
  const chunk = Buffer.alloc(1024 * 1024, 7);
  for (let i = 0; i < 40; i++) sessions.emit('a', chunk);
  await tick(100);
  assert.equal(sessions.unsubs >= 1, true);
  r.client.sock.resume();
  let code = null;
  for (let i = 0; i < 200 && code === null; i++) { const f = await r.client.next(); if (f.op === 8) code = closeCode(f); }
  assert.equal(code, 1013);
  await r.client.ended(); await tick();
  assert.equal(bridge.connections(), 0);
  await bridge.stop();
});

test('two clients share a session; unsubscribe on close', async () => {
  const { sessions, bridge, open } = await setup();
  const a = await open(), b = await open();
  await a.client.next(); await b.client.next();
  assert.equal(bridge.connections(), 2);
  sessions.emit('a', B('both'));
  assert.equal((await a.client.next()).data.toString(), 'both');
  assert.equal((await b.client.next()).data.toString(), 'both');
  a.client.send(8, Buffer.from([0x03, 0xe8]));
  const c = await a.client.next(); assert.equal(c.op, 8);
  await a.client.ended(); await tick();
  assert.equal(sessions.unsubs, 1);
  assert.equal(sessions.subs.get('a').size, 1);
  b.client.sock.destroy(); await tick();
  assert.equal(sessions.unsubs, 2);
  assert.equal(bridge.connections(), 0);
  await bridge.stop();
});

test('missed pongs close the connection', async () => {
  const { bridge, open } = await setup({ pingMs: 30 });
  const r = await open(); await r.client.next();
  await r.client.ended(); // never answers pings
  await tick();
  assert.equal(bridge.connections(), 0);
  await bridge.stop();
});

test('stop() closes clients, frees the port, process can exit', async () => {
  const { sessions, bridge, info, open } = await setup();
  const r = await open(); await r.client.next();
  await bridge.stop();
  await r.client.ended();
  assert.equal(sessions.unsubs, 1);
  const code = await new Promise((ok) => { const s = net.connect(info.port, '127.0.0.1'); s.on('error', (e) => ok(e.code)); s.on('connect', () => { s.destroy(); ok('connected'); }); });
  assert.equal(code, 'ECONNREFUSED');
  // child process that starts then stops a bridge must exit by itself
  const { spawnSync } = await import('node:child_process');
  const res = spawnSync(process.execPath, ['--input-type=module', '-e', `
    import { createTermBridge } from ${JSON.stringify(new URL('../src/termbridge/index.mjs', import.meta.url).href)};
    const b = createTermBridge({ sessions: { list: () => [] } }); await b.start(); await b.stop();`], { timeout: 5000 });
  assert.equal(res.status, 0, String(res.stderr));
});

const within = (p, ms, what) => Promise.race([p, new Promise((_, no) => setTimeout(() => no(new Error(`timeout: ${what}`)), ms))]);

test('after a close frame the server destroys the socket and ignores further bytes', async () => {
  const { sessions, bridge, open } = await setup();
  const r = await open('/session/a', {}, undefined, true); await r.client.next();
  r.client.send(8, Buffer.from([0x03, 0xe8]));
  assert.equal((await r.client.next()).op, 8);
  r.client.raw(Buffer.alloc(256 * 1024, 1)); // junk after close must not be parsed or kept
  await tick(1500);
  assert.equal(bridge.connections(), 0, 'server never destroyed the socket');
  assert.equal(sessions.unsubs, 1);
  assert.equal(sessions.sent.length, 0);
  await bridge.stop();
});

test('large frame arriving in many small chunks parses linearly', async () => {
  const { sessions, bridge, open } = await setup();
  const r = await open(); await r.client.next();
  const big = crypto.randomBytes(900 * 1024);
  const f = maskedFrame(2, big);
  const t0 = Date.now();
  for (let i = 0; i < f.length; i += 512) r.client.raw(f.subarray(i, i + 512));
  await tick(300);
  assert.ok(sessions.sent[0]?.equals(big));
  assert.ok(Date.now() - t0 < 4000);
  r.client.sock.destroy(); await bridge.stop();
});

test('endless zero-length continuation frames => 1009', async () => {
  const { bridge, open } = await setup({ maxFragments: 16 });
  const r = await open(); await r.client.next();
  r.client.send(2, B(''), { fin: false });
  for (let i = 0; i < 40; i++) r.client.send(0, B(''), { fin: false });
  const f = await within(r.client.next(), 2000, 'no close');
  assert.equal(f.op, 8); assert.equal(closeCode(f), 1009);
  await bridge.stop();
});

test('supplied token must be a string of 32+ chars', () => {
  for (const t of ['', 'short', 'x'.repeat(31), 5, null]) assert.throws(() => createTermBridge({ sessions: fakeSessions(), token: t }), TypeError, String(t));
  assert.doesNotThrow(() => createTermBridge({ sessions: fakeSessions(), token: 'x'.repeat(32) }));
});

test('client closing while stream() is pending does not leak the subscription', async () => {
  const sessions = fakeSessions();
  let release; const gate = new Promise((r) => { release = r; });
  const inner = sessions.stream;
  sessions.stream = async (id, cb) => { await gate; return inner(id, cb); };
  const bridge = createTermBridge({ sessions }); const info = await bridge.start();
  const r = await connect(info.port, `/session/a?token=${info.token}`);
  r.client.sock.destroy(); await tick();
  release(); await tick();
  assert.equal(sessions.unsubs, 1);
  await bridge.stop();
});

test('closing while screen() is pending unsubscribes exactly once; screen rejection => 1011', async () => {
  let sessions = fakeSessions();
  let release; const gate = new Promise((r) => { release = r; });
  sessions.screen = async () => { await gate; return { ansi: 'x' }; };
  let bridge = createTermBridge({ sessions }); let info = await bridge.start();
  let r = await connect(info.port, `/session/a?token=${info.token}`);
  await tick(); r.client.sock.destroy(); await tick();
  release(); await tick();
  assert.equal(sessions.unsubs, 1);
  await bridge.stop();

  sessions = fakeSessions();
  sessions.screen = async () => { throw new Error('boom'); };
  bridge = createTermBridge({ sessions }); info = await bridge.start();
  r = await connect(info.port, `/session/a?token=${info.token}`);
  const f = await within(r.client.next(), 2000, 'no close'); assert.equal(closeCode(f), 1011);
  await r.client.ended(); await tick();
  assert.equal(sessions.unsubs, 1);
  await bridge.stop();

  sessions = fakeSessions();
  sessions.stream = () => { throw new Error('boom'); };
  bridge = createTermBridge({ sessions }); info = await bridge.start();
  r = await connect(info.port, `/session/a?token=${info.token}`);
  assert.equal(closeCode(await within(r.client.next(), 2000, 'no close')), 1011);
  await bridge.stop();
});

test('ended session closes its sockets with 1000 (ping tick and onExit)', async () => {
  const { sessions, bridge, open } = await setup({ pingMs: 30 });
  const r = await open(); await r.client.next();
  sessions.ids = [];
  const f = await within(r.client.next(), 2000, 'no close');
  assert.equal(f.op, 8); assert.equal(closeCode(f), 1000);
  await bridge.stop();

  const s2 = fakeSessions(); let exit;
  s2.onExit = (id, fn) => { exit = fn; return () => {}; };
  const b2 = createTermBridge({ sessions: s2 }); const i2 = await b2.start();
  const r2 = await connect(i2.port, `/session/a?token=${i2.token}`); await r2.client.next();
  exit();
  assert.equal(closeCode(await within(r2.client.next(), 2000, 'no close')), 1000);
  await b2.stop();
});
