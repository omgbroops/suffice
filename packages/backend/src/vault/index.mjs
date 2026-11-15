// Encrypted JSON-like documents (SealedDoc, see ../contract.mjs). Node built-ins only.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { assertShape } from '../contract.mjs';

export class VaultError extends Error {
  constructor(msg) { super(msg); this.name = 'VaultError'; }
}

const NAME = /^(?!\.+$)[a-z0-9._-]{1,128}$/; // no slashes, no all-dot names: cannot traverse
const SUFFIX = '.sealed.json';
const KDF = { N: 2 ** 15, r: 8, p: 1 };
const BUNDLE_KID = 'bundle';
const isObj = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);

function name(what, s) {
  if (typeof s !== 'string' || !NAME.test(s)) throw new TypeError(`${what}: expected [a-z0-9._-], 1-128 chars, not only dots`);
  return s;
}
function checkKey(k) {
  if (!k || typeof k.kid !== 'string' || !k.kid || !Buffer.isBuffer(k.key) || k.key.length !== 32) throw new TypeError('key: expected {kid, key: Buffer(32)}');
  return k;
}
// sorted keys so equal payloads give equal plaintext
const canonical = (v) => {
  const s = JSON.stringify(v, (_, x) => (isObj(x) ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) : x));
  if (s === undefined) throw new TypeError('payload: expected JSON-serialisable value');
  return s;
};
// binds the header to the ciphertext so it cannot be moved onto another one
const aad = (d) => Buffer.from(JSON.stringify([d.format, d.v, d.kind, d.id, d.alg, d.kid]));

function sealWith(kid, key, kind, id, payload, meta) {
  const iv = crypto.randomBytes(12);
  const doc = { format: 'suffice.sealed', v: 1, kind, id, alg: 'A256GCM', kid };
  const c = crypto.createCipheriv('aes-256-gcm', key, iv);
  c.setAAD(aad(doc));
  const ct = Buffer.concat([c.update(canonical(payload), 'utf8'), c.final()]);
  return { ...doc, iv: iv.toString('base64'), tag: c.getAuthTag().toString('base64'), ct: ct.toString('base64'), meta };
}

function shape(d) {
  if (!isObj(d) || d.format !== 'suffice.sealed' || d.v !== 1 || d.alg !== 'A256GCM') throw new VaultError('not a sealed document');
  for (const f of ['kind', 'id', 'kid', 'iv', 'tag', 'ct']) if (typeof d[f] !== 'string') throw new VaultError(`malformed sealed document: ${f}`);
  if (!NAME.test(d.kind) || !NAME.test(d.id)) throw new VaultError('malformed sealed document: kind or id');
  if (d.meta !== undefined && !isObj(d.meta)) throw new VaultError('malformed sealed document: meta');
  return d;
}

function openWith(key, d) {
  try {
    const iv = Buffer.from(d.iv, 'base64'), tag = Buffer.from(d.tag, 'base64');
    if (iv.length !== 12 || tag.length !== 16) throw 0;
    const x = crypto.createDecipheriv('aes-256-gcm', key, iv);
    x.setAAD(aad(d)); x.setAuthTag(tag);
    const pt = Buffer.concat([x.update(Buffer.from(d.ct, 'base64')), x.final()]).toString('utf8');
    return { kind: d.kind, id: d.id, payload: JSON.parse(pt), meta: d.meta };
  } catch { throw new VaultError('authentication failed: document is corrupt, tampered or sealed under another key'); }
}

function writeAtomic(file, text) {
  const tmp = `${file}.${crypto.randomBytes(6).toString('hex')}.tmp`;
  try {
    fs.writeFileSync(tmp, text, { mode: 0o600, flag: 'wx' });
    fs.renameSync(tmp, file);
  } catch (e) { fs.rmSync(tmp, { force: true }); throw e; }
}

