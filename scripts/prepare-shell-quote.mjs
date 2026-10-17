import { mkdir, writeFile, cp, readFile, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { realTasks } from '../benchmarks/real/tasks.mjs';
import { stateDir, root } from '../src/runtime.mjs';
import { filesIn, hash, runNodeTests } from '../src/workspace.mjs';
// Pinned npm tarballs (sha256 of .tgz). Reference = the quote.js change of shell-quote@1.8.3 (PR #20) applied to 1.8.2.
const t = {
  id: 'shell-quote-15', base: ['1.8.2', '636555ce1352c29d5e0a8c47a0f0143cdfd0eab9a35e5d12ab2913a879341e0c'],
  fix: ['1.8.3', 'df640b354baf8e2823d6c72a2e50951537e04b73079bd7418cf93d89507e22c1'], referenceFile: 'quote.js',
  issue: 'https://github.com/ljharb/shell-quote/issues/15',
  edits: [['/["\\s]/).test(s) && !', '/["\\s\\\\]/).test(s) && !'], ["s.replace(/(['\\\\])/g", "s.replace(/(['])/g"]],
};
const unpack = async ([v, sha]) => {
  const dir = resolve(tmpdir(), `shell-quote-${v}-${process.pid}`);
  await mkdir(dir, { recursive: true });
  const p = spawnSync('npm', ['pack', `shell-quote@${v}`, '--silent'], { cwd: dir, encoding: 'utf8' });
  if (p.status !== 0) throw new Error(`npm pack failed: ${p.stderr}`);
  const tgz = resolve(dir, `shell-quote-${v}.tgz`);
  if (hash(await readFile(tgz)) !== sha) throw new Error(`checksum mismatch for shell-quote@${v}`);
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
await cp(resolve(root, 'benchmarks/real/shell-quote-visible.test.mjs'), resolve(ws, 'tests/visible.test.mjs'));
await writeFile(resolve(ws, 'README.md'), `# shell-quote repair task\n\n${t.prompt}\n\nThe upstream package is under src/. Only production JavaScript under src may be edited. The provided test tool runs a small smoke suite; hidden acceptance is evaluated separately. No dependency installation is needed.\n`);
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
