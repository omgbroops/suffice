// Location control: score each in-repo workspace in place and as a copy under realpath(tmpdir()); discordance = scoring artifact.
import { cpSync, mkdtempSync, readdirSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { stateDir } from '../src/runtime.mjs';
import { runNodeTests } from '../src/workspace.mjs';
const acc = resolve(import.meta.dirname, '../benchmarks/real/path-to-regexp-425.test.mjs'), root = resolve(stateDir, 'tmp');
const score = async ws => (await runNodeTests(ws, acc)).status === 'passed';
const tally = { 'in/in': 0, 'in/out': 0, 'fail/fail': 0, 'fail/pass': 0 };
for (const d of readdirSync(root).filter(d => d.startsWith('var-')).slice(0, +(process.argv[2] ?? 40))) {
  const ws = resolve(root, d), copy = mkdtempSync(resolve(realpathSync(tmpdir()), 'rs-'));
  cpSync(ws, copy, { recursive: true });
  const a = await score(ws), b = await score(copy); rmSync(copy, { recursive: true });
  tally[a ? (b ? 'in/in' : 'in/out') : (b ? 'fail/pass' : 'fail/fail')]++;
}
console.log(tally); // in/in: pass both; in/out: pass in-repo only; fail/pass: fail in-repo, pass in /tmp (scoring artifact)
