import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createTrain } from '../src/train/index.mjs';

let createExec;
try { ({ createExec } = await import('../src/runner/index.mjs')); } catch {
  createExec = () => (cmd, args = [], o = {}) => new Promise((res) => {
    const c = spawn(cmd, args, { cwd: o.cwd }); let stdout = '', stderr = '';
    c.stdout.on('data', (d) => (stdout += d)); c.stderr.on('data', (d) => (stderr += d));
    c.on('close', (code) => res({ code: code ?? 1, stdout, stderr, timedOut: false }));
  });
}
const realExec = createExec();
const clock = { now: () => 1 };
const memJournal = () => {
  const ev = [];
  return { runId: 'r1', append: async (e) => { ev.push(e); return { ...e, seq: ev.length }; }, read: async () => ev.slice(), lookup: async () => ({ hit: false }) };
};
const CHECK = "import fs from 'node:fs'; process.exit(fs.existsSync('bad.txt') ? 1 : 0);";
const gates = [{ name: 'check', command: 'node', args: ['check.mjs'], timeoutMs: 20000 }];

async function repo(t, names, special = {}) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'train-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const git = async (...a) => { const r = await realExec('git', a, { cwd: dir }); assert.equal(r.code, 0, r.stderr); return r; };
  await git('init', '-q', '-b', 'main');
  await git('config', 'user.name', 't'); await git('config', 'user.email', 't@example.com');
  await fs.writeFile(path.join(dir, 'check.mjs'), CHECK);
  await fs.writeFile(path.join(dir, 'shared.txt'), 'base\n');
  await git('add', '.'); await git('commit', '-q', '-m', 'base');
  for (const n of names) {
    await git('checkout', '-q', '-b', n, 'main');
    const [file, body] = special[n] ?? [`${n}.txt`, n];
    await fs.writeFile(path.join(dir, file), body + '\n');
    await git('add', '.'); await git('commit', '-q', '-m', n);
  }
  await git('checkout', '-q', 'main');
  return { dir, git };
}
const mk = (journal = memJournal(), exec = realExec) => createTrain({ exec, journal, clock });

test('three clean branches all merge', async (t) => {
  const { dir, git } = await repo(t, ['a', 'b', 'c']);
  const mainBefore = (await git('rev-parse', 'main')).stdout.trim();
  const r = await mk().run({ repoDir: dir, base: 'main', target: 'train', branches: ['a', 'b', 'c'], gates, batch: 3 });
  assert.deepEqual(r.merged, ['a', 'b', 'c']);
  assert.deepEqual(r.dropped, []);
  assert.equal(r.commit, (await git('rev-parse', 'train')).stdout.trim());
  assert.ok(r.gates.length > 0 && r.gates.every((g) => g.pass));
  assert.equal((await git('rev-parse', 'main')).stdout.trim(), mainBefore);
});

test('bisection isolates the one bad branch among five', async (t) => {
  const { dir } = await repo(t, ['a', 'b', 'c', 'd', 'e'], { c: ['bad.txt', 'x'] });
  const r = await mk().run({ repoDir: dir, base: 'main', target: 'train', branches: ['a', 'b', 'c', 'd', 'e'], gates, batch: 5 });
  assert.deepEqual([...r.merged].sort(), ['a', 'b', 'd', 'e']);
  assert.equal(r.dropped.length, 1);
  assert.equal(r.dropped[0].branch, 'c');
  assert.equal(r.dropped[0].reason, 'gate failure');
  assert.equal(r.dropped[0].gate, 'check');
  const ls = await fs.readdir(dir);
  assert.ok(!ls.includes('bad.txt') && ls.includes('e.txt'));
});

test('conflicting branch is dropped and the rest land', async (t) => {
  const { dir, git } = await repo(t, ['a', 'b', 'c'], { a: ['shared.txt', 'A'], b: ['shared.txt', 'B'] });
  const r = await mk().run({ repoDir: dir, base: 'main', target: 'train', branches: ['a', 'b', 'c'], gates, batch: 3 });
  assert.deepEqual(r.merged, ['a', 'c']);
  assert.deepEqual(r.dropped.map((d) => [d.branch, d.reason]), [['b', 'conflict']]);
  assert.equal((await git('status', '--porcelain')).stdout, '');
});

test('missing branch is dropped as not found', async (t) => {
  const { dir } = await repo(t, ['a']);
  const r = await mk().run({ repoDir: dir, base: 'main', target: 'train', branches: ['a', 'nope'], gates, batch: 2 });
  assert.deepEqual(r.merged, ['a']);
  assert.deepEqual(r.dropped.map((d) => [d.branch, d.reason]), [['nope', 'not found']]);
});

test('a gate that prints ok but exits 1 fails', async (t) => {
  const { dir } = await repo(t, ['a']);
  const g = [{ name: 'liar', command: 'node', args: ['-e', "console.log('ok'); process.exit(1)"], timeoutMs: 20000 }];
  const r = await mk().run({ repoDir: dir, base: 'main', target: 'train', branches: ['a'], gates: g, batch: 1 });
  assert.deepEqual(r.merged, []);
  assert.equal(r.dropped[0].reason, 'gate failure');
  assert.equal(r.dropped[0].gate, 'liar');
  assert.match(r.dropped[0].tail, /ok/);
});

test('resume after a crash does not redo decided branches', async (t) => {
  const { dir } = await repo(t, ['a', 'b', 'c', 'd']);
  const journal = memJournal();
  const crashing = (cmd, args, o) => {
    if (args[0] === 'merge' && args.at(-1) === 'c') throw new Error('injected crash');
    return realExec(cmd, args, o);
  };
  const req = { repoDir: dir, base: 'main', target: 'train', branches: ['a', 'b', 'c', 'd'], gates, batch: 2 };
  await assert.rejects(mk(journal, crashing).run(req), /injected crash/);
  const calls = [];
  const spy = (cmd, args, o) => { calls.push([cmd, ...args]); return realExec(cmd, args, o); };
  const r = await mk(journal, spy).run(req);
  assert.deepEqual(r.merged, ['a', 'b', 'c', 'd']);
  const merged = calls.filter((c) => c[1] === 'merge' && c.includes('--no-ff')).map((c) => c.at(-1));
  assert.deepEqual(merged, ['c', 'd']);
});

test('dirty tree is refused', async (t) => {
  const { dir } = await repo(t, ['a']);
  await fs.writeFile(path.join(dir, 'junk.txt'), 'x');
  await assert.rejects(mk().run({ repoDir: dir, base: 'main', target: 'train', branches: ['a'], gates, batch: 1 }), /dirty/);
});

test('plan dedupes and drops base; bad input throws TypeError', () => {
  const tr = mk();
  assert.deepEqual(tr.plan(['a', 'b', 'a', 'main'], { base: 'main' }), ['a', 'b']);
  assert.throws(() => tr.plan('a', { base: 'main' }), TypeError);
  assert.throws(() => tr.plan(['--force'], { base: 'main' }), TypeError);
  assert.throws(() => createTrain({}), TypeError);
});
