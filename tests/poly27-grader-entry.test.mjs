import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, mkdir, writeFile, readFile, access} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {runProcess} from '../src/v9/process.mjs';
import {parseCatchCounts, parseCanonicalRustCounts, canonicalRustArgs, activateTests, classifyResult, runGrader} from '../scripts/poly27-grader-entry.mjs';

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const complete = overrides => ({exitCode: 0, stdout: '', stderr: '', timedOut: false, overflow: false, aborted: false, error: null, ...overrides});
const counts = {tests: 2, passed: 2, failed: 0, skipped: 0};

test('canonical C++ cases come from Catch summaries, never assertion totals or build exit alone', () => {
  assert.deepEqual(parseCatchCounts('All tests passed (153 assertions in 27 test cases)\n'), {tests: 27, passed: 27, failed: 0, skipped: 0});
  assert.deepEqual(parseCatchCounts('test cases: 27 | 22 passed | 5 failed\nassertions: 153 | 148 passed | 5 failed\n'), {tests: 27, passed: 22, failed: 5, skipped: 0});
  assert.deepEqual(parseCatchCounts('test cases: 1 | 1 failed\n'), {tests: 1, passed: 0, failed: 1, skipped: 0});
  assert.equal(parseCatchCounts('Build finished successfully\n'), null);
  assert.equal(parseCatchCounts('test cases: 27 | 22 passed\n'), null);
  assert.equal(parseCatchCounts('All tests passed (1 assertion in 1 test case)\nAll tests passed (1 assertion in 1 test case)\n'), null);
});

test('canonical Cargo counts include unit, integration and doc suites and reject filtered/measured runs', () => {
  const report = 'test result: ok. 0 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.00s\n' +
    'test result: ok. 15 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.01s\n' +
    'test result: ok. 2 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.00s\n';
  assert.deepEqual(parseCanonicalRustCounts(report), {tests: 17, passed: 17, failed: 0, skipped: 0});
  assert.equal(parseCanonicalRustCounts(report.replace('0 filtered out', '1 filtered out')), null);
  assert.equal(parseCanonicalRustCounts('Compiling successfully'), null);
});

test('Rust grading selects only restored acceptance targets, excluding reference-only unit tests and benches', () => {
  const descriptor = {actorFiles: [{path: 'src/lib.rs'}, {path: 'Cargo.lock'}], hiddenFiles: [{path: 'tests/decimal.rs'}, {path: 'benches/benchmark.rs'}]};
  assert.deepEqual(canonicalRustArgs(descriptor), ['test', '--offline', '--locked', '--test', 'decimal', '--', '--include-ignored']);
  assert.ok(!canonicalRustArgs(descriptor).includes('--lib'));
  assert.throws(() => canonicalRustArgs({...descriptor, hiddenFiles: [{path: 'benches/benchmark.rs'}]}), /integration targets/);
  assert.throws(() => canonicalRustArgs({...descriptor, hiddenFiles: [{path: 'tests/decimal.rs'}, {path: 'tests/decimal.rs'}]}), /duplicate/);
});

test('success requires positive complete cases, no skips, exact frozen expected count and complete execution', () => {
  assert.equal(classifyResult({calls: [complete()], counts, expectedTests: 2}).accepted, true);
  for (const input of [
    {counts: null}, {counts: {tests: 0, passed: 0, failed: 0, skipped: 0}},
    {counts: {...counts, skipped: 1}}, {expectedTests: 3},
    {calls: [complete({timedOut: true})]}, {calls: [complete({overflow: true})]},
    {calls: [complete({error: 'spawn ENOENT'})]}, {counts: {...counts, passed: 1}},
  ]) assert.equal(classifyResult({calls: [complete()], counts, expectedTests: 2, ...input}).accepted, null);
});

