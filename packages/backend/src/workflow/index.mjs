import { AsyncLocalStorage } from 'node:async_hooks';
import { createHash } from 'node:crypto';
import { assertShape } from '../contract.mjs';

export class BudgetError extends Error { constructor(reason) { super(`budget refused: ${reason}`); this.name = 'BudgetError'; } }
export class GateError extends Error { constructor(name, code) { super(`gate "${name}" failed with exit code ${code}`); this.name = 'GateError'; } }
export class ApprovalDenied extends Error { constructor(name) { super(`approval "${name}" denied`); this.name = 'ApprovalDenied'; } }
class ConfigError extends Error { constructor(m) { super(m); this.name = 'ConfigError'; } }
class Cancelled extends Error { constructor() { super('cancelled'); this.name = 'Cancelled'; } }

const hash = (v) => createHash('sha1').update(JSON.stringify(v)).digest('hex').slice(0, 12);
// refusals, failed gates, denied approvals, bad config and cancellation end the run, never become a null branch
const fatal = (e) => [BudgetError, GateError, ApprovalDenied, ConfigError, Cancelled].some((C) => e instanceof C);

export function createEngine({ journalFor, runners, budget, bus, clock, approve, exec, decide } = {}) {
  if (typeof journalFor !== 'function') throw new TypeError('journalFor: expected a function');
  assertShape('runners', runners, ['get']);
  assertShape('budget', budget, ['check', 'record']);
  assertShape('bus', bus, ['emit']);
  assertShape('clock', clock, ['now']);
  if (typeof approve !== 'function') throw new TypeError('approve: expected a function');
  if (exec !== undefined && typeof exec !== 'function') throw new TypeError('exec: expected a function');
  if (decide !== undefined && typeof decide !== 'function') throw new TypeError('decide: expected a function');

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
    const note = (type, data, stepKey) => { bus.emit(type, data); return journal.append(stepKey ? { type, stepKey, data } : { type, data }); };
    // a decision failure never breaks a step: null means "use today's behaviour"
    const ask = async (point, input, stepPath) => { if (!decide) return null; try { return (await decide(point, input, { runId, stepPath })) ?? null; } catch { return null; } };
    const outcome = (d, ok) => { try { if (d?.decisionId) decide?.recordOutcome?.(d.decisionId, { ok }); } catch { /* never breaks a step */ } };
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
        // journals older than the {value, usage} shape hold the bare value
        if (hit.hit) return hit.value && typeof hit.value === 'object' && 'value' in hit.value ? hit.value.value : hit.value;
        // model.select fills only what the caller left unset; explicit opts always win
        let model = opts.model, rname = opts.runner;
        const sel = (!opts.model && !opts.runner) ? await ask('model.select', { kind: 'agent', promptTokens: Math.ceil(prompt.length / 4), stepPath: s.path }, s.path) : null;
        if (sel) { if (sel.model && sel.model !== 'default') model = sel.model; if (sel.runner && sel.runner !== 'default') rname = sel.runner; }
        const name = rname || 'default';
        let runner;
        try { runner = runners.get(name); } catch (e) { if (rname === opts.runner) throw new ConfigError(`agent: runner "${name}" unavailable: ${e.message}`); }
        if (!runner && rname !== opts.runner) { try { runner = runners.get('default'); model = opts.model; } catch { /* reported below */ } } // a selected runner that is missing falls back
        if (!runner) throw new ConfigError(`agent: unknown runner "${name}"`);
        const tags = { runId, label: opts.label };
        const est = opts.estimateTokens ?? 20000;
        // reserve holds the estimate so parallel agents cannot all pass the same check
        const rsv = budget.reserve ? budget.reserve(est, tags) : budget.check(est, tags);
        if (!rsv.allow) { await journal.append({ type: 'budget', stepKey: key, data: { reason: rsv.reason } }); throw new BudgetError(rsv.reason); }
        let settled = false, esc = null;
        // a failed agent step is journaled as step.error, so it re-runs on resume (only step.result replays)
        let out;
        try {
          out = await memo(key, async () => {
            let res = await runner.run({ prompt, model, label: opts.label, schema: opts.schema, cwd: opts.cwd, signal });
            let usage = res.usage;
            if (!res.ok && !signal?.aborted) {
              esc = await ask('model.escalate', { attempt: 1, failure: String(res.error || 'agent failed'), tried: model ? [model] : [] }, s.path);
              if (esc?.escalate && esc.model && esc.model !== model) {
                res = await runner.run({ prompt, model: esc.model, label: opts.label, schema: opts.schema, cwd: opts.cwd, signal });
                if (res.usage) usage = usage ? { inputTokens: (usage.inputTokens ?? 0) + (res.usage.inputTokens ?? 0), outputTokens: (usage.outputTokens ?? 0) + (res.usage.outputTokens ?? 0) } : res.usage;
              }
            }
            settled = true;
            if (budget.reserve) rsv.settle(usage ?? { inputTokens: 0, outputTokens: 0 }); else if (usage) budget.record(usage, tags);
            live();
            if (!res.ok) throw new Error(res.error || 'agent failed');
            return { value: res.value !== undefined ? res.value : res.text ?? '', usage: res.usage };
          }).finally(() => { if (!settled) rsv.release?.(); });
        } catch (e) { outcome(sel, false); outcome(esc, false); throw e; }
        outcome(sel, true); outcome(esc, true);
        return out.value;
      },

      async exec(command, args = [], opts = {}) {
        if (typeof exec !== 'function') throw new TypeError('exec: no exec function was injected');
        if (typeof command !== 'string' || !command) throw new TypeError('exec: command must be a non-empty string');
        if (!Array.isArray(args)) throw new TypeError('exec: args must be an array');
        live();
        const { s, idx } = next();
        const key = `${s.path}#${idx}:exec:${hash([command, args])}`;
        return memo(key, async () => {
          const r = await exec(command, args, opts);
          await journal.append({ type: 'exec', stepKey: key, data: { command, args, code: r.code, timedOut: !!r.timedOut } });
          return r;
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
        // the denial is memoized too: resume fails the same way without asking again
        // a deny only tightens: allow, ask and a failed decision all fall through to the real approve
        const verdict = await ask('action.approve', { tool: 'workflow', action: 'approval', target: String(name) }, s.path);
        const r = await memo(key, async () => {
          await journal.append({ type: 'approval', stepKey: key, data: { name } }); // asked, no answer yet
          const approved = verdict?.decision === 'deny' ? false : !!(await approve({ name, details }));
          await note('approval', { name, approved }, key);
          return { approved };
        });
        if (!r.approved) throw new ApprovalDenied(name);
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
