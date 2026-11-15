import { randomUUID } from 'node:crypto';

// Spec facts (openapi.yaml): bearer auth; 429/503 carry Retry-After seconds; Idempotency-Key is
// defined only for POST /vms and POST /vms/{id}/fork, so checkpoint, rewind and exec send none.
// Unclear in the spec: sort/limit defaults are server-side; usage() sends no period (server default).
export class BoxError extends Error {
  constructor(status, code, message) { super(message); this.name = 'BoxError'; this.status = status; this.code = code; }
}

const str = (name, v) => { if (typeof v !== 'string' || !v) throw new TypeError(`${name}: expected a non-empty string`); return v; };
const NAME = /^[a-z0-9][a-z0-9-]{0,39}$/;
const MAX_RETRIES = 3;

export function createBoxes({ baseUrl, token, fetch: doFetch, clock } = {}) {
  str('baseUrl', baseUrl); str('token', token);
  if (typeof doFetch !== 'function') throw new TypeError('fetch: expected a function');
  if (!clock || typeof clock.now !== 'function') throw new TypeError('clock: expected an object with now()');
  const base = baseUrl.replace(/\/+$/, '');
  const sleep = (ms) => (clock.sleep ? clock.sleep(ms) : new Promise((r) => setTimeout(r, ms)));
  const scrub = (s) => String(s).split(token).join('[token]');

  async function call(method, path, { json, raw, headers = {}, idem } = {}) {
    const h = { authorization: `Bearer ${token}`, accept: 'application/json', ...headers };
    if (json !== undefined) h['content-type'] = 'application/json';
    if (idem) h['idempotency-key'] = randomUUID(); // one key across retries so the server dedupes
    const init = { method, headers: h, body: json !== undefined ? JSON.stringify(json) : raw };
    for (let n = 0; ; n++) {
      let res;
      try { res = await doFetch(base + path, init); } catch (e) { throw new BoxError(0, 'network_error', scrub(e?.message ?? e)); }
      const text = await res.text();
      if (res.status < 300) return text ? JSON.parse(text) : undefined;
      if ((res.status === 429 || res.status === 503) && n < MAX_RETRIES) {
        const ra = Number(res.headers.get('retry-after'));
        await sleep(ra > 0 ? ra * 1000 : 500 * 2 ** n);
        continue;
      }
      let e; try { e = JSON.parse(text).error; } catch { /* non-JSON error body */ }
      throw new BoxError(res.status, e?.code ?? 'http_error', scrub(e?.message ?? `HTTP ${res.status}`));
    }
  }
  const vm = (id) => `/vms/${encodeURIComponent(str('id', id))}`;

  const api = {
    list: async () => (await call('GET', '/vms')).data,
    create: ({ size, name } = {}) => {
      if (name !== undefined && !NAME.test(name)) throw new TypeError('name: lowercase letters, digits and dashes, up to 40');
      return call('POST', '/vms', { json: { ...(size && { size }), ...(name && { name }) }, idem: true });
    },
    get: (id) => call('GET', vm(id)),
    destroy: async (id) => { await call('DELETE', vm(id)); },
    async exec(id, command, { timeoutMs } = {}) {
      str('command', command);
      const json = { command, ...(timeoutMs && { timeout_s: Math.min(600, Math.max(1, Math.ceil(timeoutMs / 1000))) }) };
      const r = await call('POST', `${vm(id)}/exec`, { json });
      return { code: r.exit_code, stdout: r.stdout, stderr: r.stderr, timedOut: r.timed_out };
    },
    logs: (id, { cursor } = {}) => call('GET', `${vm(id)}/logs${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`),
    checkpoint: (id, { name } = {}) => call('POST', `${vm(id)}/checkpoints`, { json: name ? { name } : {} }),
    checkpoints: async (id) => (await call('GET', `${vm(id)}/checkpoints`)).data,
    rewind: (id, checkpointId) => call('POST', `${vm(id)}/rewind`, { json: { checkpoint: str('checkpointId', checkpointId) } }),
    fork: (id, { checkpointId } = {}) => call('POST', `${vm(id)}/fork`, { json: checkpointId ? { checkpoint: checkpointId } : {}, idem: true }),
    importRepo({ source, upload, name, dryRun, env } = {}) {
      if (upload === undefined) return call('POST', '/imports', { json: { source: str('source', source), ...(name && { name }), ...(dryRun && { dry_run: true }), ...(env && { env }) } });
      const q = [name && `name=${encodeURIComponent(name)}`, dryRun && 'dry_run=true'].filter(Boolean).join('&');
      const headers = { 'content-type': 'application/gzip', ...(env && { 'x-suffice-env': encodeURIComponent(JSON.stringify(env)) }) };
      return call('POST', `/imports${q ? `?${q}` : ''}`, { raw: upload, headers });
    },
    preview: async (id) => (await call('GET', `${vm(id)}/urls`)).data,
    usage: () => call('GET', '/usage'),
  };
  // async wrappers so validation TypeErrors reject instead of throwing synchronously
  return Object.fromEntries(Object.entries(api).map(([k, f]) => [k, async (...a) => f(...a)]));
}

