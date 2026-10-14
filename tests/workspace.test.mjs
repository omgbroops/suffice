import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { scopedPath, runNodeTests } from '../src/workspace.mjs';

test('workspace paths reject traversal, hidden paths and test edits', async () => {
  const root = await mkdtemp(resolve(tmpdir(), 'suffice-scope-'));
  try {
    for (const path of ['../.env', '.env', 'src/../../outside', 'C:/Windows/system.ini']) await assert.rejects(scopedPath(root, path));
    await assert.rejects(scopedPath(root, 'tests/a.mjs', { write: true }));
    assert.equal(await scopedPath(root, 'src/new.mjs', { write: true }), resolve(root, 'src/new.mjs'));
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('test subprocess has no keys and cannot read parent files or spawn subprocesses', async () => {
  const root = await mkdtemp(resolve(tmpdir(), 'suffice-permissions-'));
  try {
    const workspace = resolve(root, 'workspace'); await mkdir(workspace);
    await writeFile(resolve(root, 'secret'), 'private');
    const code = `import test from 'node:test'; import assert from 'node:assert/strict'; import fs from 'node:fs'; import cp from 'node:child_process'; test('isolated',()=>{assert.equal(process.env.OPENROUTER_API_KEY,undefined); assert.throws(()=>fs.readFileSync('../secret')); assert.throws(()=>cp.spawnSync(process.execPath,['-v']));});`;
    const path = resolve(workspace, 'check.mjs'); await writeFile(path, code);
    const result = await runNodeTests(workspace, path);
    assert.equal(result.status, 'passed', JSON.stringify(result)); assert.equal(result.tests, 1);
  } finally { await rm(root, { recursive: true, force: true }); }
});
