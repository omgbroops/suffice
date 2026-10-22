import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, symlink, readFile, lstat, readlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { dirClone } from '../scripts/v4-bench.mjs';

// Regression: dereferencing copies failed on absolute/dangling symlinks (venv python3, node_modules links).
test('dirClone keeps absolute and dangling symlinks as links', async () => {
  const src = await mkdtemp(join(tmpdir(), 'symtest-src-'));
  await writeFile(join(src, 'a.txt'), 'hi');
  await mkdir(join(src, 'venv', 'bin'), { recursive: true });
  await symlink('/nonexistent/python3', join(src, 'venv', 'bin', 'python3'));
  const clone = await dirClone(src);
  try {
    assert.equal(await readFile(join(clone.dir, 'a.txt'), 'utf8'), 'hi');
    assert.equal(await readlink(join(clone.dir, 'venv', 'bin', 'python3')), '/nonexistent/python3');
    assert.ok((await lstat(join(clone.dir, 'venv', 'bin', 'python3'))).isSymbolicLink());
  } finally { await clone.cleanup(); }
});
