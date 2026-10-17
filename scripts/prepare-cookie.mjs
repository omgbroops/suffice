import { mkdir, writeFile, cp, readFile, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { realTasks } from '../benchmarks/real/tasks.mjs';
import { stateDir, root } from '../src/runtime.mjs';
import { filesIn, hash, runNodeTests } from '../src/workspace.mjs';
// Pinned npm tarballs (sha256 of .tgz). Reference = the domainValueRegExp line of cookie@0.7.1 applied to 0.7.0.
const t = {
  id: 'cookie-173', base: ['0.7.0', 'd02bba3011c277fa35aa803c2739cf7b7abc08068e3c157ca6504c548a1c4ab8'],
  fix: ['0.7.1', '1769b3f6233f6e363120f30cc8eeea5831a870a5b50d0329a1babe0a5cbf52fd'], referenceFile: 'index.js',
  issue: 'https://github.com/jshttp/cookie/issues/173',
  edits: [['var domainValueRegExp = /^([a-z0-9](', 'var domainValueRegExp = /^([.]?[a-z0-9](']],
};
const unpack = async ([v, sha]) => {
  const dir = resolve(tmpdir(), `cookie-${v}-${process.pid}`);
  await mkdir(dir, { recursive: true });
  const p = spawnSync('npm', ['pack', `cookie@${v}`, '--silent'], { cwd: dir, encoding: 'utf8' });
  if (p.status !== 0) throw new Error(`npm pack failed: ${p.stderr}`);
  const tgz = resolve(dir, `cookie-${v}.tgz`);
  if (hash(await readFile(tgz)) !== sha) throw new Error(`checksum mismatch for cookie@${v}`);
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
await cp(resolve(root, 'benchmarks/real/cookie-visible.test.mjs'), resolve(ws, 'tests/visible.test.mjs'));
await writeFile(resolve(ws, 'README.md'), `# cookie repair task\n\n${t.prompt}\n\nThe upstream package is under src/. Only production JavaScript under src may be edited. The provided test tool runs a small smoke suite; hidden acceptance is evaluated separately. No dependency installation is needed.\n`);
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
