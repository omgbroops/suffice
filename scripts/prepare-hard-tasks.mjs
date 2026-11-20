import { mkdir, writeFile, cp, readFile, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { hardTasks } from '../benchmarks/real-hard/tasks.mjs';
import { stateDir, root } from '../src/runtime.mjs';
import { filesIn, runNodeTests } from '../src/workspace.mjs';
import { createHash } from 'node:crypto';
const sha = buf => createHash('sha256').update(buf).digest('hex');
// sha256 of the pinned npm tarballs.
const tarballs = {
  'qs-6.13.0': 'abffeabbdedc8e466c1bd75227e14ceb76e77f61be475dfcee0d3bbe6dd608fd',
  'qs-6.14.0': '308840dee22931d8457dfc2442a5c34019f0461815164ee3929be7ae73f54a9b',
  'negotiator-0.6.3': '912e687ba0f7e94f8e323e29e307db4a1838629399ff635412ae2a5d39765213',
  'negotiator-0.6.4': '8fc72d4030ac7b0d4c51933a19224d72bebab8d51da196cb863f754cd772b210',
  'ini-4.1.2': 'f4177e3508b981ce89cc0d5ca1f16b68afec2d5751507ef9e4676aa899e5f946',
  'ini-4.1.3': '7d57098bd35f8c42f8ca90a61b37045c4f51d1a59fa34005f7e625722ecafeaf',
  'cookie-0.7.1': '1769b3f6233f6e363120f30cc8eeea5831a870a5b50d0329a1babe0a5cbf52fd',
  'cookie-0.7.2': '76b160f8251c630a116a2e0acf03557b0758975b2c0df800607248fc9aae9e20',
  'ipaddr.js-2.1.0': 'eeca255856ecee09907399b625a24983b402e90d98c8859d40c49948cbf22fcc',
  'ipaddr.js-2.2.0': 'effc21a40acab3802e61b4a869821eef549d4d9bd5a6ad6f643bacaaf11aa71a',
  'path-to-regexp-8.0.0': '7bffbeb806727d6f9782e272524120277f299e70d9aad331fb7cb71cbd826cde',
  'path-to-regexp-8.2.0': '752ec99c78a3081ed355e80536335316b4ba2b3ebfcee2c8ff92a4f2d36979dc',
  'content-disposition-0.5.4': 'e494c8a7b68ac22ca1ea01e004e937e6fdfc696bc80d719664da43bc4b365452',
  'content-disposition-1.0.0': '15367625132a0b736d0d89479a08a2a80b37c2046e5606f90df72c963f2fe88f',
  'braces-3.0.2': '735881928fd4cf6e0c469c7ec6f66f49133563b840ef2f6c6098943a4250eace',
  'braces-3.0.3': '1cd18e862c8640b4568b1425a7df4ee030ff201d45b2da8f9f222d2987494ffc',
  'shell-quote-1.8.1': '556ccc57c32983fe4c1c593817b86ef8aa66ab5d11e3bd43bd8b9750cb18bf0d',
  'shell-quote-1.8.3': 'df640b354baf8e2823d6c72a2e50951537e04b73079bd7418cf93d89507e22c1',
  'express-4.19.2': '1b18c90e7e9fc4cb3e4dfe6b5f11c21b85509162e88ca5c6b63b9c6b5ca085bf',
  'express-4.21.2': 'fc43a91e7dc7affb53c6ad7123a4f35485ed3c45226ae7a3847b7738e783e008',
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
for (const t of hardTasks.filter(t => !only || t.id === only)) {
  const taskDir = resolve(stateDir, 'real-tasks', t.id), ws = resolve(taskDir, 'workspace'), ref = resolve(taskDir, 'reference');
  await rm(taskDir, { recursive: true, force: true });
  const base = await unpack(t.pkg, t.base), fix = await unpack(t.pkg, t.fix);
  await mkdir(resolve(ws, 'tests'), { recursive: true });
  await cp(base, resolve(ws, 'src'), { recursive: true });
  await cp(resolve(root, 'benchmarks/real-hard/hard-visible.test.mjs'), resolve(ws, 'tests/visible.test.mjs'));
  await writeFile(resolve(ws, 'README.md'), `# ${t.pkg} repair task\n\n${t.prompt}\n\nThe upstream package is under src/. Only production files under src may be edited; dependencies are already installed under src/node_modules. The provided test tool runs a small smoke suite; hidden acceptance is evaluated separately.\n`);
  await cp(ws, ref, { recursive: true });
  await cp(resolve(fix, '.'), resolve(ref, 'src'), { recursive: true });
  // Install declared dependencies into src/ for both trees (--ignore-scripts:
  // package prepare scripts like tsc --build can delete shipped dist output).
  for (const dir of [resolve(ws, 'src'), resolve(ref, 'src')]) {
    const depCount = Object.keys(JSON.parse(await readFile(resolve(dir, 'package.json'), 'utf8')).dependencies ?? {}).length;
    if (depCount) {
      const inst = spawnSync('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund', '--silent'], { cwd: dir, encoding: 'utf8' });
      if (inst.status !== 0) throw new Error(`npm install failed for ${t.id}: ${inst.stderr.slice(0, 400)}`);
    }
  }
  const acc = resolve(root, `benchmarks/real-hard/${t.id}.test.mjs`), vis = resolve(ws, 'tests/visible.test.mjs');
  const r = { baseline: await runNodeTests(ws, acc), reference: await runNodeTests(ref, acc), regression: await runNodeTests(ws, vis), referenceRegression: await runNodeTests(ref, vis) };
  const s = Object.fromEntries(Object.entries(r).map(([k, v]) => [k, v.status]));
  console.log(JSON.stringify({ task: t.id, ...s }));
  const sourceFiles = await filesIn(ws);
  await writeFile(resolve(taskDir, 'validation.json'), JSON.stringify({ task: t.id, ...t, sourceFiles, ...r }, null, 2));
  if (s.baseline !== 'failed' || s.reference !== 'passed' || s.regression !== 'passed' || s.referenceRegression !== 'passed') throw new Error(`Invalid task ${t.id}`);
}
