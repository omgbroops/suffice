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
