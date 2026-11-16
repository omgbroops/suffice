import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createSessions } from '../src/sessions/index.mjs';
import { builtinAgents } from '../src/sessions/adapters.mjs';
import { createSlots } from '../src/slots/index.mjs';

const clock = { now: () => 1_700_000_000_000 };
function fakeExec(reply = () => ({ code: 0, stdout: '', stderr: '', timedOut: false })) {
  const calls = [];
  const exec = async (cmd, args, opts) => { calls.push([cmd, ...args]); return reply(cmd, args, opts); };
  return { exec, calls };
}
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'sfx-unit-'));
const mkAgent = (tpath) => ({ bin: 'myagent', startArgs: () => ['--x'], resumeArgs: ({ sessionId }) => ['--r', sessionId], locateTranscript: () => tpath, parseLine: (o) => (o.t ? [{ id: o.t, role: 'user', text: o.t, ts: 1 }] : []), listHistory: () => [] });

test('start/list/stop/send/sendBytes/resize argv', async () => {
  const dir = tmp();
  const { exec, calls } = fakeExec();
  const s = createSessions({ exec, clock, home: dir, agents: { a: mkAgent(path.join(dir, 't.jsonl')) } });
  const r = await s.start({ agent: 'a', cwd: '/work', args: ['--y'], cols: 100, rows: 30 });
  assert.match(r.id, /^[a-f0-9]+$/);
  assert.deepEqual(calls[0], ['tmux', '-f', '/dev/null', '-L', 'suffice', 'new-session', '-d', '-s', `sfx-${r.id}`, '-x', '100', '-y', '30', '-c', '/work', '--', 'myagent', '--x', '--y']);
  assert.equal(r.attachCommand, `tmux -L suffice attach -t sfx-${r.id}`);
  await s.send(r.id, '-hi; $(x)');
  await s.send(r.id, 'q', { enter: false });
  await s.sendBytes(r.id, new Uint8Array([0x68, 0x0d, 0x1b]));
  await s.resize(r.id, 90, 20);
  await s.stop(r.id);
  assert.deepEqual(calls.slice(1), [
    ['tmux', '-f', '/dev/null', '-L', 'suffice', 'send-keys', '-t', `sfx-${r.id}`, '-l', '--', '-hi; $(x)'],
    ['tmux', '-f', '/dev/null', '-L', 'suffice', 'send-keys', '-t', `sfx-${r.id}`, 'Enter'],
    ['tmux', '-f', '/dev/null', '-L', 'suffice', 'send-keys', '-t', `sfx-${r.id}`, '-l', '--', 'q'],
    ['tmux', '-f', '/dev/null', '-L', 'suffice', 'send-keys', '-t', `sfx-${r.id}`, '-H', '68', '0d', '1b'],
    ['tmux', '-f', '/dev/null', '-L', 'suffice', 'resize-window', '-t', `sfx-${r.id}`, '-x', '90', '-y', '20'],
    ['tmux', '-f', '/dev/null', '-L', 'suffice', 'kill-session', '-t', `sfx-${r.id}`],
  ]);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('list parses tab format and keeps only sfx- sessions; no server = empty', async () => {
  const out = 'sfx-ab12\t1700\t1\nmine\t1\t0\nsfx-zz\t2\t0\nsfx-cd34\t1800\t0\n';
  const { exec, calls } = fakeExec(() => ({ code: 0, stdout: out, stderr: '' }));
  const s = createSessions({ exec, clock, socketName: 'sock1' });
  const l = await s.list();
  assert.deepEqual(l.map((x) => x.id), ['ab12', 'cd34']);
  assert.equal(l[0].attached, true);
  assert.deepEqual(calls[0], ['tmux', '-f', '/dev/null', '-L', 'sock1', 'list-sessions', '-F', '#{session_name}\t#{session_created}\t#{session_attached}']);
  const none = createSessions({ exec: fakeExec(() => ({ code: 1, stdout: '', stderr: 'no server running' })).exec, clock });
  assert.deepEqual(await none.list(), []);
});

test('bad ids and bad input are rejected before any exec', async () => {
  const { exec, calls } = fakeExec();
  const s = createSessions({ exec, clock });
  for (const bad of ['', 'AB', 'a;b', '../x', 'g1', 'sfx-ab', 5, null]) {
    await assert.rejects(s.send(bad, 'x'), TypeError);
    await assert.rejects(s.stop(bad), TypeError);
    await assert.rejects(s.screen(bad), TypeError);
    await assert.rejects(s.sendBytes(bad, new Uint8Array(1)), TypeError);
    await assert.rejects(s.resize(bad, 1, 1), TypeError);
  }
  await assert.rejects(s.start({ agent: 'nope', cwd: '/x' }), /unknown agent/);
  await assert.rejects(s.start({ agent: 'claude', cwd: '/x', cols: 0 }), TypeError);
  assert.equal(calls.length, 0);
});

test('tmux failure surfaces as an error', async () => {
  const s = createSessions({ exec: fakeExec(() => ({ code: 1, stdout: '', stderr: 'duplicate session' })).exec, clock });
  await assert.rejects(s.start({ agent: 'claude', cwd: '/x' }), /duplicate session/);
});

test('claude adapter: flags, transcript path, parsing', () => {
  const c = builtinAgents.claude;
  assert.deepEqual(c.startArgs({ sessionId: 'S' }), ['--session-id', 'S']);
  assert.deepEqual(c.resumeArgs({ sessionId: 'S' }), ['--resume', 'S']);
  assert.equal(c.locateTranscript({ home: '/h', cwd: '/a/b.c_d', sessionId: 'S' }), '/h/.claude/projects/-a-b-c-d/S.jsonl');
  assert.deepEqual(c.parseLine({ type: 'user', uuid: 'u1', timestamp: '2026-01-01T00:00:00Z', message: { content: 'hi' } }).map((m) => [m.role, m.text]), [['user', 'hi']]);
  const a = c.parseLine({ type: 'assistant', uuid: 'a1', message: { content: [{ type: 'thinking', thinking: 'x' }, { type: 'text', text: 'yo' }, { type: 'tool_use', name: 'Bash', input: { command: 'ls' } }] } });
  assert.deepEqual(a.map((m) => m.role), ['assistant', 'tool']);
  assert.deepEqual(a[1].tool, { name: 'Bash', input: { command: 'ls' } });
  const t = c.parseLine({ type: 'user', uuid: 'u2', message: { content: [{ type: 'tool_result', tool_use_id: 'x', content: 'out' }] } });
  assert.equal(t[0].tool.output, 'out');
  assert.deepEqual(c.parseLine({ type: 'queue-operation' }), []);
});

test('codex adapter: args and parsing', () => {
  const x = builtinAgents.codex;
  assert.deepEqual(x.startArgs({}), []);
  assert.deepEqual(x.resumeArgs({ sessionId: 'S' }), ['resume', 'S']);
  const line = (p) => x.parseLine({ type: 'response_item', timestamp: '2026-01-01T00:00:00Z', ordinal: 3, payload: p });
  assert.deepEqual(line({ type: 'message', role: 'user', content: [{ type: 'input_text', text: 'hello' }] }).map((m) => m.text), ['hello']);
  assert.deepEqual(line({ type: 'message', role: 'user', content: [{ type: 'input_text', text: '<environment_context>' }] }), []);
  assert.deepEqual(line({ type: 'message', role: 'developer', content: [{ type: 'input_text', text: 'sys' }] }), []);
  assert.equal(line({ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'ok' }] })[0].role, 'assistant');
  assert.deepEqual(line({ type: 'function_call', name: 'shell', arguments: '{}' })[0].tool, { name: 'shell', input: '{}' });
  assert.equal(line({ type: 'function_call_output', output: 'done' })[0].tool.output, 'done');
  assert.deepEqual(line({ type: 'reasoning' }), []);
});

