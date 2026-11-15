import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { assertShape } from '../contract.mjs';

const KINDS = ['commands', 'workflows', 'runners', 'tools', 'voices', 'panels'];
const PERMS = ['fs.read', 'fs.write', 'exec', 'net', 'model', 'secrets', 'ui'];
const KEYS = ['name', 'version', 'main', 'activation', 'permissions', 'contributes'];
const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(-[0-9A-Za-z.-]+)?(\+[0-9A-Za-z.-]+)?$/;
const ACTIVATION = /^(onStart|(onCommand|onWorkflow|onEvent):.+)$/;
const isStrArray = (a) => Array.isArray(a) && a.every((s) => typeof s === 'string');

export function validateManifest(obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return { ok: false, errors: ['manifest must be an object'] };
  const errors = [];
  for (const k of Object.keys(obj)) if (!KEYS.includes(k)) errors.push(`unknown key: ${k}`);
  if (typeof obj.name !== 'string' || !/^[a-z0-9][a-z0-9-]*$/.test(obj.name)) errors.push('name: lowercase letters, digits and dashes');
  if (typeof obj.version !== 'string' || !SEMVER.test(obj.version)) errors.push('version: exact semver required');
  if (typeof obj.main !== 'string' || !obj.main) errors.push('main: relative path required');
  else {
    const p = path.posix.normalize(obj.main.replaceAll('\\', '/'));
    // backslashes are treated as separators so a Windows-style ../ cannot slip through
    if (path.isAbsolute(obj.main) || /^[a-zA-Z]:/.test(obj.main) || p === '..' || p.startsWith('../')) errors.push('main: must stay inside the plugin folder');
  }
  if (obj.activation !== undefined && !(isStrArray(obj.activation) && obj.activation.every((a) => ACTIVATION.test(a)))) errors.push('activation: entries must be onStart, onCommand:<n>, onWorkflow:<n> or onEvent:<t>');
  if (obj.permissions !== undefined && !(isStrArray(obj.permissions) && obj.permissions.every((p) => PERMS.includes(p)))) errors.push(`permissions: known values only (${PERMS.join(', ')})`);
  const c = obj.contributes;
  if (c !== undefined) {
    if (!c || typeof c !== 'object' || Array.isArray(c)) errors.push('contributes: must be an object');
    else for (const [k, v] of Object.entries(c)) {
      if (!KINDS.includes(k)) errors.push(`contributes.${k}: unknown kind`);
      else if (!isStrArray(v)) errors.push(`contributes.${k}: must be an array of strings`);
    }
  }
  return { ok: errors.length === 0, errors };
}

export function createPluginHost({ dirs, bus, grant, clock } = {}) {
  if (!isStrArray(dirs)) throw new TypeError('dirs: expected an array of folder paths');
  assertShape('bus', bus, ['on', 'emit']);
  assertShape('clock', clock, ['now']);
  if (typeof grant !== 'function') throw new TypeError('grant: expected a function');

  const found = new Map(); // name -> {name, version, dir, valid, errors, manifest}
  const state = new Map(); // name -> {state, error?, at?, mod?, regs}
  const registry = new Map(KINDS.map((k) => [k, new Map()]));
  const kindOf = (kind) => registry.get(kind) ?? assert(false, `unknown kind: ${kind}`);
  function assert(ok, msg) { if (!ok) throw new TypeError(msg); }
  const st = (name) => state.get(name) ?? { state: 'inactive', regs: [] };

  function release(name) {
    const s = st(name);
    for (const [kind, id] of s.regs) registry.get(kind).delete(id);
    s.regs = [];
  }

  async function discover() {
    found.clear();
    const out = [];
    for (const root of dirs) {
      let entries = [];
      try { entries = await fs.readdir(root, { withFileTypes: true }); } catch { continue; }
      for (const e of entries.filter((x) => x.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) {
        const dir = path.join(root, e.name);
        let manifest, errors;
        try { manifest = JSON.parse(await fs.readFile(path.join(dir, 'plugin.json'), 'utf8')); }
        catch (err) { if (err.code === 'ENOENT') continue; errors = [`plugin.json: ${err.message}`]; }
        errors ??= validateManifest(manifest).errors;
        const name = typeof manifest?.name === 'string' ? manifest.name : e.name;
        if (found.has(name)) errors = [...errors, `duplicate name: ${name}`];
        const rec = { name, version: manifest?.version, dir, valid: errors.length === 0, errors };
        if (rec.valid) found.set(name, { ...rec, manifest });
        else if (!found.has(name)) found.set(name, { ...rec, manifest });
        out.push(rec);
      }
    }
    // a name that only exists as invalid must not be activatable
    return out;
  }

  async function activate(name) {
    assert(typeof name === 'string', 'name: expected a string');
    const rec = found.get(name);
    assert(rec, `unknown plugin: ${name}`);
    assert(rec.valid, `invalid plugin ${name}: ${rec.errors.join('; ')}`);
    if (st(name).state === 'active') return;
    const s = { state: 'inactive', regs: [] };
    state.set(name, s);
    const { manifest } = rec;
    try {
      const perms = manifest.permissions ?? [];
      for (const p of perms) if (!grant(name, p)) throw new Error(`permission refused: ${p}`);
      const mainPath = path.resolve(rec.dir, manifest.main);
      const rel = path.relative(rec.dir, mainPath);
      if (rel.startsWith('..') || path.isAbsolute(rel)) throw new Error('main escapes the plugin folder');
      s.mod = await import(pathToFileURL(mainPath).href);
      if (typeof s.mod.activate !== 'function') throw new Error('main must export activate(ctx)');
      const contributes = manifest.contributes ?? {};
      const ctx = {
        name, bus, clock,
        has: (p) => perms.includes(p),
        register(kind, id, impl) {
          const reg = kindOf(kind);
          if (!(contributes[kind] ?? []).includes(id)) throw new TypeError(`${name} did not declare ${kind}:${id} in contributes`);
          const full = `${name}:${id}`;
          reg.set(full, impl);
          s.regs.push([kind, full]);
        },
      };
      await s.mod.activate(ctx);
      s.state = 'active';
      s.at = clock.now();
      bus.emit('plugin.activated', { name });
    } catch (err) {
      release(name);
      s.state = 'failed';
      s.error = err.message;
      bus.emit('plugin.failed', { name, error: err.message });
      throw err;
    }
  }

  async function deactivate(name) {
    const s = st(name);
    try { if (s.state === 'active') await s.mod.deactivate?.(); }
    finally { release(name); state.set(name, { state: 'inactive', regs: [] }); }
  }

  async function fire(event) {
    assert(typeof event === 'string' && event, 'event: expected a non-empty string');
    const done = [];
    for (const [name, rec] of found) {
      if (!rec.valid || st(name).state !== 'inactive' || !(rec.manifest.activation ?? []).includes(event)) continue;
      try { await activate(name); done.push(name); } catch { /* failure is recorded in status and on the bus */ }
    }
    return done;
  }

  return {
    discover, activate, deactivate, fire,
    get: (kind, fullId) => kindOf(kind).get(fullId),
    list: (kind) => [...kindOf(kind)].map(([id, impl]) => ({ id, impl })),
    status: (name) => { const { state: s, error, at } = st(name); return { state: s, error, at }; },
  };
}
