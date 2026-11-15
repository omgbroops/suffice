import { AsyncLocalStorage } from 'node:async_hooks';
import { createHash } from 'node:crypto';
import { assertShape } from '../contract.mjs';

export class BudgetError extends Error { constructor(reason) { super(`budget refused: ${reason}`); this.name = 'BudgetError'; } }
export class GateError extends Error { constructor(name, code) { super(`gate "${name}" failed with exit code ${code}`); this.name = 'GateError'; } }
export class ApprovalDenied extends Error { constructor(name) { super(`approval "${name}" denied`); this.name = 'ApprovalDenied'; } }
class Cancelled extends Error { constructor() { super('cancelled'); this.name = 'Cancelled'; } }

const hash = (v) => createHash('sha1').update(JSON.stringify(v)).digest('hex').slice(0, 12);
// budget refusal and cancellation must end the run, never become a null branch
const fatal = (e) => e instanceof BudgetError || e instanceof Cancelled;

export function createEngine({ journalFor, runners, budget, bus, clock, approve } = {}) {
  if (typeof journalFor !== 'function') throw new TypeError('journalFor: expected a function');
  assertShape('runners', runners, ['get']);
  assertShape('budget', budget, ['check', 'record']);
  assertShape('bus', bus, ['emit']);
  assertShape('clock', clock, ['now']);
  if (typeof approve !== 'function') throw new TypeError('approve: expected a function');

  // scope = position in the call tree: {path, n: call counter, chain: hash of prior steps in this branch}
  const als = new AsyncLocalStorage();

  async function run(runId, workflowFn, args, { signal } = {}) {
    if (typeof runId !== 'string' || !runId) throw new TypeError('runId: expected a non-empty string');
    if (typeof workflowFn !== 'function') throw new TypeError('workflowFn: expected a function');
    const journal = journalFor(runId);
    const live = () => { if (signal?.aborted) throw new Cancelled(); };

    // memoize fn under key: replay a finished step, else run and record it
    async function memo(key, fn) {
      const hit = await journal.lookup(key);
      if (hit.hit) return hit.value;
      await journal.append({ type: 'step.start', stepKey: key });
      try {
        const value = await fn();
        await journal.append({ type: 'step.result', stepKey: key, data: value });
        return value;
      } catch (e) {
        await journal.append({ type: 'step.error', stepKey: key, data: { message: e.message } });
        throw e;
      }
    }
    const note = (type, data) => { bus.emit(type, data); return journal.append({ type, data }); };
    const next = () => { const s = als.getStore(); return { s, idx: s.n++ }; };
    const child = (s, tag) => ({ path: `${s.path}/${tag}`, n: 0, chain: s.chain });

    const api = {
      async agent(prompt, opts = {}) {
        if (typeof prompt !== 'string') throw new TypeError('agent: prompt must be a string');
        live();
        const { s, idx } = next();
        let key;
        if (opts.key) key = `${s.path}/${opts.key}`;
        else {
          const h = hash([s.chain, idx, prompt, opts.label, opts.model, opts.runner, opts.schema]);
          s.chain = h; // later steps in this branch depend on this one
          key = `${s.path}#${idx}:${h}`;
        }
        const hit = await journal.lookup(key);
        if (hit.hit) return hit.value;
        const d = budget.check(opts.estimateTokens ?? 20000, { label: opts.label });
        if (!d.allow) { await journal.append({ type: 'budget', stepKey: key, data: { reason: d.reason } }); throw new BudgetError(d.reason); }
        const runner = runners.get(opts.runner || 'default');
        if (!runner) throw new TypeError(`agent: unknown runner "${opts.runner || 'default'}"`);
        return memo(key, async () => {
          const res = await runner.run({ prompt, model: opts.model, label: opts.label, schema: opts.schema, cwd: opts.cwd, signal });
          if (res.usage) budget.record(res.usage, { label: opts.label });
          live();
          if (!res.ok) throw new Error(res.error || 'agent failed');
          return res.value !== undefined ? res.value : res.text ?? '';
        });
      },

      async parallel(thunks, { limit = Infinity } = {}) {
        if (!Array.isArray(thunks)) throw new TypeError('parallel: thunks must be an array');
        if (!(limit >= 1)) throw new TypeError('parallel: limit must be >= 1');
        const { s, idx } = next();
        const out = new Array(thunks.length).fill(null);
        let i = 0, stop = null;
        const worker = async () => {
          while (i < thunks.length && !stop) {
            const k = i++;
            live();
            await als.run(child(s, `p${idx}.${k}`), async () => {
              try { out[k] = await thunks[k](); } catch (e) { if (fatal(e)) stop = stop || e; }
            });
          }
        };
        await Promise.all(Array.from({ length: Math.min(limit, thunks.length) }, worker));
        if (stop) throw stop;
        return out;
      },

      async pipeline(items, ...stages) {
        if (!Array.isArray(items)) throw new TypeError('pipeline: items must be an array');
        const { s, idx } = next();
        return Promise.all(items.map((item, i) => als.run(child(s, `l${idx}.${i}`), async () => {
          try {
            let prev = item;
            for (const st of stages) { live(); prev = await st(prev, item, i); }
            return prev;
          } catch (e) { if (fatal(e)) throw e; return null; }
        })));
      },

      async gate(name, r) {
        const ok = r?.code === 0; // exit code only, never output text
        await journal.append({ type: 'gate', data: { name, code: r?.code, ok } });
        if (!ok) throw new GateError(name, r?.code);
      },

      async approval(name, details) {
        live();
        const { s, idx } = next();
        const key = `${s.path}#${idx}:approval:${name}`;
        await memo(key, async () => {
          if (!(await approve({ name, details }))) { await note('approval', { name, approved: false }); throw new ApprovalDenied(name); }
          await note('approval', { name, approved: true });
          return true;
        });
      },

      phase: (title) => note('phase', { title }),
      log: (message) => note('log', { message }),
    };

    let abortP = null;
    if (signal) abortP = new Promise((_, rej) => { if (signal.aborted) rej(new Cancelled()); else signal.addEventListener('abort', () => rej(new Cancelled()), { once: true }); });
    let out;
    await journal.append({ type: 'run.start', data: { at: clock.now() } });
    try {
      const work = als.run({ path: '', n: 0, chain: '' }, () => workflowFn(api, args));
      if (abortP) work.catch?.(() => {}); // the race below owns the rejection
      out = { ok: true, value: await (abortP ? Promise.race([work, abortP]) : work) };
    } catch (e) {
      out = signal?.aborted ? { ok: false, cancelled: true } : { ok: false, error: e.message };
    }
    await journal.append({ type: 'run.end', data: { ok: out.ok, cancelled: !!out.cancelled, at: clock.now() } });
    return out;
  }

  return { run };
}