test('chat tails a transcript: partial trailing line buffered, malformed line skipped', async () => {
  const dir = tmp(); const file = path.join(dir, 't.jsonl');
  fs.writeFileSync(file, '{"t":"one"}\nnot json\n{"t":"tw');
  const { exec } = fakeExec();
  const s = createSessions({ exec, clock, home: dir, agents: { a: mkAgent(file) } });
  const r = await s.start({ agent: 'a', cwd: '/w' });
  assert.deepEqual(s.messages(r.id).map((m) => m.text), ['one']);
  const got = [];
  let seen; const two = new Promise((res, rej) => { seen = res; setTimeout(() => rej(new Error('no chat event in 3s')), 3000).unref(); });
  const un = s.chat(r.id, (m) => { got.push(...m.map((x) => x.text)); if (got.includes('two')) seen(); });
  assert.deepEqual(got, ['one']);
  fs.appendFileSync(file, 'o"}\n{"unknown":1}\n');
  await two;
  assert.deepEqual(got, ['one', 'two']);
  un();
  await s.stop(r.id);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('history list/read against a fake home; cwd filter; resume args', async () => {
  const home = tmp();
  const pd = path.join(home, '.claude', 'projects', '-w-proj'); fs.mkdirSync(pd, { recursive: true });
  fs.writeFileSync(path.join(pd, 'sess-1.jsonl'), [
    JSON.stringify({ type: 'queue-operation' }),
    JSON.stringify({ type: 'user', uuid: 'u', cwd: '/w/proj', timestamp: '2026-02-01T00:00:00Z', message: { content: 'first prompt' } }),
    JSON.stringify({ type: 'assistant', uuid: 'a', timestamp: '2026-02-01T00:00:01Z', message: { content: [{ type: 'text', text: 'answer' }] } }), ''].join('\n'));
  const cd = path.join(home, '.codex', 'sessions', '2026', '02', '03'); fs.mkdirSync(cd, { recursive: true });
  const cid = '019aaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
  fs.writeFileSync(path.join(cd, `rollout-2026-02-03T10-00-00-${cid}.jsonl`), [
    JSON.stringify({ type: 'session_meta', payload: { id: cid, cwd: '/w/other', timestamp: '2026-02-03T10:00:00Z' } }),
    JSON.stringify({ type: 'response_item', payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text: 'codex ask' }] } }), ''].join('\n'));
  const { exec, calls } = fakeExec();
  const s = createSessions({ exec, clock, home });
  const c = s.history.list({ agent: 'claude' });
  assert.deepEqual(c.map((h) => [h.sessionId, h.cwd, h.title]), [['sess-1', '/w/proj', 'first prompt']]);
  assert.deepEqual(s.history.read(c[0].path, 'claude').map((m) => m.text), ['first prompt', 'answer']);
  const x = s.history.list({ agent: 'codex' });
  assert.deepEqual(x.map((h) => [h.sessionId, h.cwd, h.title]), [[cid, '/w/other', 'codex ask']]);
  assert.deepEqual(s.history.list({ agent: 'codex', cwd: '/nope' }), []);
  await s.resume({ agent: 'claude', sessionId: 'sess-1', cwd: '/w/proj' });
  assert.deepEqual(calls[0].slice(-3), ['claude', '--resume', 'sess-1']);
  await s.resume({ agent: 'codex', sessionId: cid, cwd: '/w/other' });
  assert.deepEqual(calls[1].slice(-3), ['codex', 'resume', cid]);
  fs.rmSync(home, { recursive: true, force: true });
});

