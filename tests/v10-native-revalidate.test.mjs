import {test} from 'node:test';
import assert from 'node:assert/strict';
import {hash} from '../src/v9/workspace.mjs';
import {reviewedBaselineValid} from '../scripts/v10-native-revalidate.mjs';

const stdout = `TAP version 13\nnot ok 1 - accepts valid domain\n  error: 'option domain is invalid'\n  stack: serialize(src/index.js:215:13)\nok 2 - rejects invalid domains\n1..2\n# tests 2\n# pass 1\n# fail 1\n# skipped 0\n# cancelled 0\n# todo 0\n`;
const review = {id: 'cookie', kind: 'reviewed-source-contract-exception', baselineStdoutSha256: hash(stdout),
  productionStackFragment: 'serialize(src/index.js:215:13)', errorFragment: "error: 'option domain is invalid'", testName: 'accepts valid domain'};
const row = {id: 'cookie', baseline: {acceptance: {status: 'failed', exitCode: 1, tests: 2, expectedTests: 2}, regression: {status: 'passed'}},
  reference: {acceptance: {status: 'passed'}, regression: {status: 'passed'}}};
test('reviewed production exception validates a complete baseline without ERR_ASSERTION', () => {
  assert.equal(reviewedBaselineValid(row, review, stdout), true);
});
test('source-exception correction rejects infrastructure failures, changed logs and incomplete validation', () => {
  for (const patch of [{timedOut: true}, {error: 'spawn failed'}, {overflow: true}, {aborted: true}, {exitCode: 2}, {tests: 1}, {status: 'unverified'}]) {
    const copy = structuredClone(row); Object.assign(copy.baseline.acceptance, patch); assert.equal(reviewedBaselineValid(copy, review, stdout), false);
  }
  for (const changed of [stdout.replace('# skipped 0', '# skipped 1'), stdout.replace('# fail 1', '# fail 2'), stdout.replace('serialize(src/index.js:215:13)', 'module loader')]) {
    assert.equal(reviewedBaselineValid(row, {...review, baselineStdoutSha256: hash(changed)}, changed), false);
  }
  assert.equal(reviewedBaselineValid(row, review, stdout + 'changed'), false);
  assert.equal(reviewedBaselineValid(row, {...review, kind: 'arbitrary-error'}, stdout), false);
  for (const section of ['baseline', 'reference']) {const copy = structuredClone(row); copy[section].regression.status = 'failed'; assert.equal(reviewedBaselineValid(copy, review, stdout), false);}
});
