import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {runCaps} from '../electron/usage.mjs';
import {writeCaps,readCaps,savedRunTokens} from '../electron/budget-caps.mjs';

test('per-run cap: unsaved defaults to 2M, saved 0 is unlimited, saved value wins', () => {
  assert.equal(runCaps({}, undefined).tokens, 2000000);
  assert.equal(runCaps({}, 0).tokens, Infinity);
  assert.equal(runCaps({}, 120).tokens, 120);
});
test('caps accept any integer, including large values and 120', () => {
  const home = mkdtempSync(resolve(tmpdir(), 'bc-'));
  assert.equal(savedRunTokens(home), undefined);
  for (const w of [500000, 99999999999000, 1e21, 9007199254740000]) {
    writeCaps(home, {weeklyTokens: w, runTokens: 120});
    assert.deepEqual(readCaps(home), {weeklyTokens: w, runTokens: 120});
  }
  writeCaps(home, {weeklyTokens: 0, runTokens: 0});
  assert.equal(savedRunTokens(home), 0);
});
test('inputs use step 1 so any integer validates', () => {
  assert.match(readFileSync(new URL('../src/budget-settings.js', import.meta.url), 'utf8'), /step="1"/);
});
