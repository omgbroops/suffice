// Public historical development replays only; never imports or runs acceptance suites.
import {readFile, writeFile, mkdir} from 'node:fs/promises';
import {resolve, dirname, relative, sep, posix} from 'node:path';
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import {runInNewContext} from 'node:vm';
import {spawnSync} from 'node:child_process';
import {realTasks, baseRevision} from '../benchmarks/real/tasks.mjs';
import {efficiencyTasks} from '../benchmarks/efficiency/tasks.mjs';
import {workflowTasks} from '../benchmarks/workflow/tasks.mjs';
import {captureTree, treeHash, protectedFiles} from '../src/v9/workspace.mjs';
import {normalizeRequest} from '../src/v10/config.mjs';

const repo = resolve(import.meta.dirname, '..');
const output = resolve(process.argv[2] || resolve(repo, '.suffice/v10-native15-20261023'));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const json = value => JSON.stringify(value, null, 2) + '\n';
const excluded = new Set(['prerelease-subset', 'build-metadata', 'shell-quote-15']);
const sources = {
  'picomatch-142': {package: 'picomatch', version: '4.0.6', sha256: '0e784763c1045e98a02a258e8678dd985a41ea3f4890b1180002ae2bf26237ac'},
  'picomatch-99': {package: 'picomatch', version: '4.0.7', sha256: '697b463be3cdbd9ffc8f4194fd5019a69ddf95875fb703d78b2b115cc9e740a8'},
  'picomatch-187': {package: 'picomatch', version: '4.0.7', sha256: '697b463be3cdbd9ffc8f4194fd5019a69ddf95875fb703d78b2b115cc9e740a8'},
  'picomatch-202': {package: 'picomatch', version: '4.0.7', sha256: '697b463be3cdbd9ffc8f4194fd5019a69ddf95875fb703d78b2b115cc9e740a8'},
  'bytes-51': {package: 'bytes', version: '3.1.0', sha256: 'f7d93a3df7a62e19b6853ef0d6999b5f50122475b951bbfd09c2c56fb9e00cf0'},
  'cookie-173': {package: 'cookie', version: '0.7.0', sha256: 'd02bba3011c277fa35aa803c2739cf7b7abc08068e3c157ca6504c548a1c4ab8'},
  'path-to-regexp-425': {package: 'path-to-regexp', version: '0.1.12', sha256: '03ff17fabc974d4f8a925039353c3c2f954020c9c4402a7178c7d1e3f36c50b4'},
};
const semverSource = revision => ({repository: 'https://github.com/npm/node-semver', revision,
  url: `https://codeload.github.com/npm/node-semver/tar.gz/${revision}`, prefix: `node-semver-${revision}`,
  ...(revision === baseRevision ? {sha256: 'e5d07eb248ffb4f311de2be058d6266cfb0c6cbaae3689108048f1c703f88206'} : {})});
const tasks = [
  ...realTasks.filter(task => !excluded.has(task.id)).map(task => {
    const packageSource = sources[task.id];
    return {id: task.id, prompt: task.prompt, family: packageSource?.package ?? 'semver',
      source: packageSource ? {...packageSource, repository: `https://github.com/${{'picomatch': 'micromatch/picomatch', bytes: 'visionmedia/bytes.js', cookie: 'jshttp/cookie', 'path-to-regexp': 'pillarjs/path-to-regexp'}[packageSource.package]}`,
        url: `https://registry.npmjs.org/${packageSource.package}/-/${packageSource.package}-${packageSource.version}.tgz`, prefix: 'package'} : semverSource(baseRevision)};
  }),
  ...efficiencyTasks.map(({id, prompt, base}) => ({id, prompt, family: 'semver', source: semverSource(base)})),
  ...workflowTasks.map(({id, prompt, base}) => ({id, prompt, family: 'js-yaml', source: {
    repository: 'https://github.com/nodeca/js-yaml', revision: base,
    url: `https://codeload.github.com/nodeca/js-yaml/tar.gz/${base}`, prefix: `js-yaml-${base}`}})),
];
if (tasks.length !== 15 || new Set(tasks.map(task => task.id)).size !== 15) throw Error('Expected exactly 15 distinct tasks');

