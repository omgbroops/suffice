import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { screensCoverage } from '../src/tui/screens-coverage.mjs';
import { TABLE } from './fixtures/tui-real/claude/screens-expected.mjs';

const dir = fileURLToPath(new URL('./fixtures/tui-real/claude/screens', import.meta.url));

test('coverage numbers are pinned', () => {
  const c = screensCoverage(dir, TABLE);
  console.log(JSON.stringify(c));
  assert.equal(c.commandsTotal, 173);
  assert.equal(c.captured, 61);
  assert.equal(c.classifiedCorrectly, 61);
  assert.equal(Object.values(c.neverOpened).reduce((a, b) => a + b, 0), 149);
  assert.equal(c.withParser, 53);
  assert.equal(c.fallbackNotice, 6);
  assert.deepEqual(c.fallback, ['add-dir', 'effort', 'permissions-recently-blocked', 'plugin', 'skill-doctor', 'workflows']);
  assert.deepEqual(Object.values(c.neverOpened).sort((a, b) => a - b), [4, 11, 19, 25, 90]);
});
