import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { validateManifest, createPluginHost } from '../src/plugins/index.mjs';
import { createBus } from '../src/journal/index.mjs';

const good = { name: 'hello', version: '1.2.3', main: 'index.mjs' };
const clock = { now: () => 1 };
const bus = { on: () => () => {}, emit() {} };

async function tmp(t) {
  const d = await fs.mkdtemp(path.join(os.tmpdir(), 'plugins-'));
  t.after(() => fs.rm(d, { recursive: true, force: true }));
  return d;
}
async function plugin(root, folder, manifest, code = 'export function activate() {}') {
  const dir = path.join(root, folder);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, 'plugin.json'), typeof manifest === 'string' ? manifest : JSON.stringify(manifest));
  await fs.writeFile(path.join(dir, 'index.mjs'), code);
  return dir;
}
const host = (dirs, grant = () => true) => createPluginHost({ dirs, bus, grant, clock });

test('valid manifest', () => {
  assert.deepEqual(validateManifest(good), { ok: true, errors: [] });
  const full = { ...good, activation: ['onStart', 'onCommand:x', 'onWorkflow:w', 'onEvent:e'], permissions: ['fs.read', 'ui'], contributes: { commands: ['a'], panels: ['p'] } };
  assert.equal(validateManifest(full).ok, true);
});

test('invalid manifests', () => {
  const bad = [
    null, [], 'x',
    { ...good, name: 'Bad Name' }, { ...good, name: undefined },
    { ...good, version: '1.2' }, { ...good, version: '^1.2.3' },
    { ...good, main: undefined }, { ...good, main: '/abs.mjs' }, { ...good, main: '../x.mjs' },
    { ...good, main: 'a/../../x.mjs' }, { ...good, main: 'a\\..\\..\\x.mjs' },
    { ...good, permissions: ['root'] }, { ...good, permissions: 'fs.read' },
    { ...good, activation: ['onFoo:x'] }, { ...good, activation: ['onCommand:'] }, { ...good, activation: ['onStart:x'] },
    { ...good, extra: 1 },
    { ...good, contributes: { widgets: ['a'] } }, { ...good, contributes: { commands: 'a' } }, { ...good, contributes: { commands: [1] } },
  ];
  for (const m of bad) {
    const r = validateManifest(m);
    assert.equal(r.ok, false, JSON.stringify(m));
    assert.ok(r.errors.length > 0 && r.errors.every((e) => typeof e === 'string'));
  }
});

test('constructor validates inputs', () => {
  assert.throws(() => createPluginHost({ dirs: 'x', bus, grant() {}, clock }), TypeError);
  assert.throws(() => createPluginHost({ dirs: [], bus: {}, grant() {}, clock }), TypeError);
  assert.throws(() => createPluginHost({ dirs: [], bus, grant: 1, clock }), TypeError);
  assert.throws(() => createPluginHost({ dirs: [], bus, grant() {}, clock: {} }), TypeError);
});

test('discover validates without loading code; duplicates rejected', async (t) => {
  const a = await tmp(t), b = await tmp(t);
  await plugin(a, 'one', good, 'throw new Error("must not load")');
  await plugin(a, 'broken', '{nope');
  await plugin(a, 'badver', { ...good, name: 'badver', version: 'x' });
  await plugin(b, 'dup', good);
  const found = await host([a, b]).discover();
  const byDir = (s) => found.find((f) => f.dir.endsWith(s));
  assert.equal(found.length, 4);
  assert.equal(byDir('one').valid, true);
  assert.equal(byDir('one').version, '1.2.3');
  assert.equal(byDir('broken').valid, false);
  assert.equal(byDir('badver').valid, false);
  assert.equal(byDir(path.join(path.basename(b), 'dup')).valid, false);
  assert.match(byDir(path.join(path.basename(b), 'dup')).errors.join(), /duplicate/);
});

test('main escaping the folder is rejected at discover', async (t) => {
  const a = await tmp(t);
  await plugin(a, 'esc', { ...good, name: 'esc', main: '../outside.mjs' });
  const [p] = await host([a]).discover();
  assert.equal(p.valid, false);
});

