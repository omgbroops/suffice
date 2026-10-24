import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reason } from '../scripts/handoff-evidence.mjs';

test('reason() reads row fields only', () => {
  assert.equal(reason({ status: 'completed', finalPass: true }), null);
  assert.equal(reason({ status: 'run_timeout' }), 'run_timeout');
  assert.equal(reason({ status: 'completed', selfFinalPass: true }), 'self/gate pass, hidden fail');
  assert.equal(reason({ status: 'completed', selfFinalPass: false, fixRounds: 2 }), 'self/gate fail after 2 fix, shipped');
  assert.equal(reason({ status: 'completed' }), 'hidden fail (no self field)');
});