async function writeUnchanged(path, bytes) {
  await mkdir(dirname(path), {recursive: true});
  try { const prior = await readFile(path); if (!prior.equals(Buffer.from(bytes))) throw Error(`Refusing to replace existing file: ${path}`); }
  catch (error) { if (error.code !== 'ENOENT') throw error; await writeFile(path, bytes, {flag: 'wx'}); }
}
function safeName(name) {
  if (!name || name.includes('\\') || name.includes('\0') || name.startsWith('/') || /^[a-z]:/i.test(name) ||
      name.split('/').some(part => ['..', '.git', 'node_modules'].includes(part)) || posix.normalize(name.replace(/\/$/, '')) !== name.replace(/\/$/, '')) throw Error(`Unsafe archive member: ${name}`);
  return name;
}
function parsePax(body) {
  const fields = {};
  let offset = 0;
  while (offset < body.length) {
    const space = body.indexOf(32, offset), length = Number(body.subarray(offset, space).toString());
    if (space < offset || !Number.isSafeInteger(length) || length <= 0 || offset + length > body.length) throw Error('Invalid pax metadata');
    const entry = body.subarray(space + 1, offset + length - 1).toString(), equal = entry.indexOf('=');
    if (equal < 1) throw Error('Invalid pax field');
    fields[entry.slice(0, equal)] = entry.slice(equal + 1); offset += length;
  }
  return fields;
}
function unpackArchive(bytes, prefix) {
  const tar = gunzipSync(bytes, {maxOutputLength: 32 * 1024 * 1024});
  const files = new Map(), cases = new Set();
  let nextPax = {}, longName;
  const str = buffer => buffer.toString('utf8').replace(/\0.*$/s, '');
  for (let offset = 0; offset + 512 <= tar.length;) {
    const header = tar.subarray(offset, offset + 512); offset += 512;
    if (header.every(byte => byte === 0)) break;
    const check = Number.parseInt(str(header.subarray(148, 156)).trim() || '0', 8);
    const actual = [...header].reduce((sum, byte, index) => sum + (index >= 148 && index < 156 ? 32 : byte), 0);
    if (check !== actual) throw Error('Invalid tar header checksum');
    const size = Number.parseInt(str(header.subarray(124, 136)).trim() || '0', 8);
    if (!Number.isSafeInteger(size) || size < 0 || offset + size > tar.length) throw Error('Invalid tar entry size');
    const body = tar.subarray(offset, offset + size); offset += Math.ceil(size / 512) * 512;
    const type = String.fromCharCode(header[156] || 48);
    if (type === 'g') { parsePax(body); continue; }
    if (type === 'x') { nextPax = parsePax(body); continue; }
    if (type === 'L') { longName = str(body); continue; }
    const tarPrefix = str(header.subarray(345, 500));
    const name = safeName(nextPax.path || longName || [tarPrefix, str(header.subarray(0, 100))].filter(Boolean).join('/'));
    nextPax = {}; longName = undefined;
    if (name !== prefix && name !== prefix + '/' && !name.startsWith(prefix + '/')) throw Error('Unexpected archive root');
    if (!['0', '5'].includes(type)) throw Error(`Archive contains nonregular member (${type}): ${name}`);
    if (type === '5') continue;
    const path = name.slice(prefix.length + 1);
    safeName(path);
    if (cases.has(path.toLowerCase())) throw Error(`Duplicate or case-colliding archive member: ${path}`);
    cases.add(path.toLowerCase()); files.set(path, Buffer.from(body));
  }
  if (!files.has('package.json') || files.size === 0 || files.size > 4000) throw Error('Incomplete or oversized source archive');
  return files;
}
const archives = new Map();
async function getSource(source) {
  if (archives.has(source.url)) return archives.get(source.url);
  const filename = source.package ? `${source.package}-${source.version}.tgz` : `${source.prefix}.tar.gz`;
  const path = resolve(output, 'preparation/downloads', filename);
  let bytes;
  try { bytes = await readFile(path); }
  catch (error) {
    if (error.code !== 'ENOENT') throw error;
    const response = await fetch(source.url, {signal: AbortSignal.timeout(45_000)});
    if (!response.ok) throw Error(`Source download failed: ${response.status} ${source.url}`);
    const chunks = []; let size = 0;
    for await (const chunk of response.body) {size += chunk.length; if (size > 4 * 1024 * 1024) throw Error('Archive download over cap'); chunks.push(chunk);}
    bytes = Buffer.concat(chunks);
  }
  const sha256 = hash(bytes);
  if (source.sha256 && sha256 !== source.sha256) throw Error(`Archive pin mismatch: ${source.url}`);
  const files = unpackArchive(bytes, source.prefix); // Validate the entire archive before any extraction.
  await writeUnchanged(path, bytes);
  const result = {files, provenance: {repository: source.repository, ...(source.package ? {package: source.package, version: source.version} : {revision: source.revision}),
    url: source.url, archiveSha256: sha256, pinVerified: Boolean(source.sha256), downloadBytes: bytes.length,
    archiveFiles: files.size, archiveFileInventorySha256: hash([...files].map(([path, body]) => `${path}\0${hash(body)}`).sort().join('\n'))}};
  archives.set(source.url, result); return result;
}
const production = (family, name) => family === 'semver' ? /^(?:(?:classes|functions|internal|ranges)\/.*\.js|(?:index|preload)\.js)$/.test(name) :
  family === 'js-yaml' ? /^src\/.*\.ts$/.test(name) : family === 'picomatch' ? /^(?:lib\/.*|index|posix)\.js$/.test(name) : name === 'index.js';
