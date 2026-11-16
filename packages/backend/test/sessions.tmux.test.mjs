import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createSessions } from '../src/sessions/index.mjs';
import { createExec } from '../src/runner/index.mjs';

const hasTmux = spawnSync('tmux', ['-V']).status === 0;
const skip = hasTmux ? false : 'tmux not installed: skipping real-tmux session test';
const agentScript = fileURLToPath(new URL('./fixtures/sessions/fake-agent.mjs', import.meta.url));

// event latch with a 5 s bound; no polling
function latch(label) {
  let done; const p = new Promise((res, rej) => { const t = setTimeout(() => rej(new Error(`timed out waiting for ${label}`)), 5000); done = () => { clearTimeout(t); res(); }; });
  return { p, done };
}

test('real tmux: one session, stream + screen + chat + attachable', { skip }, async () => {
  const socket = `sfx-test-${process.pid}`;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sfx-int-'));
  const transcript = path.join(dir, 'transcript.jsonl');
  fs.writeFileSync(transcript, '');
  const agent = {
    bin: process.execPath, startArgs: () => [agentScript, transcript], resumeArgs: () => [agentScript, transcript],
    locateTranscript: () => transcript, listHistory: () => [],
    parseLine: (o) => [{ id: `${o.k}:${o.t}`, role: o.k === 'u' ? 'user' : 'assistant', text: o.t, ts: 1 }],
  };
  const exec = createExec();
  const s = createSessions({ exec, clock: { now: Date.now }, socketName: socket, home: dir, agents: { fake: agent } });
  let unStream; let unChat;
  try {
    const r = await s.start({ agent: 'fake', cwd: dir });
    assert.equal(r.attachCommand, `tmux -L ${socket} attach -t sfx-${r.id}`);
    assert.ok((await s.list()).some((x) => x.id === r.id));

    let bytes = ''; const gotBytes = latch('stream bytes'); const gotChat = latch('chat message'); const chatTexts = [];
    unStream = await s.stream(r.id, (b) => { bytes += b.toString(); if (bytes.includes('ECHO:hello')) gotBytes.done(); });
    unChat = s.chat(r.id, (m) => { chatTexts.push(...m.map((x) => x.text)); if (chatTexts.includes('ECHO:hello')) gotChat.done(); });

    await s.send(r.id, 'hello');
    await gotBytes.p; await gotChat.p;
    assert.ok(bytes.includes('ECHO:hello'));
    assert.ok(chatTexts.includes('ECHO:hello') && chatTexts.includes('hello'));
    assert.ok((await s.screen(r.id)).text.includes('ECHO:hello'));
    assert.ok((await s.screen(r.id)).ansi.includes('ECHO:hello'));
    assert.deepEqual(s.messages(r.id).map((m) => m.role), ['user', 'assistant']);

    const gotRaw = latch('raw bytes echo'); let rawBytes = '';
    const unRaw = await s.stream(r.id, (b) => { rawBytes += b.toString(); if (rawBytes.includes('ECHO:raw')) gotRaw.done(); });
    await s.sendBytes(r.id, new Uint8Array(Buffer.from('raw\r')));
    await gotRaw.p; unRaw();

    const sock = (...a) => spawnSync('tmux', ['-L', socket, ...a], { encoding: 'utf8' });
    assert.equal(sock('has-session', '-t', `sfx-${r.id}`).status, 0);
    // real attach proof: a pty client attached through the advertised command shows up in list-clients
    const drew = latch('attach client output');
    const client = spawn('sh', ['-c', 'sleep 10 | script -q /dev/null tmux -L "$0" -f /dev/null attach -t "$1"', socket, `sfx-${r.id}`], { stdio: ['ignore', 'pipe', 'ignore'] }); // script needs a non-socket, non-EOF stdin; sleep bounds it
    try {
      let drawn = ''; client.stdout.on('data', (b) => { drawn += b; if (drawn.includes('ECHO:hello')) drew.done(); }); // pane content drawn = client is attached
      await drew.p;
      const clients = sock('list-clients', '-t', `sfx-${r.id}`, '-F', '#{client_session}').stdout.trim();
      assert.ok(clients.length > 0 && clients.split('\n').includes(`sfx-${r.id}`), `no attached client: ${JSON.stringify(clients)}`);
      sock('detach-client', '-s', `sfx-${r.id}`);
    } finally { client.kill('SIGKILL'); }

    await s.resize(r.id, 80, 24);
    unStream(); unChat(); unStream = unChat = null;
    await s.stop(r.id);
    assert.ok(!(await s.list()).some((x) => x.id === r.id));
  } finally {
    unStream?.(); unChat?.();
    spawnSync('tmux', ['-L', socket, 'kill-server']); // only this test's socket
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('real tmux: send delivers text byte-exact (trailing ; and non-ASCII)', { skip }, async () => {
  const socket = `sfx-test-send-${process.pid}`;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sfx-int-'));
  const transcript = path.join(dir, 'transcript.jsonl');
  fs.writeFileSync(transcript, '');
  const agent = {
    bin: process.execPath, startArgs: () => [agentScript, transcript], resumeArgs: () => [agentScript, transcript],
    locateTranscript: () => transcript, listHistory: () => [],
    parseLine: (o) => [{ id: `${o.k}:${o.t}`, role: o.k === 'u' ? 'user' : 'assistant', text: o.t, ts: 1 }],
  };
  const s = createSessions({ exec: createExec(), clock: { now: Date.now }, socketName: socket, home: dir, agents: { fake: agent } });
  let unChat;
  try {
    const r = await s.start({ agent: 'fake', cwd: dir });
    const seen = new Set(); let waiting = null;
    unChat = s.chat(r.id, (m) => { for (const x of m) seen.add(x.text); if (waiting && seen.has(waiting.t)) waiting.done(); });
    for (const text of ['x;', ';', 'caf\u00e9 \u2713 \u65e5\u672c;', 'a\\;', 'p;;']) {
      const l = latch(`echo of ${JSON.stringify(text)}`); waiting = { t: `ECHO:${text}`, done: l.done };
      if (seen.has(waiting.t)) l.done();
      await s.send(r.id, text); await l.p;
      assert.ok(seen.has(`ECHO:${text}`));
    }
    await s.stop(r.id);
  } finally {
    unChat?.();
    spawnSync('tmux', ['-L', socket, 'kill-server']);
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
