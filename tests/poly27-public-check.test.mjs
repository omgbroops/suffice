import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, mkdir, writeFile, readFile, readdir, rm, access, symlink} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {parseGoCounts, parseJUnitCounts, parseJestCounts, parseRustCounts, runPublicGeneratedCheck, formatPublicResult, PUBLIC_CHECK_INSTRUCTIONS} from '../scripts/poly27-public-check.mjs';
import {testCount} from '../src/v9/checks.mjs';

const processResult = (stdout = '', exitCode = 0, extra = {}) => ({stdout, stderr: '', exitCode, error: null, timedOut: false, overflow: false, aborted: false, ...extra});
const xml = (body = '<testcase name="public-case" classname="GeneratedCheck"/>') => `<?xml version="1.0"?><testsuite tests="1" failures="0" errors="0">${body}</testsuite>`;
const goEvents = events => events.map(event => JSON.stringify({Package: 'exercise', ...event})).join('\n');
async function fixture(t, generated, content) {
  const root = await mkdtemp(join(tmpdir(), 'poly27-public-test-'));
  t.after(() => rm(root, {recursive: true, force: true}));
  const workspace = join(root, 'exercise'); await mkdir(join(workspace, '.suffice-v10-checks'), {recursive: true});
  await writeFile(join(workspace, generated), content);
  return {root, workspace};
}

test('Go counts actual terminal test events, never printed assertions or package events', () => {
  const text = goEvents([{Action: 'output', Output: '# tests 999\n'}, {Action: 'pass', Test: 'TestCase/child'}, {Action: 'pass', Test: 'TestCase'}, {Action: 'skip', Test: 'TestSkipped'}, {Action: 'fail', Test: 'TestWrong'}, {Action: 'fail'}]);
  assert.deepEqual(parseGoCounts(text), {tests: 3, passed: 2, failed: 1, skipped: 1});
  assert.equal(parseGoCounts(goEvents([{Action: 'pass', Test: 'TestCase'}])), null);
  assert.equal(parseGoCounts(text + '\nnot JSON'), null);
});

test('JUnit counts named cases and skips; rejects collection errors and truncated XML', () => {
  assert.deepEqual(parseJUnitCounts(xml('<testcase name="ok"/><testcase name="wrong"><failure message="no"/></testcase><testcase name="later"><skipped/></testcase>')), {tests: 2, passed: 1, failed: 1, skipped: 1});
  assert.equal(parseJUnitCounts(xml('<testcase name="collection"><error message="collection failure"/></testcase>')), null);
  assert.equal(parseJUnitCounts('<testsuite><testcase name="incomplete"></testsuite>'), null);
  assert.equal(parseJUnitCounts('<testsuite><testcase name="ok"/>'), null);
});

test('Jest requires per-case statuses and matching authentic aggregate counts', () => {
  const data = {numTotalTests: 2, numPassedTests: 1, numFailedTests: 0, testResults: [{assertionResults: [{status: 'passed'}, {status: 'pending'}]}]};
  assert.deepEqual(parseJestCounts(JSON.stringify(data)), {tests: 1, passed: 1, failed: 0, skipped: 1});
  assert.equal(parseJestCounts(JSON.stringify({...data, numPassedTests: 2})), null);
  assert.equal(parseJestCounts(JSON.stringify({numTotalTests: 0, numPassedTests: 0, numFailedTests: 0, testResults: [{status: 'failed', assertionResults: []}]})), null);
});

test('Rust requires one completed integration-test summary and preserves ignored counts', () => {
  assert.deepEqual(parseRustCounts('running 3 tests\ntest result: FAILED. 1 passed; 1 failed; 1 ignored; 0 measured; 0 filtered out; finished in 0.01s\n'), {tests: 2, passed: 1, failed: 1, skipped: 1});
  assert.equal(parseRustCounts('running 1 test\n'), null);
  assert.equal(parseRustCounts('test result: ok. 1 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out;\ntest result: ok. 1 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out;'), null);
});

test('Go runs only the selected generated suite in a temporary package and cleans it', async t => {
  const generated = '.suffice-v10-checks/generated_test.go', content = 'package exercise\nimport "testing"\nfunc TestPublic(t *testing.T){}\n';
  const {root, workspace} = await fixture(t, generated, content);
  await writeFile(join(workspace, 'exercise.go'), 'package exercise\n');
  await writeFile(join(workspace, 'other_test.go'), 'untouched existing actor test');
  let scratch;
  const result = await runPublicGeneratedCheck({lang: 'go', generated, workspace, tempRoot: root, run: async (command, args, options) => {
    assert.equal(command, 'go'); assert.deepEqual(args, ['test', '-json', '-count=1', '.']); scratch = options.cwd;
    assert.equal(await readFile(join(scratch, 'zz_suffice_generated_test.go'), 'utf8'), content);
    assert.equal((await readdir(scratch)).includes('other_test.go'), false);
    assert.equal(options.env.GOPROXY, 'off');
    return processResult(goEvents([{Action: 'pass', Test: 'TestPublic'}, {Action: 'pass'}]));
  }});
  assert.equal(result.status, 'passed'); assert.equal(result.counts.tests, 1);
  assert.equal(await readFile(join(workspace, 'other_test.go'), 'utf8'), 'untouched existing actor test');
  await assert.rejects(access(scratch), {code: 'ENOENT'});
  assert.equal(testCount(formatPublicResult(result)), 1);
});

