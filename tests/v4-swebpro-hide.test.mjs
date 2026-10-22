import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gitDiff, hideTestPatch } from '../src/v4-swebpro.mjs';

const git = (dir, ...args) => execFileSync('git', ['-C', dir, '-c', 'user.name=t', '-c', 'user.email=t@t', ...args], { encoding: 'utf8' }).trim();

test('hideTestPatch keeps base versions and removes only files new at base', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'swebpro-hide-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  git(dir, 'init', '-q');
  await mkdir(join(dir, 'tests'), { recursive: true });
  await writeFile(join(dir, 'tests/old.py'), 'base');
  git(dir, 'add', '-A');
  git(dir, 'commit', '-q', '-m', 'A');
  const base = git(dir, 'rev-parse', 'HEAD');
  await writeFile(join(dir, 'tests/old.py'), 'hidden');
  await writeFile(join(dir, 'tests/new.py'), 'new');
  git(dir, 'add', '-A');
  git(dir, 'commit', '-q', '-m', 'B');

  const removed = await hideTestPatch(dir, base, ['tests/old.py', 'tests/new.py']);
  assert.equal(await readFile(join(dir, 'tests/old.py'), 'utf8'), 'base');
  assert.equal(existsSync(join(dir, 'tests/new.py')), false);
  assert.deepEqual(removed, ['tests/new.py']);
});

test('hideTestPatch removes every file when dir is not a repo', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'swebpro-hide-norepo-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  await mkdir(join(dir, 'tests'), { recursive: true });
  await writeFile(join(dir, 'tests/a.py'), 'a');
  await writeFile(join(dir, 'tests/b.py'), 'b');
  const removed = await hideTestPatch(dir, 'deadbeef', ['tests/a.py', 'tests/b.py']);
  assert.deepEqual(removed, ['tests/a.py', 'tests/b.py']);
  assert.equal(existsSync(join(dir, 'tests/a.py')), false);
  assert.equal(existsSync(join(dir, 'tests/b.py')), false);
});

test('gitDiff excludes grader-owned test paths and keeps src edits', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'swebpro-diff-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  git(dir, 'init', '-q');
  await mkdir(join(dir, 'src'), { recursive: true });
  await mkdir(join(dir, 'tests'), { recursive: true });
  await writeFile(join(dir, 'src/a.py'), 'base');
  await writeFile(join(dir, 'tests/t.py'), 'base');
  git(dir, 'add', '-A');
  git(dir, 'commit', '-q', '-m', 'A');
  await writeFile(join(dir, 'src/a.py'), 'fixed');
  await writeFile(join(dir, 'tests/t.py'), 'agent test at the grader path');

  const diff = await gitDiff(dir, ['tests/t.py']);
  assert.match(diff, /src\/a\.py/);
  assert.doesNotMatch(diff, /tests\/t\.py/);
});
