// Composition root: journal + bus + slots + budget + watchdog + runners + plugins + workflow engine.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createJournal, createBus, listRuns } from '../journal/index.mjs';
import { createSlots, createReader, projectJournal } from '../slots/index.mjs';
import { createBudget, createFileStore } from '../budget/index.mjs';
import { createDecider } from '../decide/index.mjs';
import { createDatasetFile } from '../decide/dataset.mjs';
import { createWatchdog } from '../watchdog/index.mjs';
import { createRunnerRegistry, createExec } from '../runner/index.mjs';
import { createPluginHost } from '../plugins/index.mjs';
import { createHandoff } from '../board/index.mjs';
import { createEngine } from '../workflow/index.mjs';
import { createPiRunner } from './pi-runner.mjs';
import { workflows } from './workflows.mjs';
import { createSessions } from '../sessions/index.mjs';
import { createSessionState } from '../sessionstate/index.mjs';
import { createHistory } from '../history/index.mjs';
import { createByok } from '../byok/index.mjs';
import { createVault, createMemoryKeyring } from '../vault/index.mjs';
import { createTermBridge } from '../termbridge/index.mjs';
import { createViewRegistry } from '../views/registry.mjs';

const BUILTINS = fileURLToPath(new URL('../builtins', import.meta.url));
// generous: only a real stall or loop should trip these
const THRESHOLDS = { stallMs: 600000, loopRepeats: 5, noProgressSteps: 50, tokensPerStep: 500000 };

