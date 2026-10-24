#!/usr/bin/env node
// Offline: builds the evidence tables in docs/HANDOFF-EVIDENCE.md from reports/**/*.jsonl, their ledgers and failure tails.
// Usage: node scripts/handoff-evidence.mjs > /tmp/tables.md
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const REPORTS = join(ROOT, 'reports');
const walk = d => readdirSync(d).flatMap(n => { const p = join(d, n); return statSync(p).isDirectory() ? walk(p) : [p]; });
const rowsOf = f => readFileSync(f, 'utf8').split('\n').filter(Boolean).flatMap(l => { try { return [JSON.parse(l)]; } catch { return []; } });
const esc = s => String(s ?? '').replace(/\|/g, '/').replace(/\s+/g, ' ').trim();
const short = t => String(t).replace(/^instance_/, '').replace(/^(\w+)__([\w-]+?)-([0-9a-f]{6})[0-9a-f]+.*$/, '$1-$3');
const n2 = x => (x == null || Number.isNaN(x) ? '—' : x.toFixed(2));
const n3 = x => (x == null || Number.isNaN(x) ? '—' : x.toFixed(3));
const k = x => (x >= 1e6 ? (x / 1e6).toFixed(1) + 'M' : x >= 1e3 ? Math.round(x / 1e3) + 'K' : String(x));
const count = arr => Object.entries(arr.reduce((m, x) => (m[x] = (m[x] ?? 0) + 1, m), {})).sort((a, b) => b[1] - a[1]).map(([a, b]) => `${a}:${b}`).join(' ');

// Failure reason for one row, from fields only (no interpretation beyond the field names).
export function reason(r) {
  if (r.status && r.status !== 'completed') return `${r.status}${r.error ? ` (${esc(r.error).slice(0, 60)})` : ''}`;
  if (r.finalPass) return null;
  if (r.selfFinalPass === true) return 'self/gate pass, hidden fail';
  if (r.selfFinalPass === false) return `self/gate fail${r.fixRounds ? ` after ${r.fixRounds} fix` : ''}, shipped`;
  return 'hidden fail (no self field)';
}

function ledgerWall(f) {
  const lf = [`${f}.ledger.jsonl`, f.replace(/\.jsonl$/, '.ledger.jsonl')].find(existsSync);
  if (!lf) return null;
  const ts = rowsOf(lf).map(e => e.t).filter(Number.isFinite);
  return ts.length > 1 ? (Math.max(...ts) - Math.min(...ts)) / 60000 : null;
}

export function summarize(f) {
  const rows = rowsOf(f);
  // v4/v5 rows have no calls[]; their per-round models live in selfTests[].
  const calls = rows.flatMap(r => r.calls ?? (r.selfTests ?? []).map(t => ({ model: t.model })));
  const tok = calls.reduce((s, c) => { const u = c.usage ?? {}; return s + (u.input_tokens ?? 0) + (u.output_tokens ?? 0) + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0); }, 0);
  const pass = rows.filter(r => r.finalPass).length;
  const cost = rows.reduce((s, r) => s + (r.costUsd ?? 0), 0);
  const has = key => rows.some(r => key in r);
  const cnt = pred => rows.filter(pred).length;
  const arm = [...new Set(rows.map(r => [r.arm, r.variant].filter(Boolean).join('/')))].join(', ');
  return {
    file: relative(REPORTS, f), arm: esc(arm).slice(0, 60), bench: [...new Set(rows.map(r => r.benchmark).filter(Boolean))].join(','),
    n: rows.length, uniq: new Set(rows.map(r => r.task)).size, pass, acc: rows.length ? (100 * pass) / rows.length : null,
    first: has('firstAttemptPass') ? cnt(r => r.firstAttemptPass) : '—',
    selfPassHiddenFail: cnt(r => r.status === 'completed' && r.selfFinalPass === true && !r.finalPass),
    selfFailHiddenPass: cnt(r => r.selfFinalPass === false && r.finalPass),
    esc: has('escalated') ? cnt(r => r.escalated) : '—', escSkip: has('escalationSkipped') ? cnt(r => r.escalationSkipped) : '—',
    fix: has('fixRounds') ? rows.reduce((s, r) => s + (r.fixRounds ?? 0), 0) : '—', rescued: has('rescued') ? cnt(r => r.rescued) : '—',
    rescuedPass: has('rescued') ? cnt(r => r.rescued && r.finalPass) : '—',
    status: count(rows.map(r => r.status ?? '?')), cost, perPass: pass ? cost / pass : null, perTask: rows.length ? cost / rows.length : null,
    wall: ledgerWall(f), models: count(calls.map(c => String(c.model ?? '?').replace(/^claude-/, '').replace(/-5-5$/, ''))),
    turns: calls.reduce((s, c) => s + (c.numTurns ?? 0), 0), tokens: tok, ncalls: calls.length,
    fails: rows.filter(r => !r.finalPass).map(r => `${short(r.task)}: ${reason(r)}`),
  };
}

// Failure tails: first line of each log is "--- <kind>".
export function tails() {
  const dir = join(REPORTS, 'v4', 'failures');
  if (!existsSync(dir)) return [];
  return readdirSync(dir).map(d => {
    const logs = walk(join(dir, d)).filter(p => p.endsWith('.log'));
    const kinds = logs.map(p => (readFileSync(p, 'utf8').split('\n')[0].match(/^---\s*(\S+)/)?.[1]) ?? 'no-header');
    return { dir: d, logs: logs.length, kinds: count(kinds), tasks: logs.map(p => short(p.split('/').pop().replace(/\.log$/, ''))).join(', ') };
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const files = walk(REPORTS).filter(p => p.endsWith('.jsonl') && !p.endsWith('.ledger.jsonl')).sort();
  const S = files.map(summarize);
  const out = [];
  out.push('| # | results file | bench | arm / variant | rows | uniq tasks | pass | acc % | first-try pass | self pass, hidden fail | self fail, hidden pass | escalated | esc skipped | fix rounds | rescued (pass) | status counts | $ total | $/task | $/pass | wall min (ledger) | calls | turns | tokens | models (calls) | failed tasks: recorded reason |');
  out.push('|' + '---|'.repeat(26));
  S.forEach((s, i) => out.push(`| ${i + 1} | ${s.file} | ${s.bench} | ${s.arm} | ${s.n} | ${s.uniq} | ${s.pass} | ${s.acc == null ? '—' : s.acc.toFixed(0)} | ${s.first} | ${s.selfPassHiddenFail} | ${s.selfFailHiddenPass} | ${s.esc} | ${s.escSkip} | ${s.fix} | ${s.rescued === '—' ? '—' : `${s.rescued} (${s.rescuedPass})`} | ${s.status} | ${n2(s.cost)} | ${n3(s.perTask)} | ${n3(s.perPass)} | ${s.wall == null ? '—' : s.wall.toFixed(0)} | ${s.ncalls} | ${s.turns} | ${k(s.tokens)} | ${s.models} | ${s.fails.map(esc).join('; ') || '—'} |`));
  out.push('', '### Failure-tail folders (`reports/v4/failures/`)', '', '| folder | logs | first-line kinds | tasks |', '|---|---|---|---|');
  for (const t of tails()) out.push(`| ${t.dir} | ${t.logs} | ${t.kinds} | ${esc(t.tasks)} |`);
  console.log(out.join('\n'));
}
