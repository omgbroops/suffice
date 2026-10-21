#!/usr/bin/env node
// Dry run: each manifest task against the untouched stub (expect not pass) and the reference solution (expect pass).
// No model calls. Usage: node scripts/v4-dryrun.mjs [taskId]   (one task per run keeps each process short)
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyReference, prepWorkspace, runAcceptance } from '../src/v4-polyglot.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const manifest = JSON.parse(await readFile(join(here, '..', 'config', 'bench-manifest.polyglot.json'), 'utf8'));
const only = process.argv[2];
const notes = [];

console.log('| task | lang | stub-result | reference-result |');
console.log('|---|---|---|---|');
for (const task of manifest) {
  if (only && task.taskId !== only) continue;
  const stub = await prepWorkspace(task);
  let s;
  try { s = await runAcceptance(stub); } finally { await stub.cleanup(); }
  const ref = await prepWorkspace(task);
  let r;
  try {
    await applyReference(task, ref.dir);
    r = await runAcceptance(ref);
  } finally { await ref.cleanup(); }
  console.log(`| ${task.taskId} | ${task.lang} | ${s.kind} | ${r.kind} |`);
  for (const [label, res] of [['stub', s], ['reference', r]]) {
    if (res.kind === 'toolchain_missing' || res.kind === 'timeout') notes.push(`- ${task.taskId} ${label}: ${res.kind}: ${res.output.split('\n').slice(-3).join(' / ')}`);
  }
}
if (notes.length) console.log('\nNotes:\n' + notes.join('\n'));