test('slots: list, chat and meta maintained; raw bytes never', async () => {
  const dir = tmp(); const file = path.join(dir, 't.jsonl'); fs.writeFileSync(file, '{"t":"hey"}\n');
  const slots = createSlots({ bus: { on() { return () => {}; }, emit() {} }, clock });
  const s = createSessions({ exec: fakeExec().exec, clock, slots, home: dir, agents: { a: mkAgent(file) } });
  assert.deepEqual(slots.read('sessions:list').value, []);
  const r = await s.start({ agent: 'a', cwd: '/w' });
  assert.equal(slots.read('sessions:list').value[0].id, r.id);
  assert.deepEqual(slots.read(`session:${r.id}:meta`).value, { attachCommand: r.attachCommand, agent: 'a', cwd: '/w', state: 'running' });
  assert.deepEqual(slots.read(`session:${r.id}:chat`).value.map((m) => m.text), ['hey']);
  await s.stop(r.id);
  assert.deepEqual(slots.read('sessions:list').value, []);
  assert.equal(slots.read(`session:${r.id}:meta`), undefined);
  fs.rmSync(dir, { recursive: true, force: true });
});

// ---- reviewer-defect regression tests ----
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function waitFor(label, ms = 3000) {
  let done; const p = new Promise((res, rej) => { const t = setTimeout(() => rej(new Error(`timed out waiting for ${label}`)), ms); t.unref(); done = () => { clearTimeout(t); res(); }; });
  return { p, done };
}
// os.tmpdir() reads $TMPDIR on every call: point it at a private dir so stream temp dirs can be counted
async function withTmpdir(fn) {
  const own = tmp(); const old = process.env.TMPDIR; process.env.TMPDIR = own;
  try { return await fn(own); } finally { if (old === undefined) delete process.env.TMPDIR; else process.env.TMPDIR = old; fs.rmSync(own, { recursive: true, force: true }); }
}
const streamDirs = (own) => fs.readdirSync(own).filter((n) => n.startsWith('sfx-stream-'));
const sendKeysLast = (calls) => calls.filter((c) => c[7] === 'send-keys' || c.includes('send-keys')).map((c) => c.at(-1));