function run(command, args, cwd, timeout = 30_000) {
  const env = {...process.env}; delete env.SUFFICE_WORKSPACE; delete env.NODE_OPTIONS; delete env.NODE_TEST_CONTEXT;
  const result = spawnSync(command, args, {cwd, env, encoding: 'utf8', windowsHide: true, timeout, maxBuffer: 8_000_000});
  return {exitCode: result.status, signal: result.signal, ...(result.error ? {error: result.error.message} : {}), stdout: result.stdout ?? '', stderr: result.stderr ?? ''};
}
const receipts = [], publicTasks = [];
await mkdir(output, {recursive: true});
for (const task of tasks) {
  const workspace = resolve(output, 'fixtures', task.id), {files, provenance} = await getSource(task.source);
  await mkdir(workspace, {recursive: true});
  for (const [name, bytes] of files) await writeUnchanged(resolve(workspace, 'src', name), bytes);
  const suite = task.family === 'semver' ? 'benchmarks/real/visible.test.mjs' : task.family === 'js-yaml' ? 'benchmarks/workflow/visible.test.mjs' : `benchmarks/real/${task.family}-visible.test.mjs`;
  const originalSuite = await readFile(resolve(repo, suite), 'utf8');
  const publicSuite = originalSuite.replaceAll('process.env.SUFFICE_WORKSPACE', 'process.cwd()');
  await writeUnchanged(resolve(workspace, 'tests/public.test.mjs'), publicSuite);
  if (task.family === 'semver') {
    const subset = files.get('test/ranges/subset.js')?.toString('utf8');
    const literal = subset?.match(/const cases = (\[[\s\S]*?\n\])/);
    if (!literal) throw Error(`Missing upstream subset fixture: ${task.id}`);
    const cases = JSON.parse(JSON.stringify(runInNewContext(literal[1], {}, {timeout: 1000})));
    await writeUnchanged(resolve(workspace, 'tests/upstream-subset-cases.json'), json(cases));
  }
  const prompt = task.prompt + (task.family === 'js-yaml'
    ? ' The original upstream repository is under src/; production TypeScript is under src/src/. Node 24 executes it directly, with no install or build needed. Run the public regression checks with node --test tests/public.test.mjs. Preserve original upstream tests, fixtures, documentation, and package metadata.'
    : ' The original upstream repository/package and its layout are under src/. No dependency installation is needed. Run the public regression checks with node --test tests/public.test.mjs. Preserve original upstream tests, fixtures, documentation, and package metadata.');
  await writeUnchanged(resolve(workspace, 'README.md'), `# ${task.family} repair task\n\n${prompt}\n`);
  const immutablePaths = ['README.md', 'tests/public.test.mjs', ...(task.family === 'semver' ? ['tests/upstream-subset-cases.json'] : []),
    ...[...files.keys()].filter(name => !production(task.family, name)).map(name => `src/${name}`)].sort();
  const init = run('git', ['init', '--quiet'], workspace); if (init.exitCode !== 0) throw Error(`Git initialization failed: ${init.stderr}`);
  for (const args of [['config', 'core.autocrlf', 'false'], ['add', '--force', '--all']]) {
    const result = run('git', args, workspace); if (result.exitCode !== 0) throw Error(`Git snapshot staging failed: ${result.stderr}`);
  }
  const tree = await captureTree(workspace, {includeIgnored: true});
  if (tree.size !== files.size + (task.family === 'semver' ? 3 : 2)) throw Error(`Snapshot inventory mismatch: ${task.id}`);
  for (const path of immutablePaths) if (!tree.has(path)) throw Error(`Missing protected path: ${path}`);
  // The controller already protects tests/check configuration automatically. Keep only
  // the remaining explicit paths in its bounded request, and retain the complete set
  // for the outer runner's final immutable-file comparison in both benchmark arms.
  const automatic = protectedFiles(tree);
  const protectedPaths = immutablePaths.filter(path => !automatic.has(path));
  if (protectedPaths.length > 100) throw Error(`Too many explicit protected paths: ${task.id}`);
  const contextPaths = [task.family === 'js-yaml' ? 'src/src/index.ts' : 'src/index.js'];
  if (contextPaths.length > 8 || contextPaths.some(path => !tree.has(path) || tree.get(path).bytes.length > 12_000 || tree.get(path).bytes.includes(0))) throw Error(`Invalid interface context: ${task.id}`);
  const checks = [{id: 'public', command: ['node', '--test', 'tests/public.test.mjs'], testsRequired: true}];
  normalizeRequest({workspace, prompt, runDir: resolve(output, 'preparation/protocol-check', task.id), checks, protectedPaths, contextPaths});
  const result = run(process.execPath, ['--test', '--test-reporter=tap', 'tests/public.test.mjs'], workspace);
  const count = key => Number(result.stdout.match(new RegExp(`^# ${key} (\\d+)\\r?$`, 'm'))?.[1] ?? NaN);
  const baseline = {...result, command: ['node', '--test', 'tests/public.test.mjs'], tests: count('tests'), passed: count('pass'), failed: count('fail'), skipped: count('skipped'),
    status: result.exitCode === 0 && count('tests') > 0 && count('pass') === count('tests') && count('fail') === 0 && count('skipped') === 0 ? 'passed' : 'failed'};
  const receipt = {id: task.id, provenance, sourceSuite: suite, sourceSuiteSha256: hash(originalSuite), publicSuiteSha256: hash(publicSuite),
    publicHarnessAdaptations: ['Replace SUFFICE_WORKSPACE with process.cwd()'], treeSha256: treeHash(tree), files: tree.size,
    immutableFileInventorySha256: hash(immutablePaths.map(path => `${path}\0${hash(tree.get(path).bytes)}`).join('\n')),
    immutablePaths: immutablePaths.length, explicitProtectedPaths: protectedPaths.length, contextBytes: contextPaths.map(path => tree.get(path).bytes.length), requestNormalization: 'passed', baseline};
  receipts.push(receipt);
  await writeFile(resolve(output, 'preparation', `${task.id}.json`), json(receipt));
  console.log(JSON.stringify({id: task.id, public: baseline.status, tests: baseline.tests, files: tree.size}));
  if (baseline.status !== 'passed') throw Error(`Public baseline failed: ${task.id}; inspect preparation/${task.id}.json`);
  publicTasks.push({id: task.id, workspace: relative(output, workspace).split(sep).join('/'), prompt,
    checks, protectedPaths, immutablePaths, contextPaths, provenance});
}
await writeFile(resolve(output, 'public-tasks.json'), json({id: 'v10-native15-20261023', tasks: publicTasks}));
await writeFile(resolve(output, 'preparation.json'), json({id: 'v10-native15-20261023', createdAt: new Date().toISOString(), node: process.version,
  taskCount: publicTasks.length, baselinePublicTests: receipts.reduce((sum, receipt) => sum + receipt.baseline.tests, 0),
  sourcePolicy: 'Pinned baseline archives only; no private acceptance, fixed source, reference trees, or graders were used during preparation.', tasks: receipts}));
console.log(JSON.stringify({ready: true, tasks: publicTasks.length, publicManifest: resolve(output, 'public-tasks.json')}));