test('C++ compilation failure remains failed with zero real tests and never starts a test executable', async t => {
  const generated = '.suffice-v10-checks/generated.cpp';
  const {root, workspace} = await fixture(t, generated, '#include "catch.hpp"\nTEST_CASE("public") { REQUIRE(false); }');
  await mkdir(join(workspace, 'test')); await writeFile(join(workspace, 'test/tests-main.cpp'), '#define CATCH_CONFIG_MAIN\n');
  await writeFile(join(workspace, 'exercise.cpp'), 'broken source'); let calls = 0;
  const result = await runPublicGeneratedCheck({lang: 'cpp', generated, workspace, tempRoot: root, run: async (_, args) => {calls++; assert(args.includes('-std=c++17')); return processResult('compiler error', 1);}});
  assert.equal(calls, 1); assert.equal(result.status, 'failed'); assert.equal(result.exitCode, 1);
  assert.deepEqual(result.counts, {tests: 0, passed: 0, failed: 0, skipped: 0});
  assert.equal(testCount(formatPublicResult(result)), 0);
});

test('C++ successful compile requires authentic Catch report, not exit zero alone', async t => {
  const generated = '.suffice-v10-checks/generated.cpp';
  const {root, workspace} = await fixture(t, generated, 'TEST_CASE("public"){}');
  let count = 0;
  const result = await runPublicGeneratedCheck({lang: 'cpp', generated, workspace, tempRoot: root, run: async (_, args) => {
    if (++count === 2) await writeFile(args[args.indexOf('--out') + 1], xml());
    return processResult();
  }});
  assert.equal(result.status, 'passed'); assert.equal(result.counts.tests, 1); assert.equal(count, 2);
});

test('Java generates only matching test class, uses offline Gradle and JUnit case receipts', async t => {
  const generated = '.suffice-v10-checks/GeneratedCheck.java';
  const {root, workspace} = await fixture(t, generated, 'public class GeneratedCheck { @org.junit.jupiter.api.Test void check() {} }');
  await mkdir(join(workspace, 'src/test/java'), {recursive: true}); await writeFile(join(workspace, 'src/test/java/Existing.java'), 'existing');
  const result = await runPublicGeneratedCheck({lang: 'java', generated, workspace, tempRoot: root, run: async (_, args, options) => {
    assert(args.includes('--offline')); assert.deepEqual(args.slice(-2), ['--tests', 'GeneratedCheck']);
    assert.deepEqual(await readdir(join(options.cwd, 'src/test/java')), ['GeneratedCheck.java']);
    await mkdir(join(options.cwd, 'build/test-results/test'), {recursive: true});
    await writeFile(join(options.cwd, 'build/test-results/test/TEST-GeneratedCheck.xml'), xml());
    return processResult();
  }});
  assert.equal(result.status, 'passed');
  assert.equal(await readFile(join(workspace, 'src/test/java/Existing.java'), 'utf8'), 'existing');
});

test('Jest selects the exact generated path and reconciles report cases without changing the actor tree', async t => {
  const generated = '.suffice-v10-checks/generated.test.js'; const {root, workspace} = await fixture(t, generated, 'test("public", () => expect(1).toBe(1));');
  const modules = join(root, 'dependencies'); await mkdir(modules);
  const result = await runPublicGeneratedCheck({lang: 'javascript', generated, workspace, tempRoot: root, env: {...process.env, POLY27_NODE_MODULES: modules}, run: async (_, args, options) => {
    assert(args.includes('--runTestsByPath')); assert(args.includes(join(options.cwd, generated))); assert(args.includes('--no-cache'));
    await writeFile(args[args.indexOf('--outputFile') + 1], JSON.stringify({numTotalTests: 1, numPassedTests: 1, numFailedTests: 0, testResults: [{status: 'passed', assertionResults: [{status: 'passed'}]}]}));
    return processResult();
  }});
  assert.equal(result.status, 'passed'); assert.equal(result.counts.passed, 1);
  assert.deepEqual(await readdir(workspace), ['.suffice-v10-checks']);
});

