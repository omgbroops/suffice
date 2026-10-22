import test from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdtemp, mkdir, symlink, readFile, lstat, readlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { dirClone, overlaySymlinkFilter } from '../scripts/v4-bench.mjs';

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

// Regression: overlaying a workspace onto a clone that already has the same links threw EINVAL (absolute target) or ENOENT (dangling).
async function linkedDir(prefix) {
  const d = await mkdtemp(join(tmpdir(), prefix));
  await symlink('/usr/bin/true', join(d, 'py'));
  await symlink('./missing', join(d, 'nm'));
  return d;
}

test('overlay copy replaces existing absolute and dangling symlinks', async () => {
  const ws = await linkedDir('symtest-ws-');
  const dst = await linkedDir('symtest-dst-');
  // Old options must still reproduce the bug, otherwise this test proves nothing.
  await assert.rejects(
    cp(ws, dst, { recursive: true, force: true, verbatimSymlinks: true }),
    err => /EINVAL|ENOENT/.test(err.code),
  );
  await cp(ws, dst, { recursive: true, force: true, verbatimSymlinks: true, filter: overlaySymlinkFilter });
  assert.equal(await readlink(join(dst, 'py')), '/usr/bin/true');
  assert.equal(await readlink(join(dst, 'nm')), './missing');
  assert.ok((await lstat(join(dst, 'nm'))).isSymbolicLink());
});
