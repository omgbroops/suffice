import test from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdir, mkdtemp, readFile, readlink, realpath, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Workspaces can hold relative symlinks that point inside the tree (e.g. .azure-pipelines/commands/remote.sh).
test('workspace with an in-tree relative symlink copies without throwing', async () => {
  const dir = await realpath(await mkdtemp(join(tmpdir(), 'v4-cp-')));
  const ws = join(dir, 'ws');
  await mkdir(join(ws, '.azure-pipelines/commands'), { recursive: true });
  await mkdir(join(ws, 'scripts'));
  await writeFile(join(ws, 'scripts/remote.sh'), 'echo hi\n');
  await symlink('../../scripts/remote.sh', join(ws, '.azure-pipelines/commands/remote.sh'));
  const dest = join(dir, 'copy');
  await cp(ws, dest, { recursive: true, verbatimSymlinks: true });
  assert.equal(await readlink(join(dest, '.azure-pipelines/commands/remote.sh')), '../../scripts/remote.sh');
  assert.equal(await readFile(join(dest, 'scripts/remote.sh'), 'utf8'), 'echo hi\n');
});
