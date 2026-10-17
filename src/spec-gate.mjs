import { writeFile } from 'node:fs/promises';
import { runNodeTests } from './workspace.mjs';

const ALLOWED_IMPORTS = new Set(['node:test', 'node:assert/strict', 'node:assert', 'node:module', 'node:path']);
// Static screen for a model-written spec test. The node --permission sandbox in runNodeTests is the real boundary.
export function validateSpecSource(source) {
  if (typeof source !== 'string' || source.length < 40 || source.length > 12000) return { valid: false, reason: 'size' };
  for (const m of source.matchAll(/\bimport\s+(?:[^'"]*?from\s*)?['"]([^'"]+)['"]/g)) if (!ALLOWED_IMPORTS.has(m[1])) return { valid: false, reason: `import:${m[1]}` };
  if (/\bimport\s*\(|\bprocess\.(?!env\.SUFFICE_WORKSPACE)/.test(source)) return { valid: false, reason: 'dynamic_or_process' };
  const names = [...source.matchAll(/\btest\(\s*['"]([^'"]+)['"]/g)].map(m => m[1]);
  if (!names.length || names.length > 12 || new Set(names).size !== names.length) return { valid: false, reason: 'test_count' };
  if (!/assert/.test(source)) return { valid: false, reason: 'no_assert' };
  return { valid: true, tests: names.length };
}
// A spec is usable only if the ORIGINAL code fails it by assertion (not a crash or syntax error).
export async function gateSpec({ source, specPath, baseline, candidate }) {
  const screen = validateSpecSource(source);
  if (!screen.valid) return { usable: false, reason: screen.reason };
  await writeFile(specPath, source);
  const before = await runNodeTests(baseline, specPath);
  if (before.status !== 'failed' || !before.stdout.includes('ERR_ASSERTION')) return { usable: false, reason: 'baseline_not_assertion_failure', before: before.status };
  if (!candidate) return { usable: true, before: before.status };
  const after = await runNodeTests(candidate, specPath);
  return { usable: true, before: before.status, after: after.status, accepted: after.status === 'passed' };
}
// shortcut: smallest diff may favour special-casing; fine while the spec, not the diff, is the real filter.
// Pick among parallel attempts. Attempts failing the spec are never chosen; ties go to the smallest diff then lowest index.
// Returns { chosen: index|null, reason }. null means escalate.
export function selectAttempt(attempts) {
  const ok = attempts.map((a, index) => ({ ...a, index })).filter(a => a.status === 'completed' && a.specAccepted && a.visiblePassed);
  if (!ok.length) return { chosen: null, reason: 'no_attempt_passed_spec' };
  ok.sort((a, b) => (Number.isFinite(a.diffLines) ? a.diffLines : Infinity) - (Number.isFinite(b.diffLines) ? b.diffLines : Infinity) || a.index - b.index);
  return { chosen: ok[0].index, reason: ok.length > 1 ? 'smallest_diff_among_survivors' : 'single_survivor' };
}