export function createVault({ dir, keyring, clock } = {}) {
  if (typeof dir !== 'string' || !dir) throw new TypeError('dir: expected a non-empty string');
  assertShape('keyring', keyring, ['current', 'get']);
  assertShape('clock', clock, ['now']);
  const file = (kind, id) => path.join(dir, name('kind', kind), name('id', id) + SUFFIX);
  const keyFor = (kid) => {
    const k = keyring.get(kid);
    if (!Buffer.isBuffer(k) || k.length !== 32) throw new VaultError(`unknown key id "${kid}"`);
    return k;
  };

  const v = {
    seal(kind, id, payload, meta) {
      name('kind', kind); name('id', id);
      if (meta !== undefined && !isObj(meta)) throw new TypeError('meta: expected an object');
      const { kid, key } = checkKey(keyring.current()), t = clock.now();
      return sealWith(kid, key, kind, id, payload, { created: t, modified: t, ...meta });
    },
    open(doc) { shape(doc); return openWith(keyFor(doc.kid), doc); },
    put(doc) {
      const f = file(doc?.kind, doc?.id); // TypeError on bad names before anything else
      shape(doc);
      fs.mkdirSync(path.dirname(f), { recursive: true, mode: 0o700 });
      writeAtomic(f, JSON.stringify(doc));
      return { kind: doc.kind, id: doc.id };
    },
    get(kind, id) {
      let text;
      try { text = fs.readFileSync(file(kind, id), 'utf8'); } catch (e) { if (e.code === 'ENOENT') return undefined; throw e; }
      let d;
      try { d = shape(JSON.parse(text)); } catch { throw new VaultError('stored document is unreadable'); }
      if (d.kind !== kind || d.id !== id) throw new VaultError('stored document does not match its path');
      return d;
    },
    list(kind) {
      const kinds = kind === undefined ? (fs.existsSync(dir) ? fs.readdirSync(dir).filter((k) => NAME.test(k)) : []) : [name('kind', kind)];
      return kinds.flatMap((k) => {
        let names; try { names = fs.readdirSync(path.join(dir, k)); } catch (e) { if (e.code === 'ENOENT') return []; throw e; }
        return names.filter((n) => n.endsWith(SUFFIX)).map((n) => ({ kind: k, id: n.slice(0, -SUFFIX.length) })).filter((x) => NAME.test(x.id)).sort((a, b) => (a.id < b.id ? -1 : 1));
      });
    },
    delete(kind, id) {
      try { fs.unlinkSync(file(kind, id)); return true; } catch (e) { if (e.code === 'ENOENT') return false; throw e; }
    },
    // each doc is rewritten atomically and carries its kid, so a rerun only touches the rest
    rotate(newKey) {
      checkKey(newKey);
      let n = 0;
      for (const { kind, id } of v.list()) {
        const d = v.get(kind, id);
        if (d.kid === newKey.kid) continue;
        const o = v.open(d);
        v.put(sealWith(newKey.kid, newKey.key, kind, id, o.payload, { ...o.meta, modified: clock.now() }));
        n++;
      }
      return n;
    },
    exportBundle(ids, passphrase) {
      if (typeof passphrase !== 'string' || !passphrase) throw new TypeError('passphrase: expected a non-empty string');
      if (!Array.isArray(ids)) throw new TypeError('ids: expected an array of {kind, id}');
      const salt = crypto.randomBytes(16), key = derive(passphrase, salt);
      const docs = ids.map(({ kind, id }) => {
        const d = v.get(kind, id);
        if (!d) throw new VaultError(`no such document ${kind}/${id}`);
        const o = v.open(d);
        return sealWith(BUNDLE_KID, key, kind, id, o.payload, o.meta);
      });
      return { format: 'suffice.bundle', v: 1, kdf: { alg: 'scrypt', ...KDF, salt: salt.toString('base64') }, docs };
    },
    importBundle(bundle, passphrase) {
      if (typeof passphrase !== 'string' || !passphrase) throw new TypeError('passphrase: expected a non-empty string');
      const k = isObj(bundle) && isObj(bundle.kdf) ? bundle.kdf : {};
      // fixed params: a bundle must not choose its own cost
      if (bundle?.format !== 'suffice.bundle' || bundle.v !== 1 || k.alg !== 'scrypt' || k.N !== KDF.N || k.r !== KDF.r || k.p !== KDF.p
        || typeof k.salt !== 'string' || Buffer.from(k.salt, 'base64').length !== 16 || !Array.isArray(bundle.docs)) throw new VaultError('not a suffice bundle');
      const key = derive(passphrase, Buffer.from(k.salt, 'base64'));
      // open everything first so a wrong passphrase imports nothing
      const opened = bundle.docs.map((d) => { shape(d); return openWith(key, d); });
      return opened.map((o) => {
        const { kid, key: vk } = checkKey(keyring.current());
        return v.put(sealWith(kid, vk, o.kind, o.id, o.payload, o.meta));
      });
    },
  };
  return v;
}

const derive = (pass, salt) => crypto.scryptSync(pass, salt, 32, { ...KDF, maxmem: 128 * KDF.N * KDF.r * 2 });

export function createMemoryKeyring() {
  const keys = new Map(); let cur;
  const rotate = () => { cur = { kid: `k${keys.size + 1}`, key: crypto.randomBytes(32) }; keys.set(cur.kid, cur.key); return cur; };
  rotate();
  return { current: () => cur, get: (kid) => keys.get(kid), rotate };
}

// shortcut: file key, upgrade to the OS keychain through Electron safeStorage when wired into the app
export function createFileKeyring(p) {
  if (typeof p !== 'string' || !p) throw new TypeError('path: expected a non-empty string');
  const load = () => {
    try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { if (e.code === 'ENOENT') return null; throw new VaultError('key file is unreadable'); }
  };
  const save = (s) => { fs.mkdirSync(path.dirname(p), { recursive: true, mode: 0o700 }); writeAtomic(p, JSON.stringify(s)); };
  const add = (s) => { const kid = `k${Object.keys(s.keys).length + 1}`; s.keys[kid] = crypto.randomBytes(32).toString('base64'); s.current = kid; save(s); return { kid, key: Buffer.from(s.keys[kid], 'base64') }; };
  const state = () => load() ?? (add({ current: null, keys: {} }), load());
  return {
    current() { const s = state(); return { kid: s.current, key: Buffer.from(s.keys[s.current], 'base64') }; },
    get(kid) { const b = load()?.keys?.[kid]; return typeof b === 'string' ? Buffer.from(b, 'base64') : undefined; },
    rotate() { return add(state()); },
  };
}
