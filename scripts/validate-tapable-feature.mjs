import { readFile, writeFile, readdir, cp, mkdtemp, rm } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const taskDir = resolve(root, 'benchmarks/multicomponent/tapable-abortable-hooks');
const task = JSON.parse(await readFile(resolve(taskDir, 'task.json'), 'utf8'));
const source = JSON.parse(await readFile(resolve(taskDir, 'source.json'), 'utf8'));
const harnessPath = resolve(process.env.SUFFICE_HARNESS_MODULE || resolve(root, 'src/workspace.mjs'));
const { runNodeTests } = await import(pathToFileURL(harnessPath));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const testNames = text => [...text.matchAll(/\btest\(\s*['"]([^'"]+)['"]/g)].map(match => match[1]);

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
const modified = new Map(source.referenceModifications.map(change => [change.path.slice(4), change]));
assert.deepEqual([...task.allowedEditPaths].sort(), source.referenceModifications.map(change => change.path).sort());
for (const kind of ['actor', 'reference']) {
  const directory = resolve(taskDir, kind, 'src');
  assert.deepEqual(await inventory(directory), expectedPaths);
  for (const relative of expectedPaths) {
    const bytes = await readFile(resolve(directory, relative));
    const modification = kind === 'reference' ? modified.get(relative) : null;
    assert.equal(hash(bytes), modification ? modification.afterSha256 : source.manifest[relative].sha256, `${kind}/${relative}`);
  }
  assert.equal((await readFile(resolve(taskDir, kind, 'README.md'), 'utf8')).trimEnd(), task.publicPrompt);
}
const packageJson = JSON.parse(await readFile(resolve(taskDir, 'actor/src/package.json'), 'utf8'));
assert.deepEqual(packageJson.dependencies || {}, {});
assert.equal(task.taskType, 'feature');
assert.equal(task.split, 'calibration');
const visible = resolve(taskDir, task.visiblePath), acceptance = resolve(taskDir, task.acceptancePath);
const visibleSource = await readFile(visible, 'utf8'), acceptanceSource = await readFile(acceptance, 'utf8');
const publicSmokeNames = testNames(await readFile(resolve(taskDir, task.visibleSmokePath), 'utf8'));
const publicFeatureNames = testNames(await readFile(resolve(taskDir, task.visibleFeaturePath), 'utf8'));
const hiddenNames = testNames(acceptanceSource);
assert.deepEqual(testNames(visibleSource), [...publicSmokeNames, ...publicFeatureNames]);
const allNames = [...testNames(visibleSource), ...hiddenNames];
assert.equal(new Set(allNames).size, allNames.length);
assert.deepEqual([...allNames].sort(), Object.keys(task.assertionMap).sort());
const requirementsSeen = new Set();
for (const mapping of Object.values(task.assertionMap)) for (const id of mapping.requirements) {
  assert.ok(task.requirements.some(requirement => requirement.id === id)); requirementsSeen.add(id);
}
assert.deepEqual([...requirementsSeen].sort(), task.requirements.map(requirement => requirement.id).sort());

const results = {};
for (const kind of ['actor', 'reference']) {
  const workspace = resolve(taskDir, kind);
  results[kind] = {};
  for (const [name, path] of [
    ['visibleSmoke', resolve(workspace, 'tests/smoke.test.mjs')],
    ['visibleFeature', resolve(workspace, 'tests/feature.test.mjs')],
    ['visible', resolve(workspace, 'tests/visible.test.mjs')],
    ['acceptance', acceptance],
  ]) results[kind][name] = await runNodeTests(workspace, path);
  const expected = kind === 'actor' ? task.expectedBaseline : task.expectedReference;
  for (const [name, status] of Object.entries(expected)) assert.equal(results[kind][name].status, status);
}
const ablationDefinitions = [
  {
    id: 'stage-one-cache', path: 'src/lib/Hook.js',
    before: '\t\tif (this._callAsyncWithSignal) {\n\t\t\tthis.callAsyncWithSignal = this._callAsyncWithSignal;\n\t\t\tthis.promiseWithSignal = this._promiseWithSignal;\n\t\t}\n',
    after: '',
    requiredFailure: 'stage one both abortable caches invalidate on new taps and interceptors',
  },
  {
    id: 'stage-two-cleanup', path: 'src/lib/HookCodeFactory.js',
    before: '_signal.removeEventListener("abort", _onAbort);', after: '/* Listener cleanup omitted by ablation. */',
    requiredFailure: 'stage two interceptor terminal notifications follow cleanup and precede completion',
  },
  {
    id: 'stage-three-ordered', path: 'src/lib/AsyncSeriesHook.js',
    before: 'return this.callAbortableSeries();', after: 'return this.callAbortableParallel();',
    requiredFailure: 'stage three series continuations wait for each mixed tap before starting the next',
  },
  {
    id: 'stage-four-parallel', path: 'src/lib/AsyncParallelHook.js',
    before: 'return this.callAbortableParallel();', after: 'return this.callAbortableSeries();',
    requiredFailure: 'stage four parallel dispatch starts all pending taps without serializing them',
  },
];
const scratch = await mkdtemp(resolve(tmpdir(), 'suffice-tapable-feature-'));
const ablations = {};
try {
  for (const definition of ablationDefinitions) {
    const workspace = resolve(scratch, definition.id);
    await cp(resolve(taskDir, 'reference'), workspace, { recursive: true });
    const file = resolve(workspace, definition.path), text = await readFile(file, 'utf8');
    assert.equal(text.split(definition.before).length, 2);
    await writeFile(file, text.replace(definition.before, definition.after));
    const smoke = await runNodeTests(workspace, resolve(workspace, 'tests/smoke.test.mjs'));
    const acceptanceResult = await runNodeTests(workspace, acceptance);
    assert.equal(smoke.status, 'passed');
    assert.equal(acceptanceResult.status, 'failed');
    assert.equal(acceptanceResult.tests, hiddenNames.length);
    assert.equal(acceptanceResult.cancelled, 0, 'Ablation cases must actually execute, not be cancelled');
    for (const name of [definition.requiredFailure, 'integration plugin pipeline composes ordered parallel cancellation cleanup and cache reuse']) {
      assert.ok(acceptanceResult.stdout.includes(`- ${name}\n`), `Missing expected test: ${name}`);
      assert.ok(acceptanceResult.stdout.split('\n').some(line => line.startsWith('not ok ') && line.endsWith(`- ${name}`)), `Ablation must fail actual behavior: ${name}`);
    }
    ablations[definition.id] = { ...definition, smoke, acceptance: acceptanceResult };
  }
} finally {
  assert.ok(scratch.startsWith(resolve(tmpdir(), 'suffice-tapable-feature-')));
  await rm(scratch, { recursive: true, force: true });
}
const artifactPaths = await inventory(taskDir);
const artifactBytesBeforeReceipt = (await Promise.all(artifactPaths.map(async path => (await readFile(resolve(taskDir, path))).length))).reduce((a, b) => a + b, 0);
assert.ok(artifactBytesBeforeReceipt < source.limits.taskArtifactBytes);
const stages = Object.fromEntries(['stage one', 'stage two', 'stage three', 'stage four', 'integration'].map(prefix => [prefix, hiddenNames.filter(name => name.startsWith(prefix))]));
const receipt = {
  schemaVersion: 1, taskId: task.id, taskType: task.taskType,
  validationMode: 'Offline preparation and permission-restricted native behavior tests; no live inference',
  validatedAt: new Date().toISOString(), nodeVersion: process.version,
  sourceCommit: task.sourceCommit, harnessModuleSha256: hash(await readFile(harnessPath)),
  taskSha256: hash(await readFile(resolve(taskDir, 'task.json'))),
  acceptanceSha256: hash(await readFile(acceptance)), visibleSha256: hash(await readFile(visible)),
  sourceReceiptSha256: hash(await readFile(resolve(taskDir, 'source.json'))),
  referencePatchSha256: hash(await readFile(resolve(taskDir, 'private/reference-patches.json'))),
  sourceIntegrity: { completeRepository: true, baselineMatchesArchive: true, referenceModifiedFiles: source.referenceModifications.map(change => change.path) },
  publicChecks: { smoke: publicSmokeNames, feature: publicFeatureNames, baselineFeatureFailuresExpected: true },
  stages, artifactBytesBeforeReceipt, results, ablations,
  limitations: [
    'Authored feature and authored known reference, not an upstream historical issue.',
    'Structural staged Tier3 candidate only; no measured duration, context pressure, compaction, restart, persistence or delegation activation.',
    'New methods support only AsyncSeriesHook and AsyncParallelHook, valid native signals, non-context taps/interceptors and nonthrowing observers.',
    'TypeScript declarations and other Hook kinds are intentionally unchanged.',
    'Native adapted regressions and independent feature behavior checks are not the entire upstream Jest/snapshot suite.',
    'setImmediate is used only to flush host unhandled-rejection reporting; no workload delays or context padding.',
    'Future model runs require a separate preregistered feature-phase budget and dataset freeze; not part of the existing repair campaign.'
  ],
};
await writeFile(resolve(taskDir, 'validation.json'), JSON.stringify(receipt, null, 2) + '\n');
const summarize = result => ({ status: result.status, passed: result.passed, tests: result.tests, cancelled: result.cancelled });
console.log(JSON.stringify({ task: task.id, artifactBytesBeforeReceipt,
  results: Object.fromEntries(Object.entries(results).map(([kind, suites]) => [kind, Object.fromEntries(Object.entries(suites).map(([name, result]) => [name, summarize(result)]))])),
  ablations: Object.fromEntries(Object.entries(ablations).map(([name, result]) => [name, summarize(result.acceptance)])),
}, null, 2));
