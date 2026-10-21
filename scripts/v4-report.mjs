import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

// Usage: node scripts/v4-report.mjs <results.jsonl>   (rows written by runV4Task; missing meta fields print as 'unknown')
const Z = 1.959964;

// Wilson score interval, 95%. Returns null for n = 0.
export function wilson(k, n) {
  if (!n) return null;
  const p = k / n, z2 = Z * Z, d = 1 + z2 / n;
  const c = (p + z2 / (2 * n)) / d;
  const h = Z * Math.sqrt(p * (1 - p) / n + z2 / (4 * n * n)) / d;
  return [Math.max(0, c - h), Math.min(1, c + h)];
}

const pct = x => `${(100 * x).toFixed(1)}%`;
const usd = x => (x == null ? '—' : `$${x.toFixed(4)}`);
const passCell = (k, n) => {
  if (!n) return '—';
  const [lo, hi] = wilson(k, n);
  return `${k}/${n} ${pct(k / n)} [${pct(lo)}, ${pct(hi)}]`;
};

// Normalises one runner row. Contaminated sets get their own label so they are never read as clean results.
export function normalise(r) {
  const benchmark = r.benchmark ?? 'unknown';
  const contaminated = r.contaminated === true;
  return {
    benchmark: contaminated ? `${benchmark} (public, contaminated)` : benchmark,
    difficulty: r.difficulty ?? 'unknown',
    arm: r.arm ?? r.variant ?? 'unknown',
    first: r.firstAttemptPass === true,
    final: r.finalPass === true,
    cost: Number.isFinite(r.costUsd) ? r.costUsd : 0,
    costUnknown: r.costKnown === false,
    firstCost: Array.isArray(r.roundCostsUsd) ? (r.roundCostsUsd[0] ?? 0) : 0,
    escalated: r.escalated === true,
    status: r.status ?? 'unknown',
  };
}

export function stats(rows) {
  const s = { n: rows.length, firstK: 0, finalK: 0, cost: 0, firstCost: 0, escalated: 0, costUnknown: 0, nonSuccess: 0, statuses: {} };
  for (const r of rows) {
    if (r.first) s.firstK++;
    if (r.final) s.finalK++;
    s.cost += r.cost; s.firstCost += r.firstCost;
    if (r.escalated) s.escalated++;
    if (r.costUnknown) s.costUnknown++;
    if (r.status !== 'completed') { s.nonSuccess++; s.statuses[r.status] = (s.statuses[r.status] ?? 0) + 1; }
  }
  return s;
}

function table(title, rows, keyOf) {
  const groups = new Map();
  for (const r of rows) { const k = keyOf(r); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(r); }
  const head = '| group | n | first-attempt pass (Wilson 95%) | final pass (Wilson 95%) | cost/task | cost/final pass | cost/first-attempt pass | escalation | non-success | cost unknown |';
  const lines = [`## By ${title}`, '', head, '|' + '---|'.repeat(10)];
  for (const key of [...groups.keys()].sort()) {
    const s = stats(groups.get(key));
    const nonSuccess = s.nonSuccess ? `${s.nonSuccess} (${Object.entries(s.statuses).map(([k, v]) => `${k}: ${v}`).join(', ')})` : '0';
    lines.push(`| ${key} | ${s.n} | ${passCell(s.firstK, s.n)} | ${passCell(s.finalK, s.n)} | ${usd(s.cost / s.n)} | ${usd(s.finalK ? s.cost / s.finalK : null)} | ${usd(s.firstK ? s.firstCost / s.firstK : null)} | ${pct(s.escalated / s.n)} | ${nonSuccess} | ${s.costUnknown} |`);
  }
  return [...lines, ''];
}

export function report(rawRows) {
  const rows = rawRows.map(normalise);
  return [
    '# V4 results', '',
    `Rows: ${rows.length}. Pass rates use Wilson 95% intervals. cost/final pass = total cost / final passes. cost/first-attempt pass = first-round cost of all tasks / first-attempt passes. Contaminated sets are public, contaminated.`, '',
    ...table('benchmark', rows, r => r.benchmark),
    ...table('difficulty', rows, r => r.difficulty),
    ...table('arm', rows, r => r.arm),
  ].join('\n');
}

export function parseRows(text) {
  return text.split('\n').filter(line => line.trim()).map((line, i) => {
    try { return JSON.parse(line); } catch (error) { throw new Error(`results line ${i + 1} is not JSON: ${error.message}`); }
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const file = process.argv[2];
  if (!file) { console.error('usage: node scripts/v4-report.mjs <results.jsonl>'); process.exit(2); }
  console.log(report(parseRows(readFileSync(file, 'utf8'))));
}
