import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sandboxProfile, sandboxCommand, pathVariants, sbplString } from '../src/v4-claude.mjs';

test('sandbox profile denies the given trees and re-allows the workspace base', () => {
  const profile = sandboxProfile({ denied: ['/Users/x/bench-repos'], allowed: ['/Users/x/bench-repos/run'] });
  assert.match(profile, /^\(version 1\)\n\(allow default\)/);
  assert.ok(profile.includes('(deny file-read-data (subpath "/Users/x/bench-repos"))'));
  assert.ok(profile.includes('(deny file-read-data (subpath "/System/Volumes/Data/Users/x/bench-repos"))'));
  assert.ok(profile.includes('(allow file-read-data (subpath "/Users/x/bench-repos/run"))'));
  // Allow lines must come after every deny line (last match wins).
  assert.ok(profile.lastIndexOf('(deny') < profile.indexOf('(allow file-read-data'));
});

test('sbplString escapes backslash and quote', () => {
  assert.equal(sbplString('a"b\\c'), '"a\\"b\\\\c"');
});

test('pathVariants includes the Data-volume alias', () => {
  assert.ok(pathVariants('/definitely/not/here').includes('/System/Volumes/Data/definitely/not/here'));
});

test('sandbox-exec denies a read under a denied dir and allows the workspace base', { skip: process.platform !== 'darwin' }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'sbx-'));
  const denied = join(root, 'fake-hidden');
  const base = join(root, 'base');
  await mkdir(denied, { recursive: true });
  await mkdir(join(base, 'tmp'), { recursive: true });
  await writeFile(join(denied, 'oracle.txt'), 'secret');
  await writeFile(join(base, 'ok.txt'), 'fine');
  const profile = sandboxProfile({ denied: [denied], allowed: [base] });
  const bad = spawnSync('sandbox-exec', ['-p', profile, 'cat', join(denied, 'oracle.txt')], { encoding: 'utf8' });
  assert.notEqual(bad.status, 0);
  assert.equal(bad.stdout, '');
  const good = spawnSync('sandbox-exec', ['-p', profile, 'cat', join(base, 'ok.txt')], { encoding: 'utf8' });
  assert.equal(good.status, 0);
  assert.equal(good.stdout, 'fine');
});

test('sandboxCommand puts TMPDIR inside the workspace base', { skip: process.platform !== 'darwin' }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'sbx-cmd-'));
  const workspace = join(root, 'task');
  await mkdir(workspace);
  const wrapped = await sandboxCommand('echo', ['hi'], workspace);
  assert.equal(wrapped.bin, 'sandbox-exec');
  assert.equal(wrapped.env.TMPDIR, join(root, 'tmp'));
});
