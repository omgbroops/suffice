import { readFile, writeFile, readdir, cp, mkdtemp, rm } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const taskDir = resolve(root, 'benchmarks/multicomponent/bottleneck-weighted-priority');
const task = JSON.parse(await readFile(resolve(taskDir, 'task.json'), 'utf8'));
const source = JSON.parse(await readFile(resolve(taskDir, 'source.json'), 'utf8'));
const harnessPath = resolve(process.env.SUFFICE_HARNESS_MODULE || resolve(root, 'src/workspace.mjs'));
const { runNodeTests } = await import(pathToFileURL(harnessPath));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');

async function inventory(directory, prefix = '') {
  const result = [];
  for (const entry of await readdir(resolve(directory, prefix), { withFileTypes: true })) {
    const path = prefix ? `${prefix}/${entry.name}` : entry.name;
    assert.ok(!entry.isSymbolicLink(), `Unexpected symlink: ${path}`);
    if (entry.isDirectory()) result.push(...await inventory(directory, path));
    else if (entry.isFile()) result.push(path);
  }
  return result.sort();
}

const expectedPaths = Object.keys(source.manifest).sort();
assert.deepEqual([...task.allowedEditPaths].sort(), expectedPaths.filter(path => path.startsWith('lib/') && path.endsWith('.js') && path !== 'lib/es5.js').map(path => 'src/' + path));
const injected = new Map(source.injections.map(change => [change.path.slice(4), change]));
for (const kind of ['actor', 'reference']) {
  const directory = resolve(taskDir, kind, 'src');
  assert.deepEqual(await inventory(directory), expectedPaths, `${kind} must contain the complete upstream archive`);
  for (const relative of expectedPaths) {
    const bytes = await readFile(resolve(directory, relative));
    const injection = kind === 'actor' ? injected.get(relative) : null;
    if (injection) {
      const pristine = await readFile(resolve(taskDir, 'reference/src', relative), 'utf8');
      assert.equal(bytes.toString(), pristine.replace(injection.upstreamText, injection.injectedText));
    } else assert.equal(hash(bytes), source.manifest[relative].sha256, `${kind}/${relative}`);
  }
}
const visible = resolve(taskDir, task.visiblePath);
const acceptance = resolve(taskDir, task.acceptancePath);
const names = [];
for (const path of [visible, acceptance]) {
  const text = await readFile(path, 'utf8');
  names.push(...[...text.matchAll(/\btest\(\s*['"]([^'"]+)['"]/g)].map(match => match[1]));
}
assert.equal(new Set(names).size, names.length);
assert.deepEqual(names.sort(), Object.keys(task.assertionMap).sort());
for (const mapping of Object.values(task.assertionMap)) for (const id of mapping.requirements) {
  assert.ok(task.requirements.some(requirement => requirement.id === id));
}
const results = {};
for (const kind of ['actor', 'reference']) {
  const workspace = resolve(taskDir, kind);
  results[kind] = {
    visible: await runNodeTests(workspace, resolve(workspace, 'tests/visible.test.mjs')),
    acceptance: await runNodeTests(workspace, acceptance),
  };
}
assert.equal(results.actor.visible.status, 'passed');
assert.equal(results.actor.acceptance.status, 'failed');
assert.equal(results.reference.visible.status, 'passed');
assert.equal(results.reference.acceptance.status, 'passed');
const ablations = {};
const scratch = await mkdtemp(resolve(tmpdir(), 'suffice-multicomponent-'));
try {
  for (const [name, fixedPath] of [
    ['priority-only', 'src/lib/Queues.js'],
    ['capacity-only', 'src/lib/LocalDatastore.js'],
  ]) {
    const workspace = resolve(scratch, name);
    await cp(resolve(taskDir, 'actor'), workspace, { recursive: true });
    await cp(resolve(taskDir, 'reference', fixedPath), resolve(workspace, fixedPath));
    ablations[name] = await runNodeTests(workspace, acceptance);
    assert.equal(ablations[name].status, 'failed');
    assert.match(ablations[name].stdout, /not ok \d+ - priority selection and weighted release compose across backlog waves/);
  }
} finally {
  assert.ok(scratch.startsWith(resolve(tmpdir(), 'suffice-multicomponent-')));
  await rm(scratch, { recursive: true, force: true });
}
const paths = await inventory(taskDir);
const artifactBytes = (await Promise.all(paths.map(async path => (await readFile(resolve(taskDir, path))).length))).reduce((a, b) => a + b, 0);
assert.ok(artifactBytes < source.limits.taskArtifactBytes);
const receipt = {
  schemaVersion: 1, validationMode: 'Offline native tests only; no live model inference',
  nodeVersion: process.version, validatedAt: new Date().toISOString(),
  taskId: task.id, sourceCommit: task.sourceCommit,
  harnessModuleSha256: hash(await readFile(harnessPath)),
  taskSha256: hash(await readFile(resolve(taskDir, 'task.json'))),
  acceptanceSha256: hash(await readFile(acceptance)), visibleSha256: hash(await readFile(visible)),
  sourceReceiptSha256: hash(await readFile(resolve(taskDir, 'source.json'))),
  sourceIntegrity: { completeRepository: true, referenceMatchesArchive: true, injectedFiles: [...injected.keys()] },
  artifactBytesBeforeReceipt: artifactBytes, results, ablations,
  limitations: [
    'Not a historical upstream issue; two explicit injected mutations.',
    'Two small repairs; no measured long-horizon exposure or model/delegation performance.',
    'Complete upstream CoffeeScript and bundled counterparts may make intended fixes easier to locate.',
    'Native adapted tests cover the documented local weighted-priority contract; upstream Mocha, Redis and clustering suites were not installed or run.',
    'The grader launches a permission-restricted Node process; evaluated code has no subprocess or network permission. Test deadlines bound liveness failures and are not deliberate workload delay.'
  ],
};
await writeFile(resolve(taskDir, 'validation.json'), JSON.stringify(receipt, null, 2) + '\n');
console.log(JSON.stringify({
  task: task.id, artifactBytesBeforeReceipt: artifactBytes,
  results: Object.fromEntries(Object.entries(results).map(([kind, suites]) => [kind, Object.fromEntries(Object.entries(suites).map(([suite, result]) => [suite, { status: result.status, passed: result.passed, tests: result.tests }]))])),
  ablations: Object.fromEntries(Object.entries(ablations).map(([name, result]) => [name, { status: result.status, passed: result.passed, tests: result.tests }])),
}, null, 2));
