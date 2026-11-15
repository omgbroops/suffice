import {mkdtemp, mkdir, writeFile, symlink, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import os from 'node:os';
import {resolve, join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {performance} from 'node:perf_hooks';
import {spawnSync} from 'node:child_process';

const args = Object.fromEntries(process.argv.slice(2).map(x => { const i = x.indexOf('='); if (!x.startsWith('--') || i < 0) throw new Error('Use --root=PATH --output=PATH [--runs=N]'); return [x.slice(2, i), x.slice(i + 1)]; }));
if (!args.root || !args.output) throw new Error('Use --root=PATH --output=PATH [--runs=N]');
const root = resolve(args.root), output = resolve(args.output), runs = Number(args.runs ?? 5);
if (!Number.isInteger(runs) || runs < 1 || runs > 100) throw new Error('runs must be an integer from 1 to 100');
const {filesIn} = await import(pathToFileURL(join(root, 'packages/cli/src/workspace.mjs')).href);
const fixture = await mkdtemp(join(tmpdir(), 'suffice-walk-baseline-'));
try {
  for (let d = 0; d < 600; d++) {
    const dir = join(fixture, `dir-${String(d).padStart(4, '0')}`); await mkdir(dir);
    await Promise.all(Array.from({length: 16}, (_, f) => writeFile(join(dir, `file-${String(f).padStart(2, '0')}.txt`), `fixture ${d} ${f}\n`)));
  }
  await mkdir(join(fixture, '.hidden')); await writeFile(join(fixture, '.hidden', 'excluded.txt'), 'hidden\n');
  await mkdir(join(fixture, 'node_modules')); await writeFile(join(fixture, 'node_modules', 'excluded.txt'), 'excluded\n');
  let symlinkCreated = false;
  try { await symlink(join(fixture, 'dir-0000'), join(fixture, 'linked-dir'), process.platform === 'win32' ? 'junction' : 'dir'); symlinkCreated = true; }
  catch (e) { if (!['EPERM', 'EACCES', 'ENOTSUP'].includes(e.code)) throw e; }
  const verify = files => { if (files.length !== 9600 || files.some(x => x.startsWith('.') || x.startsWith('node_modules/') || x.startsWith('linked-dir/'))) throw new Error('Fixture traversal produced unexpected entries'); };
  verify(await filesIn(fixture)); // warmup, excluded from samples
  const walkMs = [];
  for (let i = 0; i < runs; i++) { const start = performance.now(); const files = await filesIn(fixture); walkMs.push(performance.now() - start); verify(files); }
  const cliMs = [], cliOutput = [];
  for (let i = 0; i < runs; i++) { const start = performance.now(); const child = spawnSync(process.execPath, [join(root, 'packages/cli/bin/suffice.mjs'), '--version'], {encoding:'utf8', timeout:30000, windowsHide:true}); cliMs.push(performance.now() - start); if (child.error || child.status !== 0) throw child.error ?? new Error(`CLI exited ${child.status}: ${child.stderr}`); cliOutput.push(child.stdout.trim()); }
  const result = {schema:1, generatedAt:new Date().toISOString(), root, node:process.version, platform:process.platform, arch:process.arch, osRelease:os.release(), cpu:os.cpus()[0]?.model, fixture:{directories:600, files:9600, symlinkCreated}, runs, warmWalkMs:walkMs, coldCliVersionMs:cliMs, cliOutput};
  await writeFile(output, JSON.stringify(result, null, 2) + '\n', {flag:'wx'});
  console.log(`Wrote ${output}`);
} finally { await rm(fixture, {recursive:true, force:true}); }
