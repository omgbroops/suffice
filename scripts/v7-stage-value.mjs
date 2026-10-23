#!/usr/bin/env node
// Usage: node scripts/v7-stage-value.mjs <results.jsonl>
// Reads v7 rows. Each check record is { checkpoint, check, flagged, hiddenPass, costUsd }; hidden verdicts are logging only.
import { readFileSync } from 'node:fs';

const file = process.argv[2];
if (!file) { console.error('usage: node scripts/v7-stage-value.mjs <results.jsonl>'); process.exit(2); }

const rows = readFileSync(file, 'utf8').split('\n').filter(Boolean).map(line => JSON.parse(line)).filter(r => r.variant === 'v7');
const byCheck = new Map();
const bump = (name) => {
  if (!byCheck.has(name)) byCheck.set(name, { caught: 0, falseAlarms: 0, missed: 0, costUsd: 0 });
  return byCheck.get(name);
};

let totalCost = 0;
let finalPasses = 0;
let agree = 0;
let selfPassHiddenFail = 0;
let selfFailHiddenPass = 0;
for (const r of rows) {
  totalCost += Number(r.costUsd) || 0;
  if (r.finalPass) finalPasses += 1;
  const self = Boolean(r.selfFinalPass);
  const hidden = Boolean(r.finalPass);
  if (self === hidden) agree += 1;
  if (self && !hidden) selfPassHiddenFail += 1;
  if (!self && hidden) selfFailHiddenPass += 1;
  for (const c of r.checks ?? []) {
    const t = bump(c.check);
    if (c.flagged && !c.hiddenPass) t.caught += 1;
    else if (c.flagged && c.hiddenPass) t.falseAlarms += 1;
    else if (!c.flagged && !c.hiddenPass) t.missed += 1;
    t.costUsd += Number(c.costUsd) || 0;
  }
}

const money = n => `$${n.toFixed(4)}`;
const pad = (s, w) => String(s).padEnd(w);
console.log(`rows: ${rows.length}`);
console.log(`overall pass (hidden): ${finalPasses}/${rows.length}`);
console.log(`selfFinalPass vs finalPass agree: ${agree}/${rows.length} (self pass & hidden fail: ${selfPassHiddenFail}, self fail & hidden pass: ${selfFailHiddenPass})`);
console.log(`total cost: ${money(totalCost)}`);
console.log('');
console.log(`${pad('check', 10)}${pad('caught', 8)}${pad('false alarms', 14)}${pad('missed', 8)}cost`);
for (const [name, t] of [...byCheck].sort()) {
  console.log(`${pad(name, 10)}${pad(t.caught, 8)}${pad(t.falseAlarms, 14)}${pad(t.missed, 8)}${money(t.costUsd)}`);
}
