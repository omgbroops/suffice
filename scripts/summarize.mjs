import { readFile, readdir, writeFile, mkdir, statfs } from 'node:fs/promises';
import { resolve } from 'node:path';
import { root, stateDir } from '../src/runtime.mjs';
import { createBudgetLedger } from '../src/budget.mjs';

async function campaign(name) {
  const directory = resolve(stateDir, 'runs', name);
  const manifest = JSON.parse(await readFile(resolve(directory, 'manifest.json'), 'utf8'));
  const runs = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    try { runs.push(JSON.parse(await readFile(resolve(directory, entry.name, 'result.json'), 'utf8'))); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  const cleanPair = (arm, baseline = 'core') => runs.filter(r => r.variant === arm).flatMap(r => {
    const b = runs.find(b => b.variant === baseline && b.task === r.task && b.repetition === r.repetition);
    return b && r.success && b.success && Number.isFinite(r.totalEstimatedUsd) && Number.isFinite(b.totalEstimatedUsd) ? [{ arm: r, baseline: b }] : [];
  });
  const sum = (pairs, side, metric) => pairs.reduce((s, p) => s + metric(p[side]), 0);
  const comparison = (arm, baseline) => {
    const pairs = cleanPair(arm, baseline);
    if (!pairs.length) return { pairs: 0 };
    const fraction = metric => pairs.every(p => Number.isFinite(metric(p.arm)) && Number.isFinite(metric(p.baseline))) ? sum(pairs, 'arm', metric) / sum(pairs, 'baseline', metric) - 1 : null;
    return { pairs: pairs.length, costChange: fraction(r => r.totalEstimatedUsd), callChange: fraction(r => r.turns), tokenChange: fraction(r => r.usage.totalTokens) };
  };
  return { name, split: manifest.split, reasoning: manifest.reasoning, scheduled: manifest.schedule.length, attempted: runs.length,
    passed: runs.filter(r => r.success).length, providerFailures: runs.filter(r => r.status === 'provider_error').length,
    otherFailures: runs.filter(r => !r.success && r.status !== 'provider_error').length,
    coreVsPi: comparison('core', 'pi'),
    arms: [...new Set(manifest.schedule.map(r => r.variant))].map(variant => {
      const rows = runs.filter(r => r.variant === variant);
      return { variant, attempted: rows.length, passed: rows.filter(r => r.success).length,
        calls: rows.reduce((s, r) => s + r.watcherCalls, 0), injections: rows.reduce((s, r) => s + r.decisions.filter(d => d.injected).length, 0),
        plannedReadsSkipped: rows.reduce((s, r) => s + (r.skippedPlanned ?? 0), 0), vsCore: comparison(variant, 'core') };
    }),
    runs,
  };
}
const campaigns = await Promise.all(['pilot-low-v3', 'holdout-low-v3'].map(campaign));
const ledger = await createBudgetLedger(resolve(stateDir, 'jev-budget.jsonl')).snapshot();
let knownJevUsd = 0, jevCostMissing = 0, totalRuns = 0;
for (const entry of await readdir(resolve(stateDir, 'runs'), { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;
  try {
    const { runs } = await campaign(entry.name); totalRuns += runs.length;
    for (const r of runs) for (const d of r.decisions) if (d.provider === 'typesafe') {
      if (typeof d.costUsd === 'number' && d.usage) knownJevUsd += d.costUsd;
      else if (d.dispatched !== false) jevCostMissing++;
    }
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
}
const smoke = JSON.parse(await readFile(resolve(stateDir, 'watcher-smoke.json'), 'utf8'));
for (const result of smoke.results ?? []) if (result.provider === 'typesafe' && typeof result.costUsd === 'number') knownJevUsd += result.costUsd;
const disk = await statfs(root);
const report = { at: new Date().toISOString(), totalCodingAttemptsIncludingIntegration: totalRuns,
  campaigns: campaigns.map(({ runs, ...c }) => c), jev: { knownUsageEstimateUsd: knownJevUsd, missingCallCost: jevCostMissing, reservedUsd: ledger.reservedUsd, limitUsd: ledger.limitUsd },
  diskFreeGiB: disk.bavail * disk.bsize / 1024 ** 3 };
const percent = x => Number.isFinite(x) ? `${(100 * x).toFixed(1)}%` : 'unknown';
const lines = ['# Suffice: first experiment results', '',
  `Updated ${report.at}. GPT-6.1 Sol, low reasoning, pinned Pi 1.2.0. These are small AI-authored synthetic tasks, not a real-world coding benchmark.`, '',
  '## Execution', '', '| Campaign | Attempted / scheduled | Accepted | Main-provider failures | Other failures |', '| --- | --- | --- | --- | --- |'];
for (const c of campaigns) lines.push(`| ${c.name} | ${c.attempted}/${c.scheduled} | ${c.passed} | ${c.providerFailures} | ${c.otherFailures} |`);
lines.push('', 'Provider failures are availability outcomes, not evidence of model inability. Earlier integration and medium-effort runs are preserved separately.', '',
  '## Core versus direct-tool Pi baseline', '',
  'The core bundle uses a shorter stable prompt and Pi codemode-only tool execution. All arms use the same restricted workspace tools. This is a Pi SDK baseline, not an unrestricted stock CLI comparison.', '',
  '| Campaign | Matched accepted pairs with complete cost | Model-cost change | Main-call change | Main-token change |', '| --- | --- | --- | --- | --- |');
for (const c of campaigns) lines.push(`| ${c.name} | ${c.coreVsPi.pairs} | ${percent(c.coreVsPi.costChange)} | ${percent(c.coreVsPi.callChange)} | ${percent(c.coreVsPi.tokenChange)} |`);
lines.push('', 'Negative means lower than baseline. Costs are API-equivalent estimates, not subscription invoices. Cache warmth is not fully controlled; small samples and successful-pair selection prohibit a general superiority claim.', '',
  '## Watcher behavior', '', '| Campaign | Variant | Accepted / attempted | Watcher calls | Injections | Planned candidates skipped | Clean cost pairs vs core | Cost change vs core |', '| --- | --- | --- | --- | --- | --- | --- | --- |');
for (const c of campaigns) for (const arm of c.arms.filter(a => !['pi', 'core'].includes(a.variant))) lines.push(`| ${c.name} | ${arm.variant} | ${arm.passed}/${arm.attempted} | ${arm.calls} | ${arm.injections} | ${arm.plannedReadsSkipped} | ${arm.vsCore.pairs} | ${percent(arm.vsCore.costChange)} |`);
lines.push('', 'A watcher call often selected a file already named in the current read program. The gated Jev variant suppresses those calls. When it makes zero calls, its results do not establish Jev decision quality; it effectively behaves like core. No watcher accuracy advantage has been demonstrated on this easy task set.', '',
  'Gemma 4 26B A4B free remained HTTP 429 during availability checks, so no comparative coding-performance result is claimed for it. Both NVIDIA free endpoints worked with the corrected OpenRouter key.', '',
  '## Spend and storage', '',
  `Jev known usage-based estimate across smoke and coding runs: $${knownJevUsd.toFixed(6)}. Unknown Jev call costs: ${jevCostMissing}. Conservative ledger reserves: $${ledger.reservedUsd.toFixed(2)} / $${ledger.limitUsd.toFixed(2)}. Reserves are not measured spend.`, '',
  `Recorded coding attempts including integration/debugging: ${totalRuns}. Current free disk: ${report.diskFreeGiB.toFixed(2)} GiB. Dependencies are about 112 MB; no model weights or container images were downloaded.`, '',
  '## Recommendation', '',
  'Keep the core bundle as the next baseline. Keep learned watchers experimental and gated. The next useful experiment needs larger real-repository tasks with genuinely uncertain retrieval, repeated trials, and independent acceptance; these fixtures are too easy to establish an accuracy moat.', '',
  '## Evidence', '',
  '- [Pilot report](pilot-low-v3.md)', '- [Held-out report](holdout-low-v3.md)', '- [Protocol](../docs/EXPERIMENT.md)',
  '- Frozen source, manifests, task states, events and verification remain under ignored `.suffice/runs/` on this machine. Credentials and raw local evidence are not included in these aggregate reports.', '');
await mkdir(resolve(root, 'reports'), { recursive: true });
await writeFile(resolve(root, 'reports/RESULTS.json'), JSON.stringify(report, null, 2));
await writeFile(resolve(root, 'reports/RESULTS.md'), lines.join('\n'));
console.log(JSON.stringify(report, null, 2));