export const manifest = {
  name: 'boxes',
  version: '0.1.0',
  main: 'index.mjs',
  permissions: ['net', 'secrets'],
  contributes: {
    tools: ['box.create', 'box.exec', 'box.checkpoint', 'box.rewind', 'box.fork', 'box.destroy'],
    runners: ['box'],
  },
};

// ctx.boxes is injected in tests; otherwise built from ctx.config {baseUrl, token, fetch}.
export async function activate(ctx) {
  const boxes = ctx.boxes ?? createBoxes({ clock: ctx.clock, ...ctx.config });
  const reg = (id, fn) => ctx.register('tools', id, fn);
  reg('box.create', (a) => boxes.create(a));
  reg('box.exec', (a) => boxes.exec(a.id, a.command, a));
  reg('box.checkpoint', (a) => boxes.checkpoint(a.id, a));
  reg('box.rewind', (a) => boxes.rewind(a.id, a.checkpointId));
  reg('box.fork', (a) => boxes.fork(a.id, a));
  reg('box.destroy', (a) => boxes.destroy(a.id));
  ctx.register('runners', 'box', {
    // the prompt is the shell command; the box id comes from req.box or config
    async run(req) {
      const t = Date.now();
      try {
        const r = await boxes.exec(req.box ?? ctx.config?.box, req.prompt);
        return { ok: r.code === 0 && !r.timedOut, text: r.stdout, ...(r.code !== 0 && { error: r.stderr || `exit ${r.code}` }), usage: { inputTokens: 0, outputTokens: 0 }, ms: Date.now() - t };
      } catch (e) {
        return { ok: false, error: e.message, usage: { inputTokens: 0, outputTokens: 0 }, ms: Date.now() - t };
      }
    },
  });
}

// Wraps list/checkpoint/checkpoints on `boxes` in place so the slots follow the data.
export function defineBoxSlots(slots, boxes) {
  const list = slots.define({ id: 'boxes:list', title: 'Cloud boxes', schema: { type: 'array', items: { type: 'object' } } }, []);
  const cks = new Map();
  const ckSlot = (id) => {
    if (!cks.has(id)) cks.set(id, { value: [], h: slots.define({ id: `box:${id}:checkpoints`, title: 'Box checkpoints', schema: { type: 'array', items: { type: 'object' } }, actions: ['box.rewind', 'box.fork'] }, []) });
    return cks.get(id);
  };
  const { list: l, checkpoint: c, checkpoints: cs } = boxes;
  boxes.list = async (...a) => { const v = await l(...a); list.set(v); return v; };
  boxes.checkpoints = async (id, ...a) => { const v = await cs(id, ...a); const s = ckSlot(id); s.value = v; s.h.set(v); return v; };
  boxes.checkpoint = async (id, ...a) => { const v = await c(id, ...a); const s = ckSlot(id); s.value = [...s.value, v]; s.h.set(s.value); return v; };
  return boxes;
}
