import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
test('oracle-audit flags asserts that bash glob disagrees with and counts skipped ones', () => {
  const f = resolve(mkdtempSync(resolve(tmpdir(), 'oa-')), 't.mjs');
  writeFileSync(f, "assert.ok(isMatch('a', '[!b]'));\nassert.ok(isMatch('b', '[!b]'));\nassert.ok(isMatch(x, 'a', {}));\n");
  const r = JSON.parse(spawnSync('node', [resolve(import.meta.dirname, '../scripts/oracle-audit.mjs'), f], { encoding: 'utf8' }).stdout);
  assert.deepEqual([r.checked, r.skipped, r.disagree], [2, 1, 1]);
  assert.equal(r.dis[0].input, 'b');
});