test('send: text ending in ";" is protected from tmux command splitting (extra ";"); others untouched', async () => {
  const { exec, calls } = fakeExec();
  const s = createSessions({ exec, clock });
  for (const t of ['x;', ';', 'a\;', 'a;;', 'é;', 'plain', 'mid;dle']) await s.send('ab12', t, { enter: false });
  await s.send('ab12', '', { enter: false });
  assert.deepEqual(calls.map((c) => c.at(-1)), ['x;;', ';;', 'a\;;', 'a;;;', 'é;;', 'plain', 'mid;dle']);
});

test('stop: succeeds and cleans everything when the tmux session is already gone', async () => {
  await withTmpdir(async (own) => {
    const dir = tmp(); const file = path.join(dir, 't.jsonl'); fs.writeFileSync(file, '{"t":"hey"}\n');
    const slots = createSlots({ bus: { on() { return () => {}; }, emit() {} }, clock });
    const gone = (cmd, args) => (args.includes('kill-session') ? { code: 1, stdout: '', stderr: "can't find session" } : { code: 0, stdout: '', stderr: '' });
    const s = createSessions({ exec: fakeExec(gone).exec, clock, slots, home: dir, agents: { a: mkAgent(file) } });
    const r = await s.start({ agent: 'a', cwd: '/w' });
    await s.stream(r.id, () => {}); s.chat(r.id, () => {});
    assert.equal(streamDirs(own).length, 1);
    await s.stop(r.id);
    assert.equal(streamDirs(own).length, 0);
    assert.deepEqual(slots.read('sessions:list').value, []);
    assert.equal(slots.read(`session:${r.id}:meta`), undefined);
    await assert.rejects(s.stream(r.id, () => {}), /unknown session/);
    fs.rmSync(dir, { recursive: true, force: true });
  });
});

