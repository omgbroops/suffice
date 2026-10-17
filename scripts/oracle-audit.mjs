// Oracle audit: replay every (input, pattern, expected) assert in a hidden test against an independent engine (bash glob).
// Disagreement = the assert encodes picomatch-specific or ambiguous semantics, so a correct alternative fix could fail it.
// Usage: node scripts/oracle-audit.mjs <hidden-test.mjs>   (only plain isMatch(x,p) asserts without options are checked)
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
const src = await readFile(process.argv[2], 'utf8');
const re = /(!?)isMatch\(\s*'((?:[^'\\]|\\.)*)'\s*,\s*'((?:[^'\\]|\\.)*)'\s*\)/g;
const un = s => s.replace(/\\(.)/g, '$1');
const sq = s => `'${s.replace(/'/g, `'\\''`)}'`;
const rows = [];
for (const [, neg, i, p] of src.matchAll(re)) {
  const expected = neg !== '!';
  const r = spawnSync('bash', ['-c', `shopt -s extglob; [[ ${sq(un(i))} == ${un(p)} ]]`]);
  rows.push({ input: un(i), pattern: un(p), expected, bash: r.status === 0 });
}
const dis = rows.filter(r => r.expected !== r.bash);
const calls = (src.match(/isMatch\(/g) ?? []).length; // option/variable/double-quoted asserts are not replayed
console.log(JSON.stringify({ checked: rows.length, skipped: calls - rows.length, disagree: dis.length, dis }, null, 1));
