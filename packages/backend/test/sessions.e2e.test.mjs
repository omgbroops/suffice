// End to end: real tmux + real sessions/sessionstate/termbridge composed through the app backend and IPC. Only the agent binary is fake.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createBackend } from '../src/app/backend.mjs';
import { createIpcBridge } from '../src/app/ipc.mjs';

const hasTmux = spawnSync('tmux', ['-V']).status === 0;
const skip = hasTmux ? false : 'tmux is not installed: skipping sessions e2e';
const agentScript = fileURLToPath(new URL('./fixtures/sessions/fake-agent.mjs', import.meta.url));
const until = (label, fn, ms = 8000) => new Promise((res, rej) => {
  const t0 = Date.now();
  const step = async () => {
    let v; try { v = await fn(); } catch { /* retry */ }
    if (v) return res(v);
    if (Date.now() - t0 > ms) return rej(new Error(`timed out: ${label}`));
    setTimeout(step, 40);
  };
  step();
});

test('sessions e2e: start, terminal ws, chat, state, re-adopt, stop', { skip }, async () => {
  const root = mkdtempSync(path.join(tmpdir(), 'sfx-e2e-'));
  const socketName = `sfx-e2e-${process.pid}`;
  const transcript = path.join(root, 'transcript.jsonl');
  writeFileSync(transcript, '');
  const agent = {
    bin: process.execPath, startArgs: () => [agentScript, transcript], resumeArgs: () => [agentScript, transcript],
    locateTranscript: () => transcript, listHistory: () => [],
    parseLine: (o) => [{ id: `${o.k}:${o.t}`, role: o.k === 'u' ? 'user' : 'assistant', text: o.t, ts: 1 }],
  };
  const mk = () => {
    const b = createBackend({ dataDir: path.join(root, 'data'), home: root, socketName, sessions: true, termbridge: true,
      sessionAgents: { fake: agent }, idleMs: 150, settleMs: 50 });
    return { b, ipc: createIpcBridge(b) };
  };
  const apps = [], sockets = [];
  try {
    let { b, ipc } = mk(); apps.push(b);
    const caps = await ipc.handle({ type: 'slots.read', id: 'app:capabilities' });
    assert.equal(caps.result.value.sessions.ok, true, JSON.stringify(caps));
    assert.equal(caps.result.value.termbridge.ok, true);
    await ipc.handle({ type: 'slots.subscribe', selector: '*' });

    const st = await ipc.handle({ type: 'sessions.start', agent: 'fake', cwd: root });
    assert.equal(st.ok, true, JSON.stringify(st));
    const id = st.result.id;
    assert.ok(id);
    await until('READY', async () => (await b.sessions.screen(id)).text.includes('READY>'));

    const term = await ipc.handle({ type: 'sessions.terminal' });
    assert.equal(term.ok, true, JSON.stringify(term));
    const { url, token } = term.result;
    const bad = new WebSocket(`${url}/session/${id}?token=${'x'.repeat(40)}`);
    sockets.push(bad);
    await new Promise((r) => { bad.onerror = r; bad.onclose = r; bad.onopen = () => r('open'); });
    assert.notEqual(bad.readyState, WebSocket.OPEN, 'wrong token must be refused');

    const ws = new WebSocket(`${url}/session/${id}?token=${token}`); sockets.push(ws);
    ws.binaryType = 'arraybuffer';
    let got = '';
    ws.onmessage = (e) => { if (typeof e.data !== 'string') got += Buffer.from(e.data).toString(); };
    await new Promise((r, j) => { ws.onopen = r; ws.onerror = () => j(new Error('ws error')); });
    await until('snapshot', () => got.includes('READY>'));
    ws.send(Buffer.from('hello;\r'));
    await until('echo over ws', () => got.includes('ECHO:hello;'));
    await until('echo in screen', async () => (await b.sessions.screen(id)).text.includes('ECHO:hello;'));

    const read = (sid) => ipc.handle({ type: 'slots.read', id: sid }).then((r) => r.result?.value);
    await until('chat slot', async () => JSON.stringify(await read(`session:${id}:chat`)).includes('ECHO:hello;'));
    await until('state waiting_input', async () => (await read(`session:${id}:state`))?.state === 'waiting_input');

    // second send: state must pass through working
    const seen = new Set();
    const off = b.reader().subscribe(`session:${id}:state`, (_i, v) => seen.add(v?.state));
    assert.equal((await ipc.handle({ type: 'sessions.send', id, text: 'again' })).ok, true);
    await until('echo again', () => got.includes('ECHO:again'));
    await until('back to waiting', async () => seen.has('working') && (await read(`session:${id}:state`))?.state === 'waiting_input');
    off();
    assert.ok(seen.has('working'));

    // restart: dispose leaves tmux running, a fresh app re-adopts
    ws.close();
    await b.dispose(); apps.pop();
    assert.equal(spawnSync('tmux', ['-L', socketName, 'has-session', '-t', `sfx-${id}`]).status, 0, 'tmux survives dispose');
    ({ b, ipc } = mk()); apps.push(b);
    const list = await ipc.handle({ type: 'sessions.list' });
    assert.ok(list.result.some((s) => s.id === id), JSON.stringify(list));
    assert.equal((await ipc.handle({ type: 'sessions.send', id, text: 'after' })).ok, true);
    await until('echo after restart', async () => (await b.sessions.screen(id)).text.includes('ECHO:after'));
    assert.equal((await ipc.handle({ type: 'sessions.attachCommand', id })).ok, true);

    assert.equal((await ipc.handle({ type: 'sessions.stop', id })).ok, true);
    assert.ok(!(await ipc.handle({ type: 'sessions.list' })).result.some((s) => s.id === id));
  } finally {
    for (const s of sockets) try { s.close(); } catch { /* closed */ }
    for (const b of apps) try { await b.dispose(); } catch { /* ignore */ }
    spawnSync('tmux', ['-L', socketName, 'kill-server']);
    rmSync(root, { recursive: true, force: true });
  }
});

test('sessions e2e: an agent that exits reaches state exited with no list() caller', { skip }, async () => {
  const root = mkdtempSync(path.join(tmpdir(), 'sfx-e2e-x-'));
  const socketName = `sfx-e2e-x-${process.pid}`;
  const transcript = path.join(root, 'transcript.jsonl');
  writeFileSync(transcript, '');
  const agent = {
    bin: process.execPath, startArgs: () => [agentScript, transcript], resumeArgs: () => [agentScript, transcript],
    locateTranscript: () => transcript, listHistory: () => [],
    parseLine: (o) => [{ id: `${o.k}:${o.t}`, role: o.k === 'u' ? 'user' : 'assistant', text: o.t, ts: 1 }],
  };
  const b = createBackend({ dataDir: path.join(root, 'data'), home: root, socketName, sessions: true, sessionAgents: { fake: agent }, idleMs: 150, settleMs: 50 });
  try {
    const { id } = await b.sessions.start({ agent: 'fake', cwd: root });
    await until('READY', async () => (await b.sessions.screen(id)).text.includes('READY>'));
    spawnSync('tmux', ['-L', socketName, 'kill-session', '-t', `sfx-${id}`]); // the agent process ends; nobody calls list()
    await until('exited', () => b.slots.read(`session:${id}:state`)?.value?.state === 'exited', 6000);
  } finally {
    await b.dispose();
    spawnSync('tmux', ['-L', socketName, 'kill-server']);
    rmSync(root, { recursive: true, force: true });
  }
});
