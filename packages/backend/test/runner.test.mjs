import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createExec, createFakeRunner, createCommandRunner, createRunnerRegistry } from '../src/runner/index.mjs';

const node = process.execPath;
const exec = createExec();
const tick = () => new Promise((r) => setImmediate(r));

function fakeClock(step = 5) { let t = 1000; return { now: () => (t += step) }; }
function fakeTimer() {
  const timers = new Map(); let id = 0;
  return {
    setTimeout: (fn) => { timers.set(++id, fn); return id; },
    clearTimeout: (h) => timers.delete(h),
    fireAll() { for (const [h, fn] of [...timers]) { timers.delete(h); fn(); } },
    get pending() { return timers.size; },
  };
}

test('exec: exit codes and output, no throw on non-zero', async () => {
  const ok = await exec(node, ['-e', 'console.log("hi"); console.error("e")']);
  assert.deepEqual(ok, { code: 0, stdout: 'hi\n', stderr: 'e\n', timedOut: false });
  const bad = await exec(node, ['-e', 'process.exit(3)']);
  assert.equal(bad.code, 3);
});

test('exec: args are not shell-interpreted; stdin input and cwd work', async () => {
  const r = await exec(node, ['-e', 'process.stdin.pipe(process.stdout)', ';echo pwned'], { input: 'abc' });
  assert.equal(r.stdout, 'abc');
  const c = await exec(node, ['-e', 'console.log(process.cwd())'], { cwd: process.cwd() });
  assert.equal(c.stdout.trim(), process.cwd());
});

test('exec: timeout kills child, code 124', async () => {
  const r = await exec(node, ['-e', 'setInterval(()=>{},1000)'], { timeoutMs: 150 });
  assert.equal(r.timedOut, true);
  assert.equal(r.code, 124);
});

test('exec: missing binary gives 127; bad cwd rejects', async () => {
  const r = await exec('definitely-not-a-binary-xyz', []);
  assert.equal(r.code, 127);
  await assert.rejects(exec(node, ['-e', '0'], { cwd: '/no/such/dir/xyz' }));
});

test('exec: output capped at 1 MiB with marker', async () => {
  const r = await exec(node, ['-e', 'process.stdout.write("x".repeat(3*1024*1024)); process.stderr.write("y".repeat(2*1024*1024))']);
  assert.equal(r.code, 0);
  for (const s of [r.stdout, r.stderr]) {
    assert.ok(s.length < 1024 * 1024 + 100);
    assert.ok(s.includes('[truncated]'));
  }
  const small = await exec(node, ['-e', 'process.stdout.write("x".repeat(1024*1024))']);
  assert.ok(!small.stdout.includes('[truncated]'));
});

test('fake runner: array script, records requests, fills defaults', async () => {
  const r = createFakeRunner([{ ok: true, text: 'a' }, { ok: false, error: 'no' }]);
  const a = await r.run({ prompt: 'p1' });
  assert.deepEqual(a.usage, { inputTokens: 0, outputTokens: 0 });
  assert.equal(a.ms, 0);
  assert.equal((await r.run({ prompt: 'p2' })).ok, false);
  assert.deepEqual(r.requests.map((q) => q.prompt), ['p1', 'p2']);
  await assert.rejects(r.run({ prompt: 'p3' }), /exhausted/);
});

test('fake runner: function script gets request and index; thrown errors propagate', async () => {
  const r = createFakeRunner((req, i) => { if (i === 1) throw new Error('boom'); return { ok: true, text: req.prompt + i }; });
  assert.equal((await r.run({ prompt: 'x' })).text, 'x0');
  await assert.rejects(r.run({ prompt: 'y' }), /boom/);
  assert.equal(r.requests.length, 2);
  assert.throws(() => createFakeRunner(5), TypeError);
});

test('command runner: stdin prompt, ok mapping, clock ms', async () => {
  const r = createCommandRunner({ exec, command: node, args: ['-e', 'process.stdin.pipe(process.stdout)'], clock: fakeClock(7) });
  const res = await r.run({ prompt: 'hello' });
  assert.equal(res.ok, true);
  assert.equal(res.text, 'hello');
  assert.equal(res.ms, 7);
  assert.deepEqual(res.usage, { inputTokens: 0, outputTokens: 0 });
});

test('command runner: prompt as last arg', async () => {
  const r = createCommandRunner({ exec, command: node, args: ['-e', 'console.log(process.argv.at(-1))'], promptVia: 'arg' });
  assert.equal((await r.run({ prompt: 'zed' })).text.trim(), 'zed');
});

test('command runner: non-zero exit gives ok false with stderr tail', async () => {
  const r = createCommandRunner({ exec, command: node, args: ['-e', 'console.error("a".repeat(5000)+"END"); process.exit(2)'] });
  const res = await r.run({ prompt: 'p' });
  assert.equal(res.ok, false);
  assert.ok(res.error.endsWith('END'));
  assert.ok(res.error.length <= 2000);
});

test('command runner: missing binary and timeout map to ok false', async () => {
  const m = await createCommandRunner({ exec, command: 'no-such-bin-xyz' }).run({ prompt: 'p' });
  assert.equal(m.ok, false);
  const t = await createCommandRunner({ exec, command: node, args: ['-e', 'setInterval(()=>{},1000)'], timeoutMs: 100 }).run({ prompt: 'p' });
  assert.equal(t.ok, false);
  assert.match(t.error, /timed out/);
});

