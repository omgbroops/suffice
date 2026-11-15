import { assertShape } from '../contract.mjs';

const SEVERITY = { high: 3, medium: 2, low: 1 };

const posInt = (name, v, min) => {
  if (!Number.isInteger(v) || v < min) throw new TypeError(`thresholds.${name}: expected an integer >= ${min}`);
};
const norm = (s) => s.replace(/\s+/g, ' ').trim();
const isZeroDiff = (d) =>
  d === 0 || (d && typeof d === 'object' && Object.keys(d).length > 0 && Object.values(d).every((v) => v === 0));

/** Pure: does the journal back a success claim? Failure claims are never flagged (reverse case). */
export function verifyClaim(claim, events) {
  if (!claim || typeof claim !== 'object') throw new TypeError('claim: expected an object');
  if (!Array.isArray(events)) throw new TypeError('events: expected an array');
  const isExit = claim.kind === 'exit' && claim.code === 0;
  const isTests = claim.kind === 'tests' && claim.passed === true;
  if (!isExit && !isTests) return { ok: true };
  // tests claims may omit the command: then the latest exec of any command is the evidence
  const execs = events.filter((e) => e.type === 'exec' && (!claim.command || e.data?.command === claim.command));
  const last = execs.at(-1);
  if (!last) return { ok: false, reason: 'no exec event backs this claim', claim };
  if (last.data.code !== 0) return { ok: false, reason: `exec exited ${last.data.code}`, claim, execSeq: last.seq };
  return { ok: true };
}

/** Highest severity first, then newest first. Returns a new array. */
export function rank(findings) {
  if (!Array.isArray(findings)) throw new TypeError('findings: expected an array');
  return findings
    .map((f, i) => [f, i])
    .sort(([a, i], [b, j]) => (SEVERITY[b.severity] ?? 0) - (SEVERITY[a.severity] ?? 0) || (b.ts ?? 0) - (a.ts ?? 0) || j - i)
    .map(([f]) => f);
}

export function createWatchdog({ clock, bus, thresholds } = {}) {
  assertShape('clock', clock, ['now']);
  assertShape('bus', bus, ['emit']);
  if (!thresholds || typeof thresholds !== 'object') throw new TypeError('thresholds: expected an object');
  posInt('stallMs', thresholds.stallMs, 1);
  posInt('loopRepeats', thresholds.loopRepeats, 2);
  posInt('noProgressSteps', thresholds.noProgressSteps, 1);
  posInt('tokensPerStep', thresholds.tokensPerStep, 1);

  const runs = new Map();
  const run = (id) => {
    if (!runs.has(id)) runs.set(id, { events: [], seen: new Set(), steps: new Map(), keys: new Set(), found: [], zeroStreak: 0 });
    return runs.get(id);
  };
  const step = (r, k) => {
    if (!r.steps.has(k)) r.steps.set(k, { open: false, last: 0, tokens: 0, actions: [] });
    return r.steps.get(k);
  };

  // one finding per dedupe key, ever
  function add(r, runId, key, kind, severity, stepKey, evidence, out) {
    if (r.keys.has(key)) return;
    r.keys.add(key);
    const f = { runId, kind, severity, evidence, ts: clock.now() };
    if (stepKey !== undefined) f.stepKey = stepKey;
    r.found.push(f);
    out.push(f);
    bus.emit('watchdog.finding', f);
  }

  function looped(actions, n) {
    const t = actions.slice(-n);
    if (t.length < n) return false;
    if (t.every((a) => a === t[0])) return true;
    return t[0] !== t[1] && t.every((a, i) => a === t[i % 2]);
  }

  function observe(e) {
    if (!e || typeof e !== 'object') throw new TypeError('event: expected an object');
    if (typeof e.runId !== 'string' || typeof e.type !== 'string') throw new TypeError('event: runId and type must be strings');
    if (!Number.isInteger(e.seq)) throw new TypeError('event.seq: expected an integer');
    const r = run(e.runId);
    if (r.seen.has(e.seq)) return [];
    r.seen.add(e.seq);
    r.events.push(e);
    const out = [];
    const d = e.data ?? {};
    const s = e.stepKey === undefined ? null : step(r, e.stepKey);
    if (s) {
      s.last = e.ts;
      if (e.type === 'step.start') s.open = true;
      if (e.type === 'step.result' || e.type === 'step.error') s.open = false;
    }

    if (s && typeof d.action === 'string') {
      s.actions.push(norm(d.action));
      if (looped(s.actions, thresholds.loopRepeats))
        add(r, e.runId, `loop:${e.stepKey}`, 'loop', 'medium', e.stepKey, { actions: s.actions.slice(-thresholds.loopRepeats) }, out);
    }

    if (s && d.usage) {
      s.tokens += (d.usage.inputTokens || 0) + (d.usage.outputTokens || 0);
      if (s.tokens > thresholds.tokensPerStep)
        add(r, e.runId, `burn:${e.stepKey}`, 'budget-burn', 'medium', e.stepKey, { tokens: s.tokens, limit: thresholds.tokensPerStep }, out);
    }

    if (e.type === 'step.result') {
      if (Array.isArray(d.claims))
        d.claims.forEach((c, i) => {
          const v = verifyClaim(c, r.events);
          if (!v.ok) add(r, e.runId, `claim:${e.seq}:${i}`, 'claim-mismatch', 'high', e.stepKey, v, out);
        });
      r.zeroStreak = isZeroDiff(d.diffStat) ? r.zeroStreak + 1 : 0;
      // fires once, when the streak first reaches the threshold
      if (r.zeroStreak === thresholds.noProgressSteps)
        add(r, e.runId, `noprogress:${e.seq}`, 'no-progress', 'low', e.stepKey, { steps: r.zeroStreak }, out);
    }
    return out;
  }

  function tick() {
    const out = [];
    const now = clock.now();
    for (const [runId, r] of runs)
      for (const [k, s] of r.steps)
        if (s.open && now - s.last > thresholds.stallMs)
          add(r, runId, `stall:${k}`, 'stall', 'high', k, { idleMs: now - s.last, stallMs: thresholds.stallMs }, out);
    return out;
  }

  function findings(runId) {
    if (typeof runId !== 'string') throw new TypeError('runId: expected a string');
    return [...(runs.get(runId)?.found ?? [])];
  }

  return { observe, tick, findings };
}
