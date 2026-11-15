import { isDeepStrictEqual } from 'node:util';
import { assertShape } from '../contract.mjs';

const typeOk = {
  object: (v) => v !== null && typeof v === 'object' && !Array.isArray(v),
  array: Array.isArray,
  string: (v) => typeof v === 'string',
  number: (v) => typeof v === 'number' && Number.isFinite(v),
  integer: Number.isInteger,
  boolean: (v) => typeof v === 'boolean',
  null: (v) => v === null,
};

// Minimal JSON Schema: type, enum, properties, required, items, additionalProperties:false.
function validate(schema, v, path) {
  const bad = (m) => { throw new TypeError(`${path}: ${m}`); };
  if (schema.type && !(typeOk[schema.type] ?? (() => false))(v)) bad(`expected ${schema.type}`);
  if (schema.enum && !schema.enum.some((e) => isDeepStrictEqual(e, v))) bad('not one of the allowed values');
  if (schema.properties || schema.required || schema.additionalProperties === false) {
    if (!typeOk.object(v)) bad('expected object');
    for (const k of schema.required ?? []) if (!(k in v)) bad(`missing required property ${k}`);
    for (const [k, x] of Object.entries(v)) {
      const sub = schema.properties?.[k];
      if (sub) validate(sub, x, path === '$' ? k : `${path}.${k}`);
      else if (schema.additionalProperties === false) throw new TypeError(`${path === '$' ? k : `${path}.${k}`}: property not allowed`);
    }
  }
  if (schema.items) {
    if (!Array.isArray(v)) bad('expected array');
    v.forEach((x, i) => validate(schema.items, x, `${path}[${i}]`));
  }
}

const matches = (sel, id) => sel === '*' || sel === id || (sel.endsWith(':') && id.startsWith(sel));

export function createSlots({ bus, clock } = {}) {
  if (bus !== undefined) assertShape('bus', bus, ['on', 'emit']);
  if (clock !== undefined) assertShape('clock', clock, ['now']);
  const slots = new Map(); // id -> {def, value, version}
  const subs = new Set();

  const notify = (id, value, version) => {
    for (const s of [...subs]) if (matches(s.sel, id)) { try { s.fn(id, value, version); } catch { /* a bad listener must not break writers */ } }
    try { bus?.emit('slot.change', { id, version }); } catch { /* same */ }
  };

  function define(def, initial) {
    if (!def || typeof def.id !== 'string' || !/^[^:]+(:[^:]+)+$/.test(def.id)) throw new TypeError('slot id must look like "<namespace>:<name>"');
    if (typeof def.title !== 'string') throw new TypeError(`${def.id}: title must be a string`);
    if (!def.schema || typeof def.schema !== 'object') throw new TypeError(`${def.id}: schema must be an object`);
    if (def.sensitivity !== undefined && !['public', 'user', 'secret'].includes(def.sensitivity)) throw new TypeError(`${def.id}: bad sensitivity`);
    if (slots.has(def.id)) throw new TypeError(`${def.id}: already defined`);
    validate(def.schema, initial, '$');
    const slot = { def: { ...def }, value: structuredClone(initial), version: 1 };
    slots.set(def.id, slot);
    notify(def.id, slot.value, 1);
    const live = () => { if (slots.get(def.id) !== slot) throw new TypeError(`${def.id}: slot was removed`); };
    const set = (value) => {
      live();
      validate(def.schema, value, '$');
      if (isDeepStrictEqual(slot.value, value)) return;
      slot.value = structuredClone(value);
      slot.version += 1;
      notify(def.id, slot.value, slot.version);
    };
    return {
      set,
      patch(partial) {
        live();
        if (!typeOk.object(partial) || !typeOk.object(slot.value)) throw new TypeError(`${def.id}: patch needs object values`);
        set({ ...slot.value, ...partial });
      },
      remove() {
        live();
        notify(def.id, undefined, slot.version + 1); // before delete so readers can still look up sensitivity
        slots.delete(def.id);
      },
    };
  }

  function applyRemote(msg) {
    if (!msg || typeof msg.id !== 'string' || !Number.isInteger(msg.version) || !('value' in msg)) throw new TypeError('applyRemote: expected {id, version, value}');
    const cur = slots.get(msg.id);
    if (cur && cur.version >= msg.version) return false; // stale or duplicate
    const slot = cur ?? { def: { id: msg.id, title: msg.id, schema: {} }, value: undefined, version: 0 };
    slot.value = structuredClone(msg.value);
    slot.version = msg.version;
    slots.set(msg.id, slot);
    notify(msg.id, slot.value, slot.version);
    return true;
  }

  return {
    define,
    applyRemote,
    read: (id) => { const s = slots.get(id); return s && { value: s.value, version: s.version }; },
    subscribe(sel, fn) {
      if (typeof sel !== 'string' || typeof fn !== 'function') throw new TypeError('subscribe(idOrPrefix, fn)');
      const sub = { sel, fn };
      subs.add(sub);
      for (const [id, s] of slots) if (matches(sel, id)) fn(id, s.value, s.version);
      return () => subs.delete(sub);
    },
    catalog: () => [...slots.values()].map((s) => ({ ...s.def })),
    // Secret slots never go into a transport snapshot.
    toSnapshot: () => [...slots.values()].filter((s) => s.def.sensitivity !== 'secret').map((s) => ({ id: s.def.id, version: s.version, value: s.value })),
  };
}

