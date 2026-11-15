import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createVault, createMemoryKeyring, createFileKeyring, VaultError } from '../src/vault/index.mjs';

async function setup(t, clock = { now: () => 1000 }) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'vault-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const keyring = createMemoryKeyring();
  return { dir, keyring, vault: createVault({ dir: path.join(dir, 'v'), keyring, clock }) };
}
const flip = (b64) => { const b = Buffer.from(b64, 'base64'); b[0] ^= 1; return b.toString('base64'); };

test('round trip, canonical payload, envelope shape', async (t) => {
  const { vault } = await setup(t);
  const d = vault.seal('view', 'a', { b: 1, a: [1, { y: 2, x: 3 }] }, { schema: 's' });
  assert.equal(d.format, 'suffice.sealed'); assert.equal(d.v, 1); assert.equal(d.alg, 'A256GCM');
  assert.ok(!JSON.stringify(d).includes('"a":[1'));
  const o = vault.open(JSON.parse(JSON.stringify(d)));
  assert.deepEqual(o.payload, { b: 1, a: [1, { y: 2, x: 3 }] });
  assert.equal(o.kind, 'view'); assert.equal(o.id, 'a'); assert.equal(o.meta.schema, 's');
  assert.equal(o.meta.created, 1000);
});

test('each tamper case fails without leaking material', async (t) => {
  const { vault, keyring } = await setup(t);
  const d = vault.seal('view', 'a', { secret: 'hunter2' });
  const cases = { ct: flip(d.ct), tag: flip(d.tag), iv: flip(d.iv) };
  for (const [k, v] of Object.entries(cases)) {
    assert.throws(() => vault.open({ ...d, [k]: v }), (e) => e instanceof VaultError);
  }
  for (const [k, v] of [['kind', 'other'], ['id', 'b']]) {
    assert.throws(() => vault.open({ ...d, [k]: v }), VaultError);
  }
  keyring.rotate();
  assert.throws(() => vault.open({ ...d, kid: keyring.current().kid }), VaultError);
  try { vault.open({ ...d, ct: flip(d.ct) }); } catch (e) {
    assert.ok(!e.message.includes('hunter2')); assert.ok(!e.message.includes(keyring.get(d.kid).toString('base64')));
  }
  assert.throws(() => vault.open({ ...d, v: 2 }), VaultError);
  assert.throws(() => vault.open({ ...d, ct: 5 }), VaultError);
});

test('header swap between two documents fails', async (t) => {
  const { vault } = await setup(t);
  const a = vault.seal('view', 'a', { n: 1 }); const b = vault.seal('view', 'b', { n: 2 });
  assert.throws(() => vault.open({ ...a, id: 'b' }), VaultError);
  assert.throws(() => vault.open({ ...b, iv: a.iv, tag: a.tag, ct: a.ct }), VaultError);
});

test('unknown kid gives a clear error', async (t) => {
  const { vault } = await setup(t);
  const d = vault.seal('view', 'a', 1);
  assert.throws(() => vault.open({ ...d, kid: 'nope' }), /unknown key id "nope"/);
});

test('IVs differ across seals of the same payload', async (t) => {
  const { vault } = await setup(t);
  const a = vault.seal('view', 'a', { x: 1 }); const b = vault.seal('view', 'a', { x: 1 });
  assert.notEqual(a.iv, b.iv); assert.notEqual(a.ct, b.ct);
  assert.equal(Buffer.from(a.iv, 'base64').length, 12);
});

test('put/get/list/delete, file and dir modes', async (t) => {
  const { vault, dir } = await setup(t);
  vault.put(vault.seal('view', 'a', 1)); vault.put(vault.seal('view', 'b', 2)); vault.put(vault.seal('session', 'c', 3));
  const f = path.join(dir, 'v', 'view', 'a.sealed.json');
  assert.equal((await fs.stat(f)).mode & 0o777, 0o600);
  assert.equal((await fs.stat(path.join(dir, 'v', 'view'))).mode & 0o777, 0o700);
  assert.equal((await fs.stat(path.join(dir, 'v'))).mode & 0o777, 0o700);
  assert.equal(vault.open(vault.get('view', 'a')).payload, 1);
  assert.equal(vault.get('view', 'zzz'), undefined);
  assert.deepEqual(vault.list('view'), [{ kind: 'view', id: 'a' }, { kind: 'view', id: 'b' }]);
  assert.equal(vault.list().length, 3);
  assert.deepEqual((await fs.readdir(path.join(dir, 'v', 'view'))).sort(), ['a.sealed.json', 'b.sealed.json']);
  assert.equal(vault.delete('view', 'a'), true); assert.equal(vault.delete('view', 'a'), false);
  assert.equal(vault.get('view', 'a'), undefined);
});

