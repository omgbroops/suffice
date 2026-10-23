import test from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { runProcess } from '../src/v4-claude.mjs';

test('timeout kills grandchildren so a held pipe cannot hang the run', { skip: process.platform === 'win32' }, async () => {
  const start = Date.now();
  const out = await runProcess('/bin/sh', ['-c', 'sleep 30 & sleep 30'], { cwd: tmpdir(), timeoutMs: 300 });
  assert.equal(out.timedOut, true);
  assert.ok(Date.now() - start < 5000);
});