const schema = { type: 'object', required: ['verdict', 'n'] };
const schemaRunner = (out) => createCommandRunner({ exec, command: node, args: ['-e', `process.stdout.write(${JSON.stringify(out)})`] });

test('command runner: schema parses last JSON object', async () => {
  const res = await schemaRunner('chatter {"verdict":"old","n":0}\nmore\n{"verdict":"yes","n":{"k":1}}\n').run({ prompt: 'p', schema });
  assert.equal(res.ok, true);
  assert.deepEqual(res.value, { verdict: 'yes', n: { k: 1 } });
});

test('command runner: schema failures are clear', async () => {
  const none = await schemaRunner('no json here').run({ prompt: 'p', schema });
  assert.equal(none.ok, false);
  assert.match(none.error, /no JSON object/);
  const missing = await schemaRunner('{"verdict":"x"}').run({ prompt: 'p', schema });
  assert.equal(missing.ok, false);
  assert.match(missing.error, /missing required key "n"/);
  const arr = await schemaRunner('[1,2]').run({ prompt: 'p', schema });
  assert.equal(arr.ok, false);
});

test('command runner: boundary validation', async () => {
  assert.throws(() => createCommandRunner({ exec, command: '' }), TypeError);
  assert.throws(() => createCommandRunner({ command: 'x' }), TypeError);
  assert.throws(() => createCommandRunner({ exec, command: 'x', promptVia: 'both' }), TypeError);
  await assert.rejects(createCommandRunner({ exec, command: 'x' }).run({}), TypeError);
});

test('registry: register, get, names, validation', () => {
  const reg = createRunnerRegistry();
  const a = createFakeRunner([]);
  reg.register('b', a); reg.register('a', a);
  assert.deepEqual(reg.names(), ['a', 'b']);
  assert.equal(reg.get('a'), a);
  assert.throws(() => reg.get('zz'), /unknown runner/);
  assert.throws(() => reg.register('', a), TypeError);
  assert.throws(() => reg.register('c', {}), TypeError);
  assert.throws(() => reg.register('a', a), /already/);
});

test('withDefaults: retries thrown errors only up to retries', async () => {
  const reg = createRunnerRegistry({ clock: fakeClock(), timer: fakeTimer() });
  let calls = 0;
  const flaky = { run: async () => { if (++calls < 3) throw new Error('net'); return { ok: true, text: 'ok' }; } };
  const res = await reg.withDefaults(flaky, { retries: 2 }).run({ prompt: 'p' });
  assert.equal(res.ok, true);
  assert.equal(calls, 3);
  calls = -10;
  const dead = await reg.withDefaults(flaky, { retries: 1 }).run({ prompt: 'p' });
  assert.equal(dead.ok, false);
  assert.match(dead.error, /net/);
  assert.equal(calls, -8);
});

test('withDefaults: ok false results are never retried', async () => {
  const fake = createFakeRunner([{ ok: false, error: 'nope' }, { ok: true }]);
  const res = await createRunnerRegistry().withDefaults(fake, { retries: 5 }).run({ prompt: 'p' });
  assert.equal(res.ok, false);
  assert.equal(fake.requests.length, 1);
});

test('withDefaults: timeout retries then fails; result has usage zeros and clock ms', async () => {
  const timer = fakeTimer();
  const reg = createRunnerRegistry({ clock: fakeClock(10), timer });
  let calls = 0;
  const hang = { run: () => { calls++; return new Promise(() => {}); } };
  const p = reg.withDefaults(hang, { timeoutMs: 50, retries: 1 }).run({ prompt: 'p' });
  await tick(); timer.fireAll();
  await tick(); timer.fireAll();
  const res = await p;
  assert.equal(calls, 2);
  assert.equal(res.ok, false);
  assert.match(res.error, /timed out/);
  assert.deepEqual(res.usage, { inputTokens: 0, outputTokens: 0 });
  assert.equal(res.ms, 10);
  assert.equal(timer.pending, 0);
});

test('withDefaults: abort mid-run and pre-aborted return aborted without retry', async () => {
  const reg = createRunnerRegistry({ clock: fakeClock(), timer: fakeTimer() });
  let calls = 0;
  const hang = { run: () => { calls++; return new Promise(() => {}); } };
  const wrapped = reg.withDefaults(hang, { timeoutMs: 1000, retries: 3 });
  const ac = new AbortController();
  const p = wrapped.run({ prompt: 'p', signal: ac.signal });
  await tick(); ac.abort();
  const res = await p;
  assert.deepEqual([res.ok, res.error], [false, 'aborted']);
  assert.equal(calls, 1);
  const pre = await wrapped.run({ prompt: 'p', signal: ac.signal });
  assert.equal(pre.error, 'aborted');
  assert.equal(calls, 1);
});

test('withDefaults: fills missing usage, keeps given usage', async () => {
  const reg = createRunnerRegistry({ clock: fakeClock() });
  const r1 = await reg.withDefaults({ run: async () => ({ ok: true }) }).run({ prompt: 'p' });
  assert.deepEqual(r1.usage, { inputTokens: 0, outputTokens: 0 });
  const r2 = await reg.withDefaults({ run: async () => ({ ok: true, usage: { inputTokens: 4 } }) }).run({ prompt: 'p' });
  assert.deepEqual(r2.usage, { inputTokens: 4, outputTokens: 0 });
});