test('lazy activation: nothing imported until the event fires; fire is idempotent', async (t) => {
  const a = await tmp(t);
  const marker = path.join(a, 'marker.txt');
  await plugin(a, 'lazy', { ...good, name: 'lazy', activation: ['onCommand:go'], contributes: { commands: ['go'] } },
    `import fs from 'node:fs'; fs.appendFileSync(${JSON.stringify(marker)}, 'x');
     export function activate(ctx) { ctx.register('commands', 'go', () => 1); }`);
  const h = host([a]);
  await h.discover();
  await h.fire('onStart');
  await h.fire('onCommand:other');
  await assert.rejects(fs.access(marker));
  assert.deepEqual(await h.fire('onCommand:go'), ['lazy']);
  assert.deepEqual(await h.fire('onCommand:go'), []);
  assert.equal(await fs.readFile(marker, 'utf8'), 'x');
  assert.equal(h.status('lazy').state, 'active');
});

test('namespacing, undeclared registration, deactivate releases all', async (t) => {
  const a = await tmp(t);
  let deactivated = 0;
  globalThis.__pluginsTestDeact = () => deactivated++;
  t.after(() => delete globalThis.__pluginsTestDeact);
  await plugin(a, 'ns', { ...good, name: 'ns', contributes: { commands: ['c'], tools: ['t'] } },
    `export function activate(ctx) {
       ctx.register('commands', 'c', 'impl-c'); ctx.register('tools', 't', 'impl-t');
       try { ctx.register('commands', 'nope', 1); ctx.register('runners', 'c', 1); } catch (e) { globalThis.__pluginsErr = e; }
     }
     export function deactivate() { globalThis.__pluginsTestDeact(); }`);
  const h = host([a]);
  await h.discover();
  await h.activate('ns');
  assert.equal(h.get('commands', 'ns:c'), 'impl-c');
  assert.equal(h.get('commands', 'c'), undefined);
  assert.deepEqual(h.list('tools').map((x) => x.id), ['ns:t']);
  assert.ok(globalThis.__pluginsErr instanceof TypeError);
  delete globalThis.__pluginsErr;
  await h.deactivate('ns');
  assert.equal(deactivated, 1);
  assert.equal(h.get('commands', 'ns:c'), undefined);
  assert.deepEqual(h.list('tools'), []);
  assert.equal(h.status('ns').state, 'inactive');
});

test('failing plugin is isolated', async (t) => {
  const a = await tmp(t);
  await plugin(a, 'bad', { ...good, name: 'bad', activation: ['onStart'], contributes: { commands: ['x'] } },
    `export function activate(ctx) { ctx.register('commands', 'x', 1); throw new Error('boom'); }`);
  await plugin(a, 'fine', { ...good, name: 'fine', activation: ['onStart'], contributes: { commands: ['y'] } },
    `export function activate(ctx) { ctx.register('commands', 'y', 2); }`);
  const h = host([a]);
  await h.discover();
  const done = await h.fire('onStart');
  assert.deepEqual(done, ['fine']);
  assert.equal(h.status('bad').state, 'failed');
  assert.match(h.status('bad').error, /boom/);
  assert.equal(h.get('commands', 'bad:x'), undefined); // partial registrations rolled back
  assert.equal(h.get('commands', 'fine:y'), 2);
  await assert.rejects(h.activate('bad'), /boom/);
});

