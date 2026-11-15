import { assertShape } from '../contract.mjs';

const SEVERITY = { high: 3, medium: 2, low: 1 };

const posInt = (name, v, min) => {
  if (!Number.isInteger(v) || v < min) throw new TypeError(`thresholds.${name}: expected an integer >= ${min}`);
};
const norm = (s) => s.replace(/\s+/g, ' ').trim();
const isZeroDiff = (d) =>
  d === 0 || (d && typeof d === 'object' && Object.keys(d).length > 0 && Object.values(d).every((v) => v === 0));

/** Pure: does the journal back a success claim? Failure claims are never flagged (reverse case).
 *  `at` = {seq, stepKey} of the claim: only exec events at or before it count, and a claim without a command needs one from its own step. */
export function verifyClaim(claim, events, at) {
  if (!claim || typeof claim !== 'object') throw new TypeError('claim: expected an object');
  if (!Array.isArray(events)) throw new TypeError('events: expected an array');
  const isExit = claim.kind === 'exit' && claim.code === 0;
  const isTests = claim.kind === 'tests' && claim.passed === true;
  if (!isExit && !isTests) return { ok: true };
  const line = (d) => [d?.command, ...(d?.args ?? [])].join(' ');
  const execs = events.filter((e) => e.type === 'exec'
    && (at?.seq === undefined || e.seq <= at.seq)
    && (claim.command ? e.data?.command === claim.command || line(e.data) === claim.command : at?.stepKey === undefined || e.stepKey === at.stepKey));
  const last = execs.reduce((m, e) => (!m || !(e.seq < m.seq) ? e : m), null); // newest by seq, whatever the arrival order
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
    if (!runs.has(id)) runs.set(id, { events: [], seen: new Set(), steps: new Map(), keys: new Set(), found: [], zeroStreak: 0, ended: false });
    return runs.get(id);
  };
  const step = (r, k) => {
    if (!r.steps.has(k)) r.steps.set(k, { open: false, waiting: false, last: 0, tokens: 0, actions: [] });
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

  // same action n times, or an alternation of two full cycles (A,B,A,B)
  function looped(actions, n) {
    const t = actions.slice(-n);
    if (t.length === n && t.every((a) => a === t[0])) return true;
    const w = actions.slice(-Math.max(n, 4));
    return w.length === Math.max(n, 4) && w[0] !== w[1] && w.every((a, i) => a === w[i % 2]);
  }

  function observe(e) {
    if (!e || typeof e !== 'object') throw new TypeError('event: expected an object');
    if (typeof e.runId !== 'string' || typeof e.type !== 'string') throw new TypeError('event: runId and type must be strings');
    if (!Number.isInteger(e.seq)) throw new TypeError('event.seq: expected an integer');
    const r = run(e.runId);
    const id = `${e.seq}:${e.type}:${e.stepKey}`; // a second writer may reuse a seq; only an identical event is a duplicate
    if (r.seen.has(id)) return [];
    r.seen.add(id);
    r.events.push(e);
    const out = [];
    const d = e.data ?? {};
    const s = e.stepKey === undefined ? null : step(r, e.stepKey);
    if (s) {
      s.last = e.ts;
      if (e.type === 'step.start') s.open = true;
      if (e.type === 'step.result' || e.type === 'step.error') s.open = false;
      if (e.type === 'approval') s.waiting = d.approved === undefined; // waiting on a person is not a stall
    }

    if (e.type === 'run.end') r.ended = true;

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
      const claims = d.claims ?? d.value?.claims; // the engine nests the step value under data.value
      if (Array.isArray(claims))
        claims.forEach((c, i) => {
          const v = verifyClaim(c, r.events, { seq: e.seq, stepKey: e.stepKey });
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
      if (!r.ended) for (const [k, s] of r.steps)
        if (s.open && !s.waiting && now - s.last > thresholds.stallMs)
          add(r, runId, `stall:${k}`, 'stall', 'high', k, { idleMs: now - s.last, stallMs: thresholds.stallMs }, out);
    return out;
  }

  function findings(runId) {
    if (typeof runId !== 'string') throw new TypeError('runId: expected a string');
    return [...(runs.get(runId)?.found ?? [])];
  }

  return { observe, tick, findings };
}
