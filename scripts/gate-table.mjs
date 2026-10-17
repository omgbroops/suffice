// Cost/quality table from MEASURED per-attempt verdicts (reports/picomatch-haiku-attempts-v2.json).
// Unit H = one cheap attempt. g = spec cost in H, k = strong-solo cost in H (both UNMEASURED parameters; strong pass assumed 1.0).
import { readFileSync } from 'node:fs';
const rows = JSON.parse(readFileSync(new URL(process.argv[2] ?? '../reports/picomatch-haiku-attempts-v2.json', import.meta.url)));
const pStrong = Number(process.argv[3] ?? 1); // measured strong-model pass rate; escalated cases and rework only succeed with this probability
const arms = { 'cheap solo': () => true, 'cheap+visible gate': r => r.visible, 'cheap+symptom-spec gate': r => r.symptom, 'cheap+contract-spec gate': r => r.contract, 'cheap+haiku-spec gate': r => r.haiku, 'cheap+unsure-spec gate': r => r.unsure };
const out = [];
const shipped0 = (accept, rows) => rows.every(r => accept(r) === undefined);
for (const k of [3, 10, 30]) for (const g of [0.3, 1]) {
  for (const [name, accept] of Object.entries(arms)) {
    const gated = name.includes('spec') ? g : 0, n = rows.length;
    if (shipped0(accept, rows)) continue; // skip arms whose column is absent in this data file
    const shipped = rows.filter(accept), escalated = n - shipped.length;
    const wrong = shipped.filter(r => !r.acceptance).length;
    const cost = 1 + gated + (escalated / n) * k, good = (shipped.length - wrong + escalated * pStrong) / n, rework = cost + (wrong / n) * k; // rework: each shipped-wrong patch is later redone by the strong model
    out.push({ k, g: gated, arm: name, cost: +cost.toFixed(2), correct: +good.toFixed(2), reworkCost: +rework.toFixed(2) });
  }
  out.push({ k, g, arm: 'strong solo', cost: k, correct: pStrong, reworkCost: k });
}
console.table(out.filter((r, i, a) => a.findIndex(x => x.k === r.k && x.g === r.g && x.arm === r.arm) === i));