test('legitimate source compile/assertion failures stay failures while dependency failures stay ungraded', () => {
  assert.deepEqual(classifyResult({calls: [complete({exitCode: 1, stderr: 'sample.cpp:4:1: error: unknown name'})], counts: null}), {status: 'failed', accepted: false, kind: 'compile_error'});
  assert.equal(classifyResult({calls: [complete({exitCode: 1})], counts: {...counts, passed: 1, failed: 1}}).kind, 'test_failure');
  assert.equal(classifyResult({calls: [complete({exitCode: 1, stderr: 'No cached version of junit available for offline mode'})], counts: null}).accepted, null);
  assert.equal(classifyResult({calls: [complete({exitCode: 1, stderr: 'No CMAKE_CXX_COMPILER could be found'})], counts: null}).accepted, null);
  assert.equal(classifyResult({calls: [complete({exitCode: 1, stderr: 'Unknown runner failure'})], counts: null}).accepted, null);
});

test('canonical activation enables the frozen cases without changing their assertions', () => {
  const java = '@Disabled("Remove to run")\n    @Test\n    void caseOne() { assertEquals(42, answer()); }';
  assert.equal(activateTests('java', java), '    @Test\n    void caseOne() { assertEquals(42, answer()); }');
  const js = 'xtest("case", () => { expect(answer()).toBe(42); });';
  assert.equal(activateTests('javascript', js), 'test("case", () => { expect(answer()).toBe(42); });');
  assert.equal(activateTests('go', 'unchanged'), 'unchanged');
});

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'poly27-grader-test-')), input = join(root, 'input'), graderRoot = join(root, 'grader');
  await mkdir(input); await mkdir(join(graderRoot, 'hidden'), {recursive: true}); await mkdir(join(graderRoot, 'reference/.meta'), {recursive: true});
  const files = {'sample.go': 'package sample\nconst Value = 0\n', 'go.mod': 'module sample\n\ngo 1.18\n', 'TASK.md': 'Frozen public requirements\n'};
  const inventory = Object.entries(files).map(([path, text]) => ({path, bytes: Buffer.byteLength(text), sha256: hash(text), mode: 0o644}));
  for (const [path, text] of Object.entries(files)) await writeFile(join(input, path), text);
  const testText = 'package sample\n// Frozen assertion body, never actor-visible\n', reference = 'package sample\nconst Value = 42\n';
  await writeFile(join(graderRoot, 'hidden/canonical_test.go'), testText); await writeFile(join(graderRoot, 'reference/.meta/example.go'), reference);
  const descriptor = {id: 'go_sample', taskId: 'go/sample', lang: 'go', name: 'sample', actorFiles: inventory, files: {solution: ['sample.go']},
    hiddenFiles: [{path: 'canonical_test.go', bytes: Buffer.byteLength(testText), sha256: hash(testText), mode: 0o644}],
    referenceFiles: [{path: '.meta/example.go', bytes: Buffer.byteLength(reference), sha256: hash(reference), mode: 0o644}],
    referenceMapping: [{from: '.meta/example.go', to: 'sample.go'}], build: {configurations: [{path: 'go.mod'}]}};
  await writeFile(join(graderRoot, 'descriptor.json'), JSON.stringify(descriptor));
  const run = async (command, args, options) => {
    if (command !== 'go') return runProcess(command, args, options);
    assert.equal(await readFile(join(options.cwd, 'canonical_test.go'), 'utf8'), testText);
    assert.equal(await readFile(join(options.cwd, 'go.mod'), 'utf8'), files['go.mod']);
    assert.equal(await readFile(join(options.cwd, 'TASK.md'), 'utf8'), files['TASK.md']);
    const passed = (await readFile(join(options.cwd, 'sample.go'), 'utf8')).includes('Value = 42');
    return complete({exitCode: passed ? 0 : 1, stdout: [
      {Action: passed ? 'pass' : 'fail', Package: 'sample', Test: 'TestCanonical'},
      {Action: passed ? 'pass' : 'fail', Package: 'sample'},
    ].map(row => JSON.stringify(row)).join('\n') + '\n'});
  };
  return {root, input, graderRoot, run};
}
function options(f, mode) {return {...f, config: {mode, expectedTests: 1}, workRoot: join(f.root, mode + '-work'), results: join(f.root, mode + '-results')};}

