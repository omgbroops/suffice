import fs from 'node:fs';
import path from 'node:path';
import {createExec, createCommandRunner} from '../../../packages/backend/src/runner/index.mjs';
import {createBrowser} from '../../../packages/backend/src/builtins/browser.mjs';
import {createJournal} from '../../../packages/backend/src/journal/index.mjs';
import {createComputerAgent, createReplayCache} from '../../../packages/backend/src/computer/index.mjs';
import {execFile} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {cdpBrowser, nativeDesktop} from '../../../src/ref-browser.mjs';
import {fakeComputer, fakeNative} from './computer-fake.mjs';

const RUN_ID = /^cu-[a-z0-9]+$/;
const clock = {now: () => Date.now()};

// Computer-use sessions: the real backend agent (risk tags, injection check, approval gate, replay cache, journal).
// Browser surface by default (url); a native macOS app (app) drives ax-snapshot. Tests (SUFFICE_COMPUTER_FAKE=1) drive a scripted page set; the real path drives agent-browser limited to the start site.
export function createComputer({dataDir, env = process.env, send}) {
 const dir = path.join(dataDir, 'computer');
 const fake = env.SUFFICE_COMPUTER_FAKE === '1';
 const exec = createExec();
 const runners = fake ? {} : {default: createCommandRunner({exec, command: env.SUFFICE_FLOW_COMMAND || 'claude', args: ['-p', '--model', 'haiku'], timeoutMs: 120000})};
 const replay = createReplayCache({dir: path.join(dir, 'replay')});
 const live = new Map(), pending = new Map();
 let backend = null, n = 0;
 const poke = () => send({type: 'computer'});
 const journal = id => createJournal({dir, runId: id, clock});
 const events = id => { try { return fs.readFileSync(path.join(dir, id + '.jsonl'), 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l)); } catch { return []; } };
 const approve = (runId, j) => q => new Promise(res => { pending.set('ap' + (++n), {runId, q, res, j}); j.append({type: 'computer.ask', data: {action: q.action}}).catch(() => {}).then(poke); });
 const drop = runId => { for (const [id, p] of pending) if (p.runId === runId) { pending.delete(id); p.res(false); } };

 const sum = id => {
  const ev = events(id), head = ev.find(e => e.type === 'computer.run'), end = ev.findLast(e => e.type === 'computer.end');
  if (!head) return null;
  const steps = ev.filter(e => e.type === 'computer.step').map(e => e.data);
  const ask = [...pending].find(([, p]) => p.runId === id);
  const awaiting = ev.at(-1)?.type === 'computer.ask',
    state = ask ? 'approval' : live.has(id) ? 'running' : end ? (end.data.cancelled ? 'cancelled' : end.data.ok ? 'done' : 'failed') : 'interrupted';
  return {runId: id, goal: head.data.goal, start: head.data.start, state, awaiting: state === 'interrupted' && awaiting, steps, answer: end?.data.answer ?? null, stopReason: end?.data.stopReason ?? null, error: end?.data.error ?? null,
   replayed: !!end?.data.replay?.hit, started: head.ts, last: ev.at(-1)?.ts ?? 0,
   approval: ask ? {id: ask[0], action: ask[1].q.action, target: ask[1].q.target?.name ?? '', tags: ask[1].q.riskTags ?? [], reason: ask[1].q.reason ?? null} : null};
 };
 const ids = () => { try { return fs.readdirSync(dir).filter(f => f.endsWith('.jsonl')).map(f => f.slice(0, -6)).filter(i => RUN_ID.test(i)); } catch { return []; } };
 const runId = id => { if (!RUN_ID.test(String(id || ''))) throw new Error('Invalid session'); return id; };

 async function start(p) {
  const goal = typeof p?.goal === 'string' ? p.goal.trim() : '';
  if (!goal) throw new Error('Describe what the agent should do');
  if (goal.length > 2000) throw new Error('Keep the goal under 2000 characters');
  const app = typeof p?.app === 'string' ? p.app.trim() : '';
  let url; if (!app) { try { url = new URL(String(p?.url || '')); if (!/^https?:$/.test(url.protocol)) throw 0; } catch { throw new Error('Enter a web address starting with https://'); } }
  const startAt = app || url.href;
  const id = 'cu-' + Date.now().toString(36) + (++n).toString(36), ac = new AbortController();
  fs.mkdirSync(dir, {recursive: true});
  const j = journal(id);
  await j.append({type: 'computer.run', data: {goal, start: startAt}});
  live.set(id, ac);
  let deps, win = null;
  if (app) { // native app: ax-snapshot refs, no CDP
   if (!fake && !backend) throw new Error('Backend is not ready');
   const f = fake ? fakeNative() : null, bin = env.SUFFICE_AX_BIN || fileURLToPath(new URL('../native/ax-snapshot', import.meta.url));
   deps = {desktop: nativeDesktop(f ? f.exec : (b, a) => new Promise((res, rej) => execFile(b, a, {timeout: 30000, maxBuffer: 8 << 20}, (e, out) => e ? rej(e) : res(out))), bin), decide: f ? f.decide : backend.decide};
  }
  else if (fake) { const f = fakeComputer(url.href); deps = {browser: f.browser, decide: f.decide}; }
  else if (env.SUFFICE_COMPUTER_REF !== 'exec') { // ref snapshots are the default; SUFFICE_COMPUTER_REF=exec opts back to the exec browser
   if (!backend) throw new Error('Backend is not ready');
   // Ref snapshots over a hidden Electron page (webContents.debugger): no screen, no pointer. Navigation stays on the start site.
   const {BrowserWindow} = await import('electron');
   win = new BrowserWindow({show: false, webPreferences: {sandbox: true, contextIsolation: true}});
   const wc = win.webContents, ok = u => { try { return new URL(u).hostname === url.hostname; } catch { return false; } };
   wc.on('will-navigate', (e, u) => { if (!ok(u)) e.preventDefault(); });
   wc.setWindowOpenHandler(() => ({action: 'deny'}));
   deps = {browser: cdpBrowser(wc), decide: backend.decide, limits: {shots: false}}; // screenshots only when the tree is empty
  }
  else {
   if (!backend) throw new Error('Backend is not ready');
   deps = {browser: createBrowser({exec, clock, policy: {allowedDomains: ['.' + url.hostname]}}), decide: backend.decide};
  }
  const agent = createComputerAgent({...deps, journal: {...j, append: async e => { const r = await j.append(e); if (e?.type === 'computer.step') poke(); return r; }}, clock, approve: approve(id, j), replay});
  (async () => {
   let r;
   try { r = await agent.run({goal, surface: app ? 'desktop' : 'browser', start: startAt, agentId: id, signal: ac.signal}); } catch (e) { r = {ok: false, stopReason: 'error', error: String(e?.message || e)}; }
   const cancelled = ac.signal.aborted;
   live.delete(id); drop(id); try { win?.destroy(); } catch {}
   await j.append({type: 'computer.end', data: {ok: !!r.ok && !cancelled, cancelled, stopReason: r.stopReason, answer: r.answer ?? null, error: r.error ?? null, replay: r.replay ?? null}}).catch(() => {});
   poke();
  })();
  poke();
  return {runId: id};
 }

 return {
  runners, attach(b) { backend = b; },
  handlers: {
   'computer-start': p => start(p),
   'computer-list': () => ({runs: ids().map(sum).filter(Boolean).sort((a, b) => b.last - a.last).map(({steps, ...r}) => ({...r, stepCount: steps.length}))}),
   'computer-detail': id => { const s = sum(runId(id)); if (!s) throw new Error('Unknown session'); return s; },
   'computer-approve': async p => { const e = pending.get(p?.id); if (!e) throw new Error('That approval was already answered'); pending.delete(p.id); await e.j.append({type: 'computer.answer', data: {approved: !!p.approved}}).catch(() => {}); e.res(!!p.approved); poke(); return true; },
   'computer-cancel': id => { runId(id); const ac = live.get(id); if (!ac) return false; ac.abort(); drop(id); poke(); return true; },
  },
 };
}
