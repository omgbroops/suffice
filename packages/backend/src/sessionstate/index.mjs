import { assertShape } from '../contract.mjs';
import { classifyScreen, tailLines } from './rules.mjs';

const ATTENTION = new Set(['waiting_input', 'needs_permission', 'error']);
const IMMEDIATE = new Set(['needs_permission', 'exited', 'error']);
const STATE_SCHEMA = { type: 'object', required: ['state', 'since'] };

// No timers: time passes only through the injected clock, so the owner must call tick() (e.g. once a second) for idle/settle to elapse between inputs.
export function createSessionState({ clock, slots, idleMs = 1500, settleMs = 300 } = {}) {
  assertShape('clock', clock, ['now']);
  if (slots !== undefined) assertShape('slots', slots, ['define']);
  const trackers = new Map();
  const attention = slots?.define({ id: 'sessions:attention', title: 'Sessions needing attention', schema: { type: 'array', items: { type: 'string' } } }, []);

  const publishAttention = () => attention?.set([...trackers].filter(([, t]) => ATTENTION.has(t.state().state)).sort((a, b) => a[1].state().since - b[1].state().since).map(([id]) => id));

  function track(sessionId, { agent } = {}) {
    if (typeof sessionId !== 'string' || !sessionId) throw new TypeError('sessionId must be a non-empty string');
    if (trackers.has(sessionId)) return trackers.get(sessionId);
    const subs = new Set();
    const seen = new Set();
    let cur = { state: 'starting', since: clock.now(), reason: 'no signal yet', lastActivity: clock.now(), turns: 0, toolCalls: 0 };
    let pending = null; // {state, reason, at}
    let hasTranscript = false, last = null, openCalls = 0, lastAt = 0, screen = null, screenAt = 0, exit = null, asked = false, permBase = null;
    const slot = slots?.define({ id: `session:${sessionId}:state`, title: `Session ${sessionId}`, schema: STATE_SCHEMA }, cur);

    const touch = () => { cur = { ...cur, lastActivity: clock.now() }; };

    function candidate(now) {
      if (exit !== null) return exit === 0 ? { state: 'exited', reason: 'exit code 0', at: now } : { state: 'error', reason: `exited with code ${exit}`, at: now };
      if (screen?.permission) return { state: 'needs_permission', reason: 'screen shows an approval prompt', at: now };
      if (screen?.error) return { state: 'error', reason: 'screen shows an error', at: now };
      if (hasTranscript) {
        // a declined tool call gets no result: after an approval prompt, a quiet screen with no busy indicator means the user answered no
        if (openCalls > 0 && asked && screen && !screen.working && now >= screenAt + idleMs) return { state: 'waiting_input', reason: 'tool call unanswered after the approval prompt left the screen', at: screenAt + idleMs };
        if (last !== 'assistant') return { state: 'working', reason: `last message from ${last}`, at: now };
        if (openCalls > 0) return { state: 'working', reason: `${openCalls} tool call(s) unanswered`, at: now };
        const due = lastAt + idleMs;
        return now >= due ? { state: 'waiting_input', reason: `assistant finished, quiet ${idleMs}ms`, at: due } : { state: 'working', reason: 'assistant message, still within idle window', at: now };
      }
      if (!screen) return { state: 'starting', reason: 'no signal yet', at: now };
      if (screen.working) return { state: 'working', reason: 'screen shows a busy indicator', at: now };
      const due = screenAt + idleMs;
      return !screen.blank && now >= due ? { state: 'waiting_input', reason: 'screen idle without a busy indicator', at: due } : { state: 'working', reason: 'screen changed recently', at: now };
    }

    function emit(next, since) {
      cur = { ...cur, state: next.state, reason: next.reason, since };
      slot?.set(cur);
      publishAttention();
      for (const fn of [...subs]) { try { fn({ ...cur }, sessionId); } catch { /* a bad listener must not break the tracker */ } }
    }

    function evaluate() {
      if (cur.state === 'exited' || (exit !== null && exit !== 0 && cur.state === 'error')) return;
      const now = clock.now();
      const c = candidate(now);
      if (c.state === cur.state) { pending = null; return; }
      if (IMMEDIATE.has(c.state)) { pending = null; emit(c, now); return; }
      if (pending?.state !== c.state) pending = c;
      if (now - pending.at >= settleMs) { const p = pending; pending = null; emit(p, p.at); }
    }

    let lastTail = null; // an unchanged screen must not restart the idle window
    const tracker = {
      onMessages(messages) {
        if (!Array.isArray(messages)) throw new TypeError('messages must be an array');
        let any = false;
        for (const m of messages) {
          if (m?.id != null) { if (seen.has(m.id)) continue; seen.add(m.id); }
          any = true; asked = false; hasTranscript = true; last = m.role;
          if (m.role === 'user') cur = { ...cur, turns: cur.turns + 1 };
          if (m.role === 'tool' && m.tool) {
            if ('output' in m.tool) openCalls = Math.max(0, openCalls - 1); // results carry output, calls carry input
            else { openCalls += 1; cur = { ...cur, toolCalls: cur.toolCalls + 1 }; }
          }
        }
        if (any) { lastAt = clock.now(); touch(); }
        evaluate();
      },
      onScreen(text) { const tail = tailLines(text).join('\n'); screen = classifyScreen(agent, text);
        if (screen.permission) {
          asked = true;
          // shortcut: stale = 2+ new lines under the dialog since first seen; a live dialog that grows below its title would be missed, upgrade with a real cursor/redraw signal
          if (permBase === null) permBase = screen.after; else if (screen.after >= permBase + 2) screen = { ...screen, permission: false };
        } else permBase = null; if (tail !== lastTail) { lastTail = tail; screenAt = clock.now(); touch(); } evaluate(); },
      onExit(code) { exit = Number.isInteger(code) ? code : 1; touch(); evaluate(); },
      tick: evaluate,
      state: () => ({ ...cur }),
      subscribe(fn) {
        if (typeof fn !== 'function') throw new TypeError('subscribe(fn)');
        subs.add(fn);
        return () => subs.delete(fn);
      },
    };
    trackers.set(sessionId, tracker);
    return tracker;
  }

  return { track, all: () => Object.fromEntries([...trackers].map(([id, t]) => [id, t.state()])), tick: () => trackers.forEach((t) => t.tick()) };
}