test('traversal and bad ids are rejected', async (t) => {
  const { vault, dir } = await setup(t);
  for (const bad of ['../x', 'a/b', '', '..', '.', 'A', 'a\0', 'a b', 5]) {
    assert.throws(() => vault.seal('view', bad, 1), TypeError);
    assert.throws(() => vault.seal(bad, 'a', 1), TypeError);
    assert.throws(() => vault.get('view', bad), TypeError);
    assert.throws(() => vault.delete(bad, 'a'), TypeError);
  }
  const d = vault.seal('view', 'a', 1);
  assert.throws(() => vault.put({ ...d, id: '../../evil' }), TypeError);
  await assert.rejects(fs.stat(path.join(dir, 'evil.sealed.json')));
});

test('rotate re-seals all, resumes after injected failure', async (t) => {
  let fail = false, n = 0;
  const clock = { now: () => { if (fail && ++n === 2) throw new Error('boom'); return 5; } };
  const { vault, keyring } = await setup(t, clock);
  for (const id of ['a', 'b', 'c']) vault.put(vault.seal('view', id, { id }));
  const old = keyring.current().kid;
  const nk = keyring.rotate();
  fail = true;
  assert.throws(() => vault.rotate(nk), /boom/);
  const kids = vault.list().map((x) => vault.get(x.kind, x.id).kid);
  assert.equal(kids.filter((k) => k === nk.kid).length, 1);
  assert.equal(kids.filter((k) => k === old).length, 2);
  fail = false;
  assert.equal(vault.rotate(nk), 2);
  assert.equal(vault.rotate(nk), 0);
  for (const x of vault.list()) { const d = vault.get(x.kind, x.id); assert.equal(d.kid, nk.kid); assert.deepEqual(vault.open(d).payload, { id: x.id }); }
});

test('bundle round trip, wrong passphrase, not readable with vault key', async (t) => {
  const { vault, dir } = await setup(t);
  vault.put(vault.seal('view', 'a', { n: 1 })); vault.put(vault.seal('workflow', 'w', { n: 2 }));
  const bundle = JSON.parse(JSON.stringify(vault.exportBundle([{ kind: 'view', id: 'a' }, { kind: 'workflow', id: 'w' }], 'pw')));
  assert.equal(bundle.kdf.N, 32768); assert.equal(bundle.kdf.r, 8); assert.equal(bundle.kdf.p, 1);
  assert.equal(Buffer.from(bundle.kdf.salt, 'base64').length, 16);
  assert.throws(() => vault.open(bundle.docs[0]), VaultError);
  const other = createVault({ dir: path.join(dir, 'o'), keyring: createMemoryKeyring(), clock: { now: () => 1 } });
  assert.throws(() => other.importBundle(bundle, 'wrong'), VaultError);
  assert.deepEqual(other.list(), []);
  assert.equal(other.importBundle(bundle, 'pw').length, 2);
  assert.deepEqual(other.open(other.get('view', 'a')).payload, { n: 1 });
  assert.deepEqual(other.open(other.get('workflow', 'w')).payload, { n: 2 });
  assert.throws(() => vault.exportBundle([{ kind: 'view', id: 'nope' }], 'pw'), VaultError);
  assert.throws(() => vault.exportBundle([], ''), TypeError);
});

test('file keyring: created 0600 on first use, stable, usable', async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'vk-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const p = path.join(dir, 'sub', 'keys.json');
  const kr = createFileKeyring(p);
  const c = kr.current();
  assert.equal(c.key.length, 32);
  assert.equal((await fs.stat(p)).mode & 0o777, 0o600);
  const kr2 = createFileKeyring(p);
  assert.deepEqual(kr2.current().key, c.key); assert.deepEqual(kr2.get(c.kid), c.key);
  const n = kr2.rotate();
  assert.notEqual(n.kid, c.kid); assert.deepEqual(createFileKeyring(p).get(c.kid), c.key);
  assert.equal(createFileKeyring(p).current().kid, n.kid);
  assert.equal(kr.get('nope'), undefined);
  assert.equal((await fs.stat(p)).mode & 0o777, 0o600);
});
