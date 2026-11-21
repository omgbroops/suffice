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
  'ipaddr.js-2.1.0': 'eeca255856ecee09907399b625a24983b402e90d98c8859d40c49948cbf22fcc',
  'ipaddr.js-2.2.0': 'effc21a40acab3802e61b4a869821eef549d4d9bd5a6ad6f643bacaaf11aa71a',
  'negotiator-0.6.3': '912e687ba0f7e94f8e323e29e307db4a1838629399ff635412ae2a5d39765213',
  'negotiator-0.6.4': '8fc72d4030ac7b0d4c51933a19224d72bebab8d51da196cb863f754cd772b210',
  'path-to-regexp-8.0.0': '7bffbeb806727d6f9782e272524120277f299e70d9aad331fb7cb71cbd826cde',
  'path-to-regexp-8.2.0': '752ec99c78a3081ed355e80536335316b4ba2b3ebfcee2c8ff92a4f2d36979dc',
  'shell-quote-1.8.1': '556ccc57c32983fe4c1c593817b86ef8aa66ab5d11e3bd43bd8b9750cb18bf0d',
  'shell-quote-1.8.3': 'df640b354baf8e2823d6c72a2e50951537e04b73079bd7418cf93d89507e22c1',
};
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
for (const t of longTasks.filter(t => !only || t.id === only)) {
  const taskDir = resolve(stateDir, 'real-tasks', t.id), ws = resolve(taskDir, 'workspace'), ref = resolve(taskDir, 'reference');
  try {
    const prior = JSON.parse(await readFile(resolve(taskDir, 'validation.json'), 'utf8'));
    if (prior.baseline?.status === 'failed' && prior.reference?.status === 'passed' && prior.regression?.status === 'passed' && prior.referenceRegression?.status === 'passed') {
      console.log(JSON.stringify({ task: t.id, skipped: 'workspace validated' })); continue;
    }
  } catch {}
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