const deepFreeze = (v) => {
  if (v && typeof v === 'object') { Object.values(v).forEach(deepFreeze); Object.freeze(v); }
  return v;
};

export function createReader(slots, { allow } = {}) {
  assertShape('slots', slots, ['read', 'subscribe', 'catalog']);
  const defs = () => new Map(slots.catalog().map((d) => [d.id, d]));
  const visible = (id) => {
    const d = defs().get(id);
    return !!d && d.sensitivity !== 'secret' && (!allow || allow.some((p) => matches(p, id)));
  };
  const out = (v) => deepFreeze(structuredClone(v));
  return {
    read(id) {
      const r = visible(id) && slots.read(id);
      return r ? { value: out(r.value), version: r.version } : undefined;
    },
    subscribe: (sel, fn) => slots.subscribe(sel, (id, v, ver) => { if (visible(id)) fn(id, out(v), ver); }),
    catalog: () => slots.catalog().filter((d) => visible(d.id)),
  };
}

const handles = new WeakMap(); // slots -> {id -> handle}; only the definer may write, so projections share handles

export function projectJournal(slots, { runId }) {
  if (typeof runId !== 'string' || !runId) throw new TypeError('runId must be a non-empty string');
  const own = handles.get(slots) ?? handles.set(slots, {}).get(slots);
  const get = (id, title, schema, initial) => own[id] ??= slots.define({ id, title, schema }, initial);
  const list = get('runs:list', 'Runs', { type: 'array', items: { type: 'object' } }, []);
  const tl = get(`run:${runId}:timeline`, `Timeline ${runId}`, { type: 'array', items: { type: 'object' } }, []);
  const bd = get(`run:${runId}:budget`, `Budget ${runId}`, { type: 'object', required: ['total', 'steps'] }, { total: 0, steps: {} });
  const stateOf = { 'step.start': 'running', 'step.result': 'done', 'step.error': 'failed' };
  let lastSeq = 0;
  const timeline = [];
  const budget = { total: 0, steps: {} };
  return function observe(e) {
    if (!e || e.runId !== runId || !(e.seq > lastSeq)) return; // other run, or duplicate/out-of-order
    lastSeq = e.seq;
    timeline.push({ seq: e.seq, ts: e.ts, type: e.type, stepKey: e.stepKey, label: e.data?.label ?? e.stepKey ?? e.type, state: stateOf[e.type] ?? 'info' });
    tl.set(timeline);
    const u = e.data?.usage;
    if (u) {
      const n = (u.inputTokens ?? 0) + (u.outputTokens ?? 0);
      budget.total += n;
      if (e.stepKey) budget.steps[e.stepKey] = (budget.steps[e.stepKey] ?? 0) + n;
      bd.set(budget);
    }
    const cur = slots.read('runs:list').value;
    const state = e.type === 'run.end' ? (e.data?.ok === false || e.data?.error ? 'failed' : 'ended') : 'running';
    const row = { runId, state: e.type === 'run.end' ? state : (cur.find((r) => r.runId === runId)?.state ?? 'running'), lastActivity: e.ts };
    list.set(cur.some((r) => r.runId === runId) ? cur.map((r) => (r.runId === runId ? row : r)) : [...cur, row]);
  };
}
