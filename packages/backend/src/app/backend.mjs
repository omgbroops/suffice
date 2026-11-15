// Composition root: journal + bus + slots + budget + watchdog + runners + plugins + workflow engine.
import fs from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createJournal, createBus, listRuns } from '../journal/index.mjs';
import { createSlots, createReader, projectJournal } from '../slots/index.mjs';
import { createBudget, createFileStore } from '../budget/index.mjs';
import { createDecider } from '../decide/index.mjs';
import { createDatasetFile } from '../decide/dataset.mjs';
import { createWatchdog } from '../watchdog/index.mjs';
import { createRunnerRegistry } from '../runner/index.mjs';
import { createPluginHost } from '../plugins/index.mjs';
import { createHandoff } from '../board/index.mjs';
import { createEngine } from '../workflow/index.mjs';
import { createPiRunner } from './pi-runner.mjs';
import { workflows } from './workflows.mjs';

const BUILTINS = fileURLToPath(new URL('../builtins', import.meta.url));
// generous: only a real stall or loop should trip these
const THRESHOLDS = { stallMs: 600000, loopRepeats: 5, noProgressSteps: 50, tokensPerStep: 500000 };

export function createBackend({ dataDir, clock = { now: () => Date.now() }, createSession, exec, approve = async () => false, runners = {}, limits = [] } = {}) {
  if (typeof dataDir !== 'string' || !dataDir) throw new TypeError('createBackend: dataDir must be a non-empty string');
  const runsDir = path.join(dataDir, 'runs');
  fs.mkdirSync(runsDir, { recursive: true });

  const bus = createBus();
  const slots = createSlots({ bus, clock });
  const reader = createReader(slots);
  const budget = createBudget({ clock, store: createFileStore(path.join(dataDir, 'budget.json')), limits });
  const handoff = createHandoff({ dir: path.join(dataDir, 'handoff'), clock });
  const registry = createRunnerRegistry({ clock });
  for (const [name, r] of Object.entries(runners)) registry.register(name, r);
  if (createSession && !registry.names().includes('pi')) registry.register('pi', createPiRunner({ createSession, clock }));

  const dec = createDecider({ runners: registry, ask: async () => undefined, clock, bus, store: createDatasetFile({ dir: path.join(dataDir, 'decide') }) });
  const statsSlot = slots.define({ id: 'decide:stats', title: 'Decision stats', schema: { type: 'object' } }, dec.stats());
  const decide = Object.assign(async (point, input, ctx) => { try { return await dec.decide(point, input, ctx); } finally { try { statsSlot.set(dec.stats()); } catch { /* display only */ } } }, dec);
  decide.decide = decide;
  const watchdog = createWatchdog({ clock, bus, thresholds: THRESHOLDS, decide });
  // layers: one JSON file each; a bad file is reported and ignored, never fatal
  const cfgErrors = {};
  const layerCfg = { builtin: { router: 'balanced' } };
  for (const n of ['org', 'user', 'project']) {
    const f = path.join(dataDir, 'decide', `${n}.json`);
    let raw; try { raw = fs.readFileSync(f, 'utf8'); } catch { continue; }
    try { const c = JSON.parse(raw); const v = dec.validateConfig({ [n]: c }); if (!v.ok) throw new Error(v.errors.join('; ')); layerCfg[n] = c; } catch (e) { cfgErrors[n] = e.message; }
  }
  try { dec.loadLayers(layerCfg); } catch (e) { cfgErrors.all = e.message; }
  slots.define({ id: 'decide:config', title: 'Decision config', schema: { type: 'object' } }, { errors: cfgErrors });

  // plugins: builtins are loose files today, so discovery may find nothing; never let that break startup
  const host = createPluginHost({ dirs: [BUILTINS], bus, grant: () => true, clock,
    onRegister: (kind, id, impl) => { if (kind === 'points') dec.definePoint(id, impl); else if (kind === 'deciders') dec.registerScript(id, impl); } });
  host.discover()
    .then((found) => Promise.all([].concat(found ?? []).filter((p) => p?.valid !== false && p?.name).map((p) => host.activate(p.name).catch(() => {}))))
    .catch(() => {});

  // one journal and one projection per run; every append also reaches the watchdog and the slots
  const journals = new Map(), projections = new Map();
  const journalFor = (runId) => {
    if (journals.has(runId)) return journals.get(runId);
    const j = createJournal({ dir: runsDir, runId, clock });
    if (!projections.has(runId)) projections.set(runId, projectJournal(slots, { runId }));
    const observe = projections.get(runId); // projectJournal returns the observe function itself
    const wrapped = {
      ...j,
      async append(e) {
        const ev = await j.append(e);
        try { watchdog.observe(ev); } catch { /* observers never break a run */ }
        try { observe(ev); } catch { /* same */ }
        return ev;
      },
    };
    journals.set(runId, wrapped);
    return wrapped;
  };

  const engine = createEngine({ journalFor, runners: registry, budget, bus, clock, approve, exec, decide });
  const active = new Map(), finished = new Map(); // runId -> {ac, done}
  const metaPath = (id) => path.join(runsDir, `${id}.meta.json`);

  const lookup = (name) => {
    if (workflows[name]) return workflows[name];
    try { return host.get('workflows', name); } catch { return undefined; }
  };

  function launch(runId, fn, args) {
    const ac = new AbortController();
    const wrapped = (api, a) => fn(api, a, { runId, handoff });
    const done = engine.run(runId, wrapped, args, { signal: ac.signal })
      .catch((e) => ({ ok: false, error: e.message })) // an engine bug becomes a failed result, never an unhandled rejection
      .finally(() => active.delete(runId));
    active.set(runId, { ac, done });
    finished.set(runId, done);
    return done;
  }

  return {
    slots,
    decide,
    reader: () => reader,
    startRun(workflow, args = {}) {
      const fn = typeof workflow === 'function' ? workflow : lookup(workflow);
      if (typeof fn !== 'function') throw new Error(`unknown workflow: ${String(workflow)}`);
      const runId = `r${Date.now().toString(36)}${randomBytes(3).toString('hex')}`;
      if (typeof workflow === 'string') fs.writeFileSync(metaPath(runId), JSON.stringify({ workflow, args }));
      launch(runId, fn, args);
      return runId;
    },
    cancelRun(id) {
      const r = active.get(id);
      if (!r) return false;
      r.ac.abort();
      return true;
    },
    async resumeRun(id) {
      if (active.has(id)) throw new Error(`run ${id} is still running`);
      let meta;
      try { meta = JSON.parse(fs.readFileSync(metaPath(id), 'utf8')); } catch { throw new Error(`no resumable run: ${id}`); }
      const fn = lookup(meta.workflow);
      if (!fn) throw new Error(`unknown workflow: ${meta.workflow}`);
      launch(id, fn, meta.args);
      return id;
    },
    wait: (id) => finished.get(id) ?? Promise.reject(new Error(`unknown run: ${id}`)),
    findings: (id) => watchdog.findings(id),
    events: (id) => journalFor(id).read(),
    async listRuns() {
      const rows = await listRuns(runsDir);
      const out = [];
      for (const r of rows) {
        let workflow = null;
        try { workflow = JSON.parse(fs.readFileSync(metaPath(r.runId), 'utf8')).workflow; } catch { /* run without meta */ }
        const end = (await journalFor(r.runId).read()).findLast((e) => e.type === 'run.end');
        const state = active.has(r.runId) ? 'running' : !end ? 'interrupted' : end.data?.ok ? 'ended' : 'failed';
        out.push({ ...r, workflow, state });
      }
      return out.sort((a, b) => (b.first ?? 0) - (a.first ?? 0) || (a.runId < b.runId ? 1 : -1));
    },
    async dispose() {
      for (const r of active.values()) r.ac.abort();
      await Promise.allSettled([...finished.values()]);
    },
  };
}
