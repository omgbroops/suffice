import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, realpath, rm, writeFile, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { makeSelfCheck } from '../src/v4-selfsignal.mjs';

test('self check: a later pass cannot hide an earlier failing command, and fixed ones are forgotten', async t => {
  const ws = await realpath(await mkdtemp(join(tmpdir(), 'v4-selfcheck-')));
  t.after(() => rm(ws, { recursive: true, force: true }));
  const marker = join(ws, 'a.ok');
  const check = makeSelfCheck({ timeoutMs: 20_000 });
  const say = cmd => ({ workspace: ws, text: `done\nSELFTEST: ${cmd}`, env: {} });
  const failing = `test -f ${marker}`;

  const first = await check(say(failing));
  assert.equal(first.signal, 'fail');

  const narrowed = await check(say('true'));
  assert.equal(narrowed.signal, 'fail');
  assert.equal(narrowed.tail.startsWith(`earlier failing check still fails: ${failing}\n`), true);

  await writeFile(marker, '');
  const fixed = await check(say('true'));
  assert.equal(fixed.signal, 'pass');

  await unlink(marker);
  const forgotten = await check(say('true'));
  assert.equal(forgotten.signal, 'pass');
});
