import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { applyReference, prepWorkspace, runAcceptance } from '../src/v4-polyglot.mjs';

// Fake pytest on PATH stands in for the real toolchain: passes when the restored test exists and the solution says OK.
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'v4-poly-fix-'));
  const src = join(root, 'python', 'exercises', 'practice', 'dot-dsl');
  await mkdir(join(src, '.meta'), { recursive: true });
  await writeFile(join(src, '.meta', 'config.json'),
    JSON.stringify({ files: { solution: ['dot_dsl.py'], test: ['dot_dsl_test.py'], example: ['.meta/example.py'] } }));
  await writeFile(join(src, '.meta', 'example.py'), 'OK\n');
  await writeFile(join(src, 'dot_dsl.py'), 'STUB\n');
  await writeFile(join(src, 'dot_dsl_test.py'), 'TEST\n');
  const bin = join(root, 'bin');
  const empty = join(root, 'empty');
  await mkdir(bin);
  await mkdir(empty);
  await writeFile(join(bin, 'pytest'), '#!/bin/sh\n[ -f dot_dsl_test.py ] || exit 4\ngrep -q SYNTAX dot_dsl.py && exit 2\ngrep -q OK dot_dsl.py\n');
  await chmod(join(bin, 'pytest'), 0o755);
  const task = { taskId: 'python/dot-dsl' };
  const polyRoot = root;
  const env = { ...process.env, PATH: `${bin}:${process.env.PATH}` };
  return { root, src, task, polyRoot, env, empty };
}

test('prepWorkspace hides the acceptance test and leaves the source untouched', async () => {
  const f = await fixture();
  const prep = await prepWorkspace(f.task, { polyRoot: f.polyRoot });
  try {
    assert.equal(existsSync(join(prep.dir, 'dot_dsl_test.py')), false);
    assert.equal(existsSync(join(prep.dir, '.meta')), false);
    assert.equal(await readFile(join(prep.dir, 'dot_dsl.py'), 'utf8'), 'STUB\n');
    assert.deepEqual(prep.hiddenFiles, ['dot_dsl_test.py']);
    assert.equal(prep.acceptanceCommand, 'pytest -q');
    assert.equal(existsSync(join(f.src, 'dot_dsl_test.py')), true);
  } finally {
    await prep.cleanup();
    assert.equal(existsSync(prep.dir), false);
    await rm(f.root, { recursive: true, force: true });
  }
});

test('runAcceptance restores hidden tests and classifies stub, reference, compile and missing toolchain', async () => {
  const f = await fixture();
  const prep = await prepWorkspace(f.task, { polyRoot: f.polyRoot });
  try {
    assert.equal((await runAcceptance(prep, { env: f.env })).kind, 'test_fail');
    await applyReference(f.task, prep.dir, { polyRoot: f.polyRoot });
    const ok = await runAcceptance(prep, { env: f.env });
    assert.deepEqual([ok.pass, ok.kind], [true, 'pass']);
    await writeFile(join(prep.dir, 'dot_dsl.py'), 'SYNTAX\n');
    assert.equal((await runAcceptance(prep, { env: f.env })).kind, 'compile_error');
    assert.equal(existsSync(join(prep.dir, 'dot_dsl_test.py')), false);
    assert.equal((await runAcceptance(prep, { env: { PATH: f.empty } })).kind, 'toolchain_missing');
  } finally {
    await prep.cleanup();
    await rm(f.root, { recursive: true, force: true });
  }
});

test('prepWorkspace rejects unknown languages', async () => {
  await assert.rejects(prepWorkspace({ taskId: 'cobol/hello' }, { polyRoot: tmpdir() }), /bad taskId/);
});