test('refused permission blocks activation; granted exposes has()', async (t) => {
  const a = await tmp(t);
  const marker = path.join(a, 'm.txt');
  await plugin(a, 'needy', { ...good, name: 'needy', permissions: ['exec', 'net'], activation: ['onStart'] },
    `import fs from 'node:fs'; fs.writeFileSync(${JSON.stringify(marker)}, 'loaded'); export function activate() {}`);
  await plugin(a, 'ok', { ...good, name: 'ok', permissions: ['net'],
    contributes: { commands: ['c'] } },
    `export function activate(ctx) { ctx.register('commands', 'c', [ctx.has('net'), ctx.has('exec')]); }`);
  const h = host([a], (n, p) => p !== 'exec' || n !== 'needy');
  await h.discover();
  await assert.rejects(h.activate('needy'), /permission.*exec/);
  assert.equal(h.status('needy').state, 'failed');
  await assert.rejects(fs.access(marker));
  await h.activate('ok');
  assert.deepEqual(h.get('commands', 'ok:c'), [true, false]);
});

test('activate rejects unknown and invalid plugins', async (t) => {
  const a = await tmp(t);
  await plugin(a, 'inv', { ...good, name: 'inv', version: 'z' });
  const h = host([a]);
  await h.discover();
  await assert.rejects(h.activate('nope'), TypeError);
  await assert.rejects(h.activate('inv'), TypeError);
  await assert.rejects(h.activate(5), TypeError);
});

test('concurrent activate is single-flight', async (t) => {
  const a = await tmp(t);
  globalThis.__pluginsCount = 0;
  t.after(() => delete globalThis.__pluginsCount);
  await plugin(a, 'sf', { ...good, name: 'sf' },
    `export async function activate() { globalThis.__pluginsCount++; await new Promise((r) => setTimeout(r, 20)); }`);
  const h = host([a]);
  await h.discover();
  await Promise.all([h.activate('sf'), h.activate('sf')]);
  assert.equal(globalThis.__pluginsCount, 1);
  assert.equal(h.status('sf').state, 'active');
});

test('main symlinked outside the plugin folder is rejected', async (t) => {
  const a = await tmp(t), out = await tmp(t);
  const marker = path.join(out, 'm.txt');
  await fs.writeFile(path.join(out, 'evil.mjs'), `import fs from 'node:fs'; fs.writeFileSync(${JSON.stringify(marker)}, 'x'); export function activate() {}`);
  const dir = await plugin(a, 'link', { ...good, name: 'link', main: 'link.mjs' });
  await fs.symlink(path.join(out, 'evil.mjs'), path.join(dir, 'link.mjs'));
  const h = host([a]);
  await h.discover();
  await assert.rejects(h.activate('link'), /escapes/);
  assert.equal(h.status('link').state, 'failed');
  await assert.rejects(fs.access(marker));
});

test('hung activate times out and is marked failed', async (t) => {
  const a = await tmp(t);
  await plugin(a, 'hang', { ...good, name: 'hang' }, `export function activate() { return new Promise(() => {}); }`);
  let fire, ms, cleared = false;
  const timer = { set: (fn, n) => { fire = fn; ms = n; return 1; }, clear: () => { cleared = true; } };
  const h = createPluginHost({ dirs: [a], bus, grant: () => true, clock, timer });
  await h.discover();
  const p = h.activate('hang');
  while (!fire) await new Promise((r) => setImmediate(r));
  assert.equal(ms, 10000);
  fire();
  await assert.rejects(p, /timed out/);
  assert.equal(h.status('hang').state, 'failed');
  assert.ok(cleared);
  assert.throws(() => createPluginHost({ dirs: [], bus, grant() {}, clock, activateTimeoutMs: 0 }), TypeError);
});

test('autoFire: plugin.event on the bus activates matching plugins', async (t) => {
  const a = await tmp(t);
  await plugin(a, 'auto', { ...good, name: 'auto', activation: ['onEvent:ping'] });
  const b = createBus();
  const h = createPluginHost({ dirs: [a], bus: b, grant: () => true, clock, autoFire: true });
  await h.discover();
  const done = new Promise((r) => b.on('plugin.activated', r));
  b.emit('plugin.event', { event: 'onEvent:ping' });
  assert.deepEqual(await done, { name: 'auto' });
  const h2 = createPluginHost({ dirs: [a], bus: createBus(), grant: () => true, clock });
  await h2.discover();
  assert.equal(h2.status('auto').state, 'inactive');
});