test('stop: tolerates exec rejecting too', async () => {
  const slots = createSlots({ bus: { on() { return () => {}; }, emit() {} }, clock });
  const exec = async (cmd, args) => { if (args.includes('kill-session')) throw new Error('spawn failed'); return { code: 0, stdout: '', stderr: '' }; };
  const dir = tmp();
  const s = createSessions({ exec, clock, slots, home: dir, agents: { a: mkAgent(path.join(dir, 't.jsonl')) } });
  const r = await s.start({ agent: 'a', cwd: '/w' });
  await s.stop(r.id);
  assert.deepEqual(slots.read('sessions:list').value, []);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('list reconciles records whose tmux session exited', async () => {
  const dir = tmp();
  let out = '';
  const slots = createSlots({ bus: { on() { return () => {}; }, emit() {} }, clock });
  const exec = async (cmd, args) => (args.includes('list-sessions') ? (out === null ? { code: 1, stdout: '', stderr: 'no server running on /tmp/x' } : { code: 0, stdout: out, stderr: '' }) : { code: 0, stdout: '', stderr: '' });
  const s = createSessions({ exec, clock, slots, home: dir, agents: { a: mkAgent(path.join(dir, 't.jsonl')) } });
  const r1 = await s.start({ agent: 'a', cwd: '/w' }); const r2 = await s.start({ agent: 'a', cwd: '/w' });
  out = `sfx-${r1.id}\t1\t0\n`;
  assert.deepEqual((await s.list()).map((x) => x.id), [r1.id]);
  assert.deepEqual(slots.read('sessions:list').value.map((x) => x.id), [r1.id]);
  assert.equal(slots.read(`session:${r2.id}:meta`), undefined);
  out = null;
  assert.deepEqual(await s.list(), []);
  assert.deepEqual(slots.read('sessions:list').value, []);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('codex: two sessions in one cwd never tail the same rollout file', async () => {
  const home = tmp(); const cwd = '/w/same';
  const s = createSessions({ exec: fakeExec().exec, clock: { now: Date.now }, home });
  const r1 = await s.start({ agent: 'codex', cwd }); await sleep(15);
  const r2 = await s.start({ agent: 'codex', cwd }); await sleep(15);
  const d = path.join(home, '.codex', 'sessions', ...new Date().toISOString().slice(0, 10).split('-')); // local-date dirs: use the adapter's own scheme below
  const now = new Date(); const dd = path.join(home, '.codex', 'sessions', String(now.getFullYear()), String(now.getMonth() + 1).padStart(2, '0'), String(now.getDate()).padStart(2, '0'));
  fs.mkdirSync(dd, { recursive: true });
  const mk = (name, text) => fs.writeFileSync(path.join(dd, `rollout-2026-01-01T00-00-00-${name}.jsonl`), [
    JSON.stringify({ type: 'session_meta', payload: { id: name, cwd } }),
    JSON.stringify({ type: 'response_item', payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text }] } }), ''].join('\n'));
  mk('019aaaaa-0000-0000-0000-000000000001', 'fromA'); await sleep(15);
  mk('019aaaaa-0000-0000-0000-000000000002', 'fromB');
  assert.deepEqual(s.messages(r1.id).map((m) => m.text), ['fromA']);
  assert.deepEqual(s.messages(r2.id).map((m) => m.text), ['fromB']);
  void d;
  await s.stop(r1.id); await s.stop(r2.id);
  fs.rmSync(home, { recursive: true, force: true });
});

test('chat tail recovers when the transcript dir does not exist yet (claude, no ~/.claude/projects)', async () => {
  const home = tmp(); const cwd = '/w/proj'; const sid = 'abc-123';
  const s = createSessions({ exec: fakeExec().exec, clock, home });
  const r = await s.start({ agent: 'claude', cwd, sessionId: sid });
  const got = []; const w = waitFor('late transcript');
  const un = s.chat(r.id, (m) => { got.push(...m.map((x) => x.text)); if (got.includes('late')) w.done(); });
  await sleep(50);
  const pd = path.join(home, '.claude', 'projects', '-w-proj'); fs.mkdirSync(pd, { recursive: true });
  await sleep(50);
  fs.writeFileSync(path.join(pd, `${sid}.jsonl`), `${JSON.stringify({ type: 'user', uuid: 'u1', message: { content: 'late' } })}\n`);
  await w.p;
  assert.deepEqual(got, ['late']);
  un(); await s.stop(r.id);
  fs.rmSync(home, { recursive: true, force: true });
});

test('chat tail recovers when a custom transcript parent dir is missing', async () => {
  const dir = tmp(); const file = path.join(dir, 'a', 'b', 't.jsonl');
  const s = createSessions({ exec: fakeExec().exec, clock, home: dir, agents: { a: mkAgent(file) } });
  const r = await s.start({ agent: 'a', cwd: '/w' });
  const got = []; const w = waitFor('nested transcript');
  const un = s.chat(r.id, (m) => { got.push(...m.map((x) => x.text)); if (got.includes('deep')) w.done(); });
  fs.mkdirSync(path.dirname(file), { recursive: true }); await sleep(50);
  fs.writeFileSync(file, '{"t":"deep"}\n');
  await w.p;
  un(); await s.stop(r.id);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('concurrent stream() calls share one pipe-pane, one temp dir; last unsubscribe tears down', async () => {
  await withTmpdir(async (own) => {
    const { exec, calls } = fakeExec();
    const s = createSessions({ exec, clock });
    const dir = tmp(); const sess = createSessions({ exec, clock, home: dir, agents: { a: mkAgent(path.join(dir, 't.jsonl')) } });
    void s;
    const r = await sess.start({ agent: 'a', cwd: '/w' });
    const unsubs = await Promise.all([sess.stream(r.id, () => {}), sess.stream(r.id, () => {}), sess.stream(r.id, () => {})]);
    const pipes = () => calls.filter((c) => c.includes('pipe-pane'));
    assert.equal(pipes().length, 1);
    assert.equal(streamDirs(own).length, 1);
    await unsubs[0](); await unsubs[1]();
    assert.equal(pipes().length, 1); assert.equal(streamDirs(own).length, 1);
    await unsubs[2]();
    assert.equal(pipes().length, 2); assert.equal(pipes()[1].at(-1), `sfx-${r.id}`); // pipe-pane -t name with no command = off
    assert.equal(streamDirs(own).length, 0);
    const again = await sess.stream(r.id, () => {}); // a fresh stream after teardown sets up once more
    assert.equal(pipes().length, 3); await again();
    await sess.stop(r.id);
    fs.rmSync(dir, { recursive: true, force: true });
  });
});

test('no unhandled rejection when pipe-pane off rejects; temp dir still removed', async () => {
  await withTmpdir(async (own) => {
    const seen = []; const h = (e) => seen.push(e); process.on('unhandledRejection', h);
    try {
      let on = true;
      const exec = async (cmd, args) => { if (args.includes('pipe-pane') && /^sfx-/.test(args.at(-1)) && !on) throw new Error('exec boom'); return { code: 0, stdout: '', stderr: '' }; };
      const dir = tmp();
      const s = createSessions({ exec, clock, home: dir, agents: { a: mkAgent(path.join(dir, 't.jsonl')) } });
      const r = await s.start({ agent: 'a', cwd: '/w' });
      const un = await s.stream(r.id, () => {}); on = false;
      un(); await sleep(50); await s.stop(r.id);
      assert.deepEqual(seen, []); assert.equal(streamDirs(own).length, 0);
      fs.rmSync(dir, { recursive: true, force: true });
    } finally { process.off('unhandledRejection', h); }
  });
});

test('start rolls back the tmux session and state when something throws after new-session', async () => {
  const { exec, calls } = fakeExec();
  const published = [];
  const slots = { define(def, init) { if (def.id.startsWith('session:')) throw new Error('slot boom'); return { set: (v) => published.push(v), remove() {} }; } };
  const dir = tmp();
  const s = createSessions({ exec, clock, slots, home: dir, agents: { a: mkAgent(path.join(dir, 't.jsonl')) } });
  await assert.rejects(s.start({ agent: 'a', cwd: '/w' }), /slot boom/);
  const created = calls.find((c) => c.includes('new-session')); const name = created[created.indexOf('-s') + 1];
  assert.ok(calls.some((c) => c.includes('kill-session') && c.at(-1) === name), 'kill-session issued');
  assert.deepEqual(published.at(-1), []); // list republished without the failed record
  fs.rmSync(dir, { recursive: true, force: true });
});

test('tail: truncation resets partial line + utf8 decoder; multibyte split across writes; inode replacement restarts', async () => {
  const dir = tmp(); const file = path.join(dir, 't.jsonl');
  fs.writeFileSync(file, '');
  const s = createSessions({ exec: fakeExec().exec, clock, home: dir, agents: { a: mkAgent(file) } });
  const r = await s.start({ agent: 'a', cwd: '/w' });
  const got = []; let waiter = null;
  const un = s.chat(r.id, (m) => { got.push(...m.map((x) => x.text)); waiter?.(); });
  const until = (text) => new Promise((res, rej) => { if (got.includes(text)) return res(); const t = setTimeout(() => rej(new Error(`timeout waiting ${text}; got ${JSON.stringify(got)}`)), 3000); t.unref(); waiter = () => { if (got.includes(text)) { clearTimeout(t); waiter = null; res(); } }; });
  // 1. multibyte char split across two writes
  const bytes = Buffer.from('{"t":"é€"}\n'); const cut = bytes.indexOf(0xc3) + 1;
  fs.appendFileSync(file, bytes.subarray(0, cut)); await sleep(150); fs.appendFileSync(file, bytes.subarray(cut));
  await until('é€');
  // 2. dangling partial line + half a multibyte char, then truncation: neither may leak into the new content
  fs.appendFileSync(file, Buffer.concat([Buffer.from('{"t":"xxxxxxxxxxxxxxxxxxxxxxxxx'), Buffer.from([0xe2, 0x82])])); await sleep(150);
  fs.writeFileSync(file, '{"t":"fresh"}\n');
  await until('fresh');
  // 3. replaced by a different inode that is larger than the old offset
  const tmpf = path.join(dir, 'new.jsonl'); fs.writeFileSync(tmpf, '{"t":"b1"}\n{"t":"b2"}\n{"t":"b3"}\n{"t":"b4"}\n');
  fs.renameSync(tmpf, file);
  await until('b4');
  assert.deepEqual(got, ['é€', 'fresh', 'b1', 'b2', 'b3', 'b4']);
  un(); await s.stop(r.id);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('resume requires a non-empty safe string sessionId', async () => {
  const { exec, calls } = fakeExec();
  const s = createSessions({ exec, clock });
  for (const bad of ['', '--x', 'a b', 'a;b', '$(x)', 5, null, undefined, {}, '../x']) {
    await assert.rejects(s.resume({ agent: 'claude', sessionId: bad, cwd: '/w' }), TypeError, `resume ${String(bad)}`);
    await assert.rejects(s.start({ agent: 'claude', cwd: '/w', sessionId: bad, resume: true }), TypeError);
  }
  assert.equal(calls.length, 0);
  await s.resume({ agent: 'claude', sessionId: '019aaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', cwd: '/w' });
  assert.equal(calls.length, 1);
});
