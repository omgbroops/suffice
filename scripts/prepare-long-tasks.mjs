import { mkdir, writeFile, cp, readFile, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { longTasks } from '../benchmarks/real-long/tasks.mjs';
import { stateDir, root } from '../src/runtime.mjs';
import { filesIn, runNodeTests } from '../src/workspace.mjs';
import { createHash } from 'node:crypto';
const sha = buf => createHash('sha256').update(buf).digest('hex');
const tarballs = {
  'qs-6.11.2': 'bc7951d5eb3a27595ca90925d642074910d3627910249489f78f1dc01f8036b7',
  'qs-6.14.0': '308840dee22931d8457dfc2442a5c34019f0461815164ee3929be7ae73f54a9b',
  'cookie-0.5.0': '57895adc607e57b8824715e41537f7f84b06baac73be4fb2ec8212d5eeafd756',
  'cookie-0.7.2': '76b160f8251c630a116a2e0acf03557b0758975b2c0df800607248fc9aae9e20',
  'express-4.17.3': '2a5414ee2204cfb71d2cab0ade734d5e0af5b45919158e818c4b8683c272ec2b',
  'express-4.21.2': 'fc43a91e7dc7affb53c6ad7123a4f35485ed3c45226ae7a3847b7738e783e008',
};
const newTasks = ['qs-611-long', 'cookie-050-long', 'express-417-long'];
const only = process.argv[2];
const unpack = async (pkg, v) => {
  const dir = resolve(tmpdir(), `prep-${pkg}-${v}-${process.pid}`);
  await mkdir(dir, { recursive: true });
  const p = spawnSync('npm', ['pack', `${pkg}@${v}`, '--silent'], { cwd: dir, encoding: 'utf8' });
  if (p.status !== 0) throw new Error(`npm pack failed: ${p.stderr}`);
  const tgz = resolve(dir, `${pkg}-${v}.tgz`);
  if (sha(await readFile(tgz)) !== tarballs[`${pkg}-${v}`]) throw new Error(`checksum mismatch for ${pkg}@${v}`);
  if (spawnSync('tar', ['-xzf', tgz, '-C', dir]).status !== 0) throw new Error('tar failed');
  return resolve(dir, 'package');
};
for (const t of longTasks.filter(t => newTasks.includes(t.id) && (!only || t.id === only))) {
  const taskDir = resolve(stateDir, 'real-tasks', t.id), ws = resolve(taskDir, 'workspace'), ref = resolve(taskDir, 'reference');
  await rm(taskDir, { recursive: true, force: true });
  const base = await unpack(t.pkg, t.base), fix = await unpack(t.pkg, t.fix);
  await mkdir(resolve(ws, 'tests'), { recursive: true });
  await cp(base, resolve(ws, 'src'), { recursive: true });
  await cp(resolve(root, 'benchmarks/real-hard/hard-visible.test.mjs'), resolve(ws, 'tests/visible.test.mjs'));
  await writeFile(resolve(ws, 'README.md'), `# ${t.pkg} repair task\n\n${t.prompt}\n\nThe upstream package is under src/. Only production files under src may be edited; dependencies are already installed under src/node_modules. The provided test tool runs a small smoke suite; hidden acceptance is evaluated separately.\n`);
  await cp(ws, ref, { recursive: true });
  await cp(resolve(fix, '.'), resolve(ref, 'src'), { recursive: true });
  for (const dir of [resolve(ws, 'src'), resolve(ref, 'src')]) {
    const depCount = Object.keys(JSON.parse(await readFile(resolve(dir, 'package.json'), 'utf8')).dependencies ?? {}).length;
    if (depCount) {
      const inst = spawnSync('npm', ['install', '--ignore-scripts', '--package-lock=false', '--no-audit', '--no-fund', '--silent'], { cwd: dir, encoding: 'utf8' });
      if (inst.status !== 0) throw new Error(`npm install failed for ${t.id}: ${inst.stderr.slice(0, 400)}`);
    }
  }
  const acc = resolve(root, `benchmarks/real-long/${t.id}.test.mjs`), vis = resolve(ws, 'tests/visible.test.mjs');
  const r = { baseline: await runNodeTests(ws, acc), reference: await runNodeTests(ref, acc), regression: await runNodeTests(ws, vis), referenceRegression: await runNodeTests(ref, vis) };
  const s = Object.fromEntries(Object.entries(r).map(([k, v]) => [k, v.status]));
  console.log(JSON.stringify({ task: t.id, ...s }));
  const sourceFiles = await filesIn(ws);
  await writeFile(resolve(taskDir, 'validation.json'), JSON.stringify({ task: t.id, ...t, sourceFiles, ...r }, null, 2));
  if (s.baseline !== 'failed' || s.reference !== 'passed' || s.regression !== 'passed' || s.referenceRegression !== 'passed') throw new Error(`Invalid task ${t.id}`);
}
