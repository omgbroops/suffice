import { mkdir, writeFile, cp, readFile, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { realTasks } from '../benchmarks/real/tasks.mjs';
import { stateDir, root } from '../src/runtime.mjs';
import { filesIn, hash, runNodeTests } from '../src/workspace.mjs';
// Pinned npm tarballs (sha256 of .tgz). Reference = the index.js change of path-to-regexp@0.1.13 (reset `backtrack` after a wildcard/param) applied to 0.1.12.
const t = {
  id: 'path-to-regexp-425', base: ['0.1.12', '03ff17fabc974d4f8a925039353c3c2f954020c9c4402a7178c7d1e3f36c50b4'],
  fix: ['0.1.13', '17e169761622800a26cea5817e5b5078067122aab7996de8525014b771fa1db2'], referenceFile: 'index.js',
  issue: 'https://github.com/pillarjs/path-to-regexp/pull/425',
  edits: [["      if (match === '*') {\n", "      if (match === '*') {\n        backtrack = '';\n"],
    ['      extraOffset += result.length - match.length;\n\n      return result;', "      backtrack = '';\n      extraOffset += result.length - match.length;\n\n      return result;"]],
};
const unpack = async ([v, sha]) => {
  const dir = resolve(tmpdir(), `path-to-regexp-${v}-${process.pid}`);
  await mkdir(dir, { recursive: true });
  const p = spawnSync('npm', ['pack', `path-to-regexp@${v}`, '--silent'], { cwd: dir, encoding: 'utf8' });
  if (p.status !== 0) throw new Error(`npm pack failed: ${p.stderr}`);
  const tgz = resolve(dir, `path-to-regexp-${v}.tgz`);
  if (hash(await readFile(tgz)) !== sha) throw new Error(`checksum mismatch for path-to-regexp@${v}`);
  if (spawnSync('tar', ['-xzf', tgz, '-C', dir]).status !== 0) throw new Error('tar failed');
  return resolve(dir, 'package');
};
t.prompt = realTasks.find(r => r.id === t.id).prompt;
const taskDir = resolve(stateDir, 'real-tasks', t.id), ws = resolve(taskDir, 'workspace'), ref = resolve(taskDir, 'reference');
await rm(taskDir, { recursive: true, force: true });
await unpack(t.fix); // verify the fix tarball pin too
const base = await unpack(t.base);
await mkdir(resolve(ws, 'tests'), { recursive: true });
await cp(base, resolve(ws, 'src'), { recursive: true });
await cp(resolve(root, 'benchmarks/real/path-to-regexp-visible.test.mjs'), resolve(ws, 'tests/visible.test.mjs'));
await writeFile(resolve(ws, 'README.md'), `# path-to-regexp repair task\n\n${t.prompt}\n\nThe upstream package is under src/. Only production JavaScript under src may be edited. The provided test tool runs a small smoke suite; hidden acceptance is evaluated separately. No dependency installation is needed.\n`);
await cp(ws, ref, { recursive: true });
const target = resolve(ref, 'src', t.referenceFile);
let text = await readFile(target, 'utf8');
for (const [from, to] of t.edits) { if (text.split(from).length !== 2) throw new Error('edit anchor not unique'); text = text.replace(from, () => to); }
await writeFile(target, text);
const acc = resolve(root, `benchmarks/real/${t.id}.test.mjs`), vis = resolve(ws, 'tests/visible.test.mjs');
const r = { baseline: await runNodeTests(ws, acc), reference: await runNodeTests(ref, acc), regression: await runNodeTests(ws, vis), referenceRegression: await runNodeTests(ref, vis) };
console.log(JSON.stringify({ task: t.id, ...Object.fromEntries(Object.entries(r).map(([k, v]) => [k, v.status])) }));
const sourceFiles = (await filesIn(ws)).filter(p => p === 'src/index.js');
await writeFile(resolve(taskDir, 'validation.json'), JSON.stringify({ task: t.id, ...t, sourceFiles, ...r }, null, 2));
if (r.baseline.status !== 'failed' || r.reference.status !== 'passed' || r.regression.status !== 'passed' || r.referenceRegression.status !== 'passed') throw new Error(`Invalid task ${t.id}`);
