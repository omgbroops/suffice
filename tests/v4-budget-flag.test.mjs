import test from 'node:test';
import assert from 'node:assert/strict';
import { budgetFlag } from '../src/v4-claude.mjs';

test('budget flag never exceeds the remaining budget', () => {
  assert.equal(budgetFlag(0.12345), '0.1234'); // rounding to nearest would give 0.1235 (over)
  assert.equal(budgetFlag(0.5), '0.5000');
  assert.equal(budgetFlag(0.00003), '0.0000'); // exhausted at the CLI precision
});