test('baseline and gold use independent fresh trees; gold overlays only mapped reference source', async () => {
  const f = await fixture(), baseline = await runGrader(options(f, 'baseline')), gold = await runGrader(options(f, 'gold'));
  assert.equal(baseline.accepted, false); assert.equal(gold.accepted, true); assert.equal(gold.counts.tests, 1);
  assert.equal(await readFile(join(f.input, 'sample.go'), 'utf8'), 'package sample\nconst Value = 0\n');
  assert.equal(await readFile(join(baseline.workspace, 'sample.go'), 'utf8'), 'package sample\nconst Value = 0\n');
  const receipt = JSON.parse(await readFile(join(f.root, 'gold-results/result.json'), 'utf8'));
  assert.equal(receipt.accepted, true); assert.ok(receipt.calls.every(c => !('stdout' in c) && c.stdoutPath));
  assert.ok(receipt.restored.restored.every(r => r.originalSha256 === r.activeSha256));
});

test('candidate edits to build instructions and hidden test paths cannot replace frozen grading inputs', async () => {
  const f = await fixture(), patch = join(f.root, 'candidate.diff');
  await writeFile(patch, [
    'diff --git a/sample.go b/sample.go', '--- a/sample.go', '+++ b/sample.go', '@@ -1,2 +1,2 @@', ' package sample', '-const Value = 0', '+const Value = 42',
    'diff --git a/go.mod b/go.mod', '--- a/go.mod', '+++ b/go.mod', '@@ -1,3 +1,3 @@', ' module sample', ' ', '-go 1.18', '+go 1.99',
    'diff --git a/TASK.md b/TASK.md', '--- a/TASK.md', '+++ b/TASK.md', '@@ -1 +1 @@', '-Frozen public requirements', '+Modified requirements',
    'diff --git a/canonical_test.go b/canonical_test.go', 'new file mode 100644', '--- /dev/null', '+++ b/canonical_test.go', '@@ -0,0 +1 @@', '+Counterfeit hidden suite',
    'diff --git a/extra_test.go b/extra_test.go', 'new file mode 100644', '--- /dev/null', '+++ b/extra_test.go', '@@ -0,0 +1 @@', '+Extra actor tests must not inflate canonical counts', '',
  ].join('\n'));
  const result = await runGrader({...options(f, 'candidate'), patch});
  assert.equal(result.accepted, true, result.error); assert.equal(result.counts.tests, 1);
  await assert.rejects(access(join(result.workspace, 'extra_test.go')), {code: 'ENOENT'});
  assert.ok(result.calls.some(c => c.phase === 'patch-check')); assert.ok(result.calls.some(c => c.phase === 'patch'));
});

test('escaping patches and changed frozen hidden files never receive a passing grade', async () => {
  const f = await fixture(), patch = join(f.root, 'escape.diff');
  await writeFile(patch, 'diff --git a/../outside b/../outside\nnew file mode 100644\n--- /dev/null\n+++ b/../outside\n@@ -0,0 +1 @@\n+escape\n');
  const escaped = await runGrader({...options(f, 'candidate'), patch});
  assert.equal(escaped.accepted, false); assert.equal(escaped.kind, 'invalid_patch');
  await assert.rejects(access(join(f.root, 'outside')), {code: 'ENOENT'});
  await writeFile(join(f.graderRoot, 'hidden/canonical_test.go'), 'Tampered hidden assertion');
  const gold = await runGrader(options(f, 'gold'));
  assert.equal(gold.accepted, null); assert.match(gold.error, /hash mismatch/);
});