test('Rust runs the selected integration test offline with external build output', async t => {
  const generated = '.suffice-v10-checks/generated.rs', content = '#[test] fn public() { assert_eq!(1, 2); }';
  const {root, workspace} = await fixture(t, generated, content);
  const result = await runPublicGeneratedCheck({lang: 'rust', generated, workspace, tempRoot: root, run: async (command, args, options) => {
    assert.equal(command, 'cargo'); assert.deepEqual(args, ['test', '--offline', '--test', 'suffice_generated', '--', '--nocapture']);
    assert.equal(await readFile(join(options.cwd, 'tests/suffice_generated.rs'), 'utf8'), content);
    assert.equal(options.env.CARGO_NET_OFFLINE, 'true'); assert(!options.env.CARGO_TARGET_DIR.startsWith(workspace));
    return processResult('test result: FAILED. 0 passed; 1 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.01s\n', 101);
  }});
  assert.equal(result.status, 'failed'); assert.equal(result.counts.failed, 1);
  assert.deepEqual(await readdir(workspace), ['.suffice-v10-checks']);
});

test('missing tool and zero-case successful process stay unverified', async t => {
  const generated = '.suffice-v10-checks/generated_test.go'; const {root, workspace} = await fixture(t, generated, 'package exercise\n');
  const absent = await runPublicGeneratedCheck({lang: 'go', generated, workspace, tempRoot: root, run: async () => processResult('', null, {error: 'spawn go ENOENT'})});
  assert.equal(absent.status, 'unverified'); assert.equal(absent.exitCode, 2); assert.equal(absent.countsKnown, false);
  const empty = await runPublicGeneratedCheck({lang: 'go', generated, workspace, tempRoot: root, run: async () => processResult(goEvents([{Action: 'pass'}]))});
  assert.equal(empty.status, 'unverified'); assert.equal(empty.counts.tests, 0);
  const compilation = await runPublicGeneratedCheck({lang: 'go', generated, workspace, tempRoot: root, run: async () => processResult(goEvents([{Action: 'output', Output: 'exercise [build failed]\n'}, {Action: 'fail'}]), 1)});
  assert.equal(compilation.status, 'failed'); assert.equal(compilation.counts.tests, 0);
});

test('pytest all-skipped and missing reports cannot become successful checks', async t => {
  const generated = '.suffice-v10-checks/generated_test.py'; const {root, workspace} = await fixture(t, generated, 'def test_check(): pass\n');
  const result = await runPublicGeneratedCheck({lang: 'python', generated, workspace, tempRoot: root, run: async (_, args) => {
    await writeFile(args[args.indexOf('--junitxml') + 1], xml('<testcase name="later"><skipped/></testcase>'));
    return processResult();
  }});
  assert.equal(result.status, 'unverified'); assert.equal(result.exitCode, 2); assert.equal(result.counts.tests, 0);
  const missing = await runPublicGeneratedCheck({lang: 'python', generated, workspace, tempRoot: root, run: async () => processResult('1 passed')});
  assert.equal(missing.status, 'unverified'); assert.equal(missing.countsKnown, false);
});

test('timeout cannot pass even when a complete report was written', async t => {
  const generated = '.suffice-v10-checks/generated_test.py'; const {root, workspace} = await fixture(t, generated, 'def test_check(): pass\n');
  const result = await runPublicGeneratedCheck({lang: 'python', generated, workspace, tempRoot: root, run: async (_, args) => {
    await writeFile(args[args.indexOf('--junitxml') + 1], xml()); return processResult('', 0, {timedOut: true});
  }});
  assert.equal(result.status, 'unverified'); assert.equal(result.exitCode, 2);
});

test('generated traversal, mismatched Java class and source symlinks are rejected before execution', async t => {
  const generated = '.suffice-v10-checks/GeneratedCheck.java'; const {root, workspace} = await fixture(t, generated, 'public class WrongName {}');
  const run = async () => {assert.fail('invalid inputs must not start a compiler');};
  const traversal = await runPublicGeneratedCheck({lang: 'java', generated: '../secret.java', workspace, tempRoot: root, run});
  assert.match(traversal.error, /under \.suffice-v10-checks/);
  const mismatch = await runPublicGeneratedCheck({lang: 'java', generated, workspace, tempRoot: root, run});
  assert.match(mismatch.error, /matching public class/);
  try {await symlink(join(root, 'outside'), join(workspace, 'escaped'), 'junction');} catch (error) {if (['EPERM', 'EACCES', 'ENOSYS'].includes(error.code)) return; throw error;}
  const linked = await runPublicGeneratedCheck({lang: 'java', generated, workspace, tempRoot: root, run});
  assert.match(linked.error, /Unsupported actor-source entry/);
});

test('all six writer formats are explicit and require the selected generated path', () => {
  assert.deepEqual(Object.keys(PUBLIC_CHECK_INSTRUCTIONS), ['cpp', 'go', 'java', 'javascript', 'python', 'rust']);
  for (const instruction of Object.values(PUBLIC_CHECK_INSTRUCTIONS)) assert.match(instruction, /\.suffice-v10-checks\//);
});
