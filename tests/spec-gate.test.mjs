import test from 'node:test';
import assert from 'node:assert/strict';
import { validateSpecSource, selectAttempt } from '../src/spec-gate.mjs';
const ok = "import test from 'node:test';\nimport assert from 'node:assert/strict';\ntest('a', () => { assert.ok(true); });\n";
test('spec screen accepts a plain node:test file', () => assert.deepEqual(validateSpecSource(ok), { valid: true, tests: 1 }));
test('spec screen rejects forbidden imports, dynamic import, and duplicate names', () => {
  assert.equal(validateSpecSource(ok + "import fs from 'node:fs';").reason, 'import:node:fs');
  assert.equal(validateSpecSource(ok + "await import('x');").reason, 'dynamic_or_process');
  assert.equal(validateSpecSource(ok + "test('a', () => { assert.ok(1); });").reason, 'test_count');
  assert.equal(validateSpecSource('x').reason, 'size');
});
test('selectAttempt requires spec+visible, prefers smaller diff, else escalates', () => {
  const a = (o) => ({ status: 'completed', specAccepted: true, visiblePassed: true, diffLines: 10, ...o });
  assert.deepEqual(selectAttempt([a({ specAccepted: false }), a({ diffLines: 30 }), a({ diffLines: 5 })]), { chosen: 2, reason: 'smallest_diff_among_survivors' });
  assert.equal(selectAttempt([a({ status: 'timeout' }), a({ visiblePassed: false })]).chosen, null);
  assert.equal(selectAttempt([]).reason, 'no_attempt_passed_spec');
});
import { mkdir, writeFile, mkdtemp } from 'node:fs/promises';
import { resolve } from 'node:path';
import { stateDir } from '../src/runtime.mjs';
import { gateSpec } from '../src/spec-gate.mjs';
test('gateSpec: baseline must fail by assertion; candidate acceptance is reported', async () => {
  await mkdir(resolve(stateDir, 'tmp'), { recursive: true });
  const mk = async v => { const d = await mkdtemp(resolve(stateDir, 'tmp/gs-')); await mkdir(resolve(d, 'src')); await writeFile(resolve(d, 'src/package.json'), '{}'); await writeFile(resolve(d, 'src/index.js'), `module.exports = ${v};`); return d; };
  const [bad, good] = [await mk(1), await mk(2)];
  const spec = (body) => `import test from 'node:test';\nimport assert from 'node:assert/strict';\nimport { createRequire } from 'node:module';\nimport { resolve } from 'node:path';\nconst require = createRequire(resolve(process.env.SUFFICE_WORKSPACE, 'src/package.json'));\n${body}\n`;
  const specPath = resolve(stateDir, 'tmp/gs-spec.mjs');
  const ok = await gateSpec({ source: spec("test('is two', () => assert.equal(require('./index.js'), 2));"), specPath, baseline: bad, candidate: good });
  assert.deepEqual([ok.usable, ok.before, ok.after, ok.accepted], [true, 'failed', 'passed', true]);
  const wrong = await gateSpec({ source: spec("test('is three', () => assert.equal(require('./index.js'), 3));"), specPath, baseline: bad, candidate: good });
  assert.equal(wrong.accepted, false);
  const crash = await gateSpec({ source: spec("test('crash', () => { throw new TypeError('x'); });"), specPath, baseline: bad, candidate: good });
  assert.deepEqual([crash.usable, crash.reason], [false, 'baseline_not_assertion_failure']);
  const passing = await gateSpec({ source: spec("test('already ok', () => assert.equal(require('./index.js'), 1));"), specPath, baseline: bad, candidate: good });
  assert.equal(passing.usable, false);
});