export function createBackend({ dataDir, clock = { now: () => Date.now() }, createSession, exec, approve = async () => false, runners = {}, limits = [], strict = false,
  sessions: withSessions = false, history: withHistory = false, byok: withByok = false, termbridge: withBridge = false,
  home, socketName, sessionAgents, sessionsExec, idleMs, settleMs, fetch, keyring, bridge: bridgeOpts = {} } = {}) {
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

  const dec = createDecider({ runners: registry, ask: async () => undefined, clock, bus, strictInputs: strict || undefined, store: createDatasetFile({ dir: path.join(dataDir, 'decide') }) });
  const statsSlot = slots.define({ id: 'decide:stats', title: 'Decision stats', schema: { type: 'object' } }, dec.stats());
  const decide = Object.assign(async (point, input, ctx) => { try { return await dec.decide(point, input, ctx); } finally { try { statsSlot.set(dec.stats()); } catch { /* display only */ } } }, dec);
  decide.decide = decide;
  const watchdog = createWatchdog({ clock, bus, thresholds: THRESHOLDS, decide, budgetStatus: () => budget.status() });
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
        try {
          // advice only: a high finding asks run.continue and publishes the answer; the run is never stopped
          if (watchdog.observe(ev).some((f) => f.severity === 'high')) advise(ev.runId).catch(() => {});
        } catch { /* observers never break a run */ }
        try { observe(ev); } catch { /* same */ }
        return ev;
      },
    };
    journals.set(runId, wrapped);
    return wrapped;
  };

  const adviceSlots = new Map();
  async function advise(runId) {
    const a = await watchdog.advise(runId);
    if (!a) return;
    if (!adviceSlots.has(runId)) adviceSlots.set(runId, slots.define({ id: `run:${runId}:advice`, title: 'Run advice', schema: { type: 'object' } }, a));
    else adviceSlots.get(runId).set(a);
  }

  const engine = createEngine({ journalFor, runners: registry, budget, bus, clock, approve, exec, decide });
  const active = new Map(), finished = new Map(); // runId -> {ac, done}
  const metaPath = (id) => path.join(runsDir, `${id}.meta.json`);

  const lookup = (name) => {
    if (workflows[name]) return workflows[name];
    try { return host.get('workflows', name); } catch { return undefined; }
  };

  // One window owns a run at a time: a lock file {pid, owner} per run. Written to a temp file and linked in, so a reader never sees a half-written lock.
  const owner = randomBytes(6).toString('hex');
  const lockPath = (id) => path.join(runsDir, `${id}.lock`);
  const alive = (pid) => { try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; } };
  const heldElsewhere = (id) => { try { const l = JSON.parse(fs.readFileSync(lockPath(id), 'utf8')); return l.owner !== owner && alive(l.pid); } catch { return false; } };
  function claim(id) {
    const tmp = `${lockPath(id)}.${owner}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify({ pid: process.pid, owner }));
    try {
      for (let i = 0; i < 3; i++) {
        try { fs.linkSync(tmp, lockPath(id)); return; } catch (e) { if (e.code !== 'EEXIST') throw e; }
        if (heldElsewhere(id)) throw new Error(`run ${id} is running in another Suffice window`);
        fs.rmSync(lockPath(id), { force: true }); // shortcut: two windows clearing the same dead lock at once can both win, upgrade to flock if that ever shows
      }
      throw new Error(`run ${id} is running in another Suffice window`);
    } finally { fs.rmSync(tmp, { force: true }); }
  }
  const release = (id) => { try { if (JSON.parse(fs.readFileSync(lockPath(id), 'utf8')).owner === owner) fs.rmSync(lockPath(id), { force: true }); } catch { /* already gone */ } };

  function launch(runId, fn, args) {
    claim(runId);
    const ac = new AbortController();
    const wrapped = (api, a) => fn(api, a, { runId, handoff });
    const done = engine.run(runId, wrapped, args, { signal: ac.signal })
      .catch((e) => ({ ok: false, error: e.message })) // an engine bug becomes a failed result, never an unhandled rejection
      .finally(() => { active.delete(runId); release(runId); });
    active.set(runId, { ac, done });
    finished.set(runId, done);
    return done;
  }

  // optional modules: each is built on its own, so one failing (tmux missing, bad home) never takes the others down
  const caps = {};
  const capSlot = slots.define({ id: 'app:capabilities', title: 'Capabilities', schema: { type: 'object' } }, caps);
  const mod = (name, on, build) => {
    if (!on) caps[name] = { ok: false, reason: 'disabled' };
    else try { const v = build(); caps[name] = { ok: true }; return v; } catch (e) { caps[name] = { ok: false, reason: e instanceof Error ? e.message : String(e) }; }
  };
  const views = {}, viewCheck = createViewRegistry();
  const addView = (name, spec) => { const v = viewCheck.validate(spec); if (v.ok) views[name] = spec; else throw new Error(`view ${name}: ${v.errors.map((x) => `${x.path} ${x.message}`).join('; ')}`); };

  const state = mod('sessions', withSessions, () => createSessionState({ clock, slots, idleMs, settleMs }));
  const raw = state && mod('sessions', true, () => {
    const tmuxBin = 'tmux';
    if (spawnSync(tmuxBin, ['-V']).status !== 0) throw new Error('tmux not found');
    const sx = createSessions({ exec: sessionsExec ?? createExec(), clock, slots, home, socketName, agents: sessionAgents });
    addView('sessions', { format: 'suffice.view', v: 1, type: 'list', title: 'Sessions', slot: 'sessions:list',
      fields: { name: { label: 'Name', role: 'title' }, agent: { label: 'Agent', role: 'source' }, cwd: { label: 'Folder', role: 'group' }, created: { label: 'Started', role: 'date', format: 'datetime' }, state: { label: 'State' } } });
    addView('attention', { format: 'suffice.view', v: 1, type: 'list', title: 'Needs attention', slot: 'sessions:attention', fields: { id: { label: 'Session', role: 'title' } } });
    return sx;
  });

  // sessions facade: feeds sessionstate from chat, throttled screen text and list() exits; one tick interval while any session is live
  const watch = new Map(), exitCbs = new Map(); // id -> watcher, id -> Set<cb>
  let tickTimer = null;
  const stopTick = () => { clearInterval(tickTimer); tickTimer = null; };
  const forget = (id, code) => {
    const w = watch.get(id);
    if (!w) return;
    watch.delete(id);
    w.closed = true; clearTimeout(w.timer);
    for (const f of [w.offChat, w.offStream]) try { f?.(); } catch { /* already gone */ }
    if (code !== undefined) { try { w.tracker.onExit(code); } catch { /* display only */ } for (const cb of exitCbs.get(id) ?? []) try { cb(); } catch { /* listener */ } }
    exitCbs.delete(id);
    if (!watch.size) stopTick();
  };
  const emit = (id, w) => { w.last = clock.now(); raw.screen(id).then((r) => { if (!w.closed) w.tracker.onScreen(r.text); }).catch(() => {}); };
  const track = (id, agent) => {
    if (watch.has(id)) return;
    const w = { tracker: state.track(id, { agent }), born: clock.now(), last: -Infinity, timer: null, closed: false };
    watch.set(id, w);
    try { w.offChat = raw.chat(id, (m) => w.tracker.onMessages(Array.isArray(m) ? m : [m])); } catch { /* chat is optional for state */ }
    raw.stream(id, () => { // activity-driven: at most one screen read per 500 ms, trailing edge via an unref'd timer
      if (w.closed || w.timer) return;
      const wait = 500 - (clock.now() - w.last);
      if (wait <= 0) emit(id, w); else { w.timer = setTimeout(() => { w.timer = null; if (!w.closed) emit(id, w); }, wait); w.timer.unref?.(); }
    }).then((off) => { if (w.closed) off?.(); else w.offStream = off; }).catch(() => {});
    if (!tickTimer) { tickTimer = setInterval(() => { try { state.tick(); } catch { /* next tick */ } }, Math.min(250, Math.max(50, settleMs ?? 300))); tickTimer.unref(); }
  };
  const sessionsApi = raw && {
    ...raw,
    async start(a) { const r = await raw.start(a); track(r.id, r.agent); return r; },
    async resume(a) { const r = await raw.resume(a); track(r.id, r.agent); return r; },
    async list() {
      const t0 = clock.now(), rows = await raw.list(), ids = new Set(rows.map((r) => r.id));
      for (const r of rows) track(r.id, r.agent);
      for (const [id, w] of watch) if (!ids.has(id) && w.born < t0) forget(id, 0);
      return rows;
    },
    async stop(id) { const r = await raw.stop(id); forget(id, 0); return r; },
    onExit(id, cb) { let set = exitCbs.get(id); if (!set) exitCbs.set(id, set = new Set()); set.add(cb); return () => set.delete(cb); },
  };
  const chatView = (id) => ({ format: 'suffice.view', v: 1, type: 'list', title: 'Chat', slot: `session:${id}:chat`,
    fields: { text: { label: 'Message', role: 'title' }, role: { label: 'From', role: 'group' }, ts: { label: 'Time', role: 'date', format: 'datetime' } } });
  if (sessionsApi) { try { addView('chat', chatView('x')); } catch (e) { caps.sessions = { ok: false, reason: e.message }; } }

  let bridge = null, bridgeInfo = null;
  const bridgeOk = mod('termbridge', withBridge, () => { if (!sessionsApi) throw new Error('needs sessions'); return true; });
  const terminal = async () => {
    if (!bridgeOk) throw new Error(`terminal unavailable: ${caps.termbridge?.reason ?? 'disabled'}`);
    if (!bridgeInfo) {
      const b = createTermBridge({ sessions: sessionsApi, clock, ...bridgeOpts });
      bridgeInfo = b.start().then((i) => { bridge = b; return { url: i.url, token: i.token }; }, (e) => { bridgeInfo = null; throw e; });
    }
    return bridgeInfo;
  };

  const historyApi = mod('history', withHistory, () => {
    const h = createHistory({ home: home ?? os.homedir(), clock, slots });
    addView('history', h.viewSpec());
    return h;
  });

  const byokApi = mod('byok', withByok, () => {
    const vault = createVault({ dir: path.join(dataDir, 'vault'), keyring: keyring ?? createMemoryKeyring(), clock });
    return createByok({ fetch, vault, clock, budget });
  });
  capSlot.set({ ...caps });

  return {
    slots,
    decide,
    sessions: sessionsApi, history: historyApi, byok: byokApi, terminal, views, capabilities: () => ({ ...caps }),
    reader: () => reader,
    startRun(workflow, args = {}) {
      const fn = typeof workflow === 'function' ? workflow : lookup(workflow);
      if (typeof fn !== 'function') throw new Error(`unknown workflow: ${String(workflow)}`);
      const runId = `r${Date.now().toString(36)}${randomBytes(3).toString('hex')}`;
      if (typeof workflow === 'string') { const tmp = `${metaPath(runId)}.tmp`; fs.writeFileSync(tmp, JSON.stringify({ workflow, args })); fs.renameSync(tmp, metaPath(runId)); }
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
        const state = active.has(r.runId) || heldElsewhere(r.runId) ? 'running' : !end ? 'interrupted' : end.data?.ok ? 'ended' : 'failed';
        out.push({ ...r, workflow, state });
      }
      return out.sort((a, b) => (b.first ?? 0) - (a.first ?? 0) || (a.runId < b.runId ? 1 : -1));
    },
    async dispose() {
      for (const r of active.values()) r.ac.abort();
      await Promise.allSettled([...finished.values()]);
      for (const id of [...watch.keys()]) forget(id); // watchers only: tmux sessions keep running
      stopTick();
      if (bridgeInfo) { const p = bridgeInfo; bridgeInfo = null; await p.catch(() => {}); await bridge?.stop(); }
      await raw?.close?.();
    },
  };
}
