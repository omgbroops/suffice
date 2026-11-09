import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { cp, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { tasks } from './tasks.mjs';

function runTest(testPath, workspace) {
  const env = { ...process.env, SUFFICE_WORKSPACE: workspace };
  delete env.NODE_TEST_CONTEXT;
  const result = spawnSync(process.execPath, ['--test', '--test-reporter=tap', testPath], {
    cwd: workspace,
    env,
    encoding: 'utf8',
    timeout: 15_000,
    maxBuffer: 1024 * 1024,
    windowsHide: true,
  });
  assert.ifError(result.error);
  return { status: result.status, output: result.stdout + result.stderr };
}

function inside(root, candidate) {
  const rel = relative(root, candidate);
  return rel !== '' && rel !== '..' && !rel.startsWith('..' + sep) && !isAbsolute(rel);
}

/** Exact, single-occurrence replacements; patches remain outside worker workspaces. */
export async function applyReferencePatch(task, workspace) {
  const patches = JSON.parse(await readFile(task.referencePatchPath, 'utf8'));
  for (const { file, old, new: replacement } of patches) {
    const target = resolve(workspace, file);
    assert.ok(inside(workspace, target), 'Patch must stay within workspace');
    const original = await readFile(target, 'utf8');
    const source = original.replaceAll('\r\n', '\n'), needle=old.replaceAll('\r\n','\n');
    assert.ok(needle.length > 0 && source.split(needle).length === 2, `${task.id}: replacement must match exactly once: ${file}`);
    const patched=source.replace(needle,replacement.replaceAll('\r\n','\n'));
    await writeFile(target,original.includes('\r\n')?patched.replaceAll('\n','\r\n'):patched);
  }
}

export async function verifyTasks(selected = tasks) {
  const temporary = await mkdtemp(join(tmpdir(), 'suffice-fixtures-'));
  const canonicalTemporary = await realpath(temporary);
  const results = [];
  try {
    for (const task of selected) {
      const workspace = join(canonicalTemporary, task.id);
      await cp(task.workspaceDir, workspace, { recursive: true });
      const originalAcceptance = await readFile(task.acceptancePath);
      const acceptanceHash = createHash('sha256').update(originalAcceptance).digest('hex');
      const visible = join(workspace, 'tests', 'visible.test.mjs');
      let result = runTest(visible, workspace);
      assert.equal(result.status, 0, `${task.id}: original visible tests failed\n${result.output}`);
      result = runTest(task.acceptancePath, workspace);
      assert.equal(result.status, 1, `${task.id}: authored bug must fail acceptance\n${result.output}`);
      assert.match(result.output, /# fail [1-9]/, `${task.id}: expected assertion failures, not merely loader failure`);
      await applyReferencePatch(task, workspace);
      result = runTest(visible, workspace);
      assert.equal(result.status, 0, `${task.id}: patched visible tests failed\n${result.output}`);
      result = runTest(task.acceptancePath, workspace);
      assert.equal(result.status, 0, `${task.id}: reference solution failed acceptance\n${result.output}`);
      assert.equal(createHash('sha256').update(await readFile(task.acceptancePath)).digest('hex'), acceptanceHash, 'Acceptance file must remain unchanged');
      results.push({ id: task.id, baselineAcceptance: 'fail', referenceAcceptance: 'pass', visible: 'pass', acceptanceHash });
    }
    return results;
  } finally {
    const canonicalParent = await realpath(tmpdir());
    assert.ok(inside(canonicalParent, canonicalTemporary), 'Cleanup target must remain within the OS temporary directory');
    assert.ok(canonicalTemporary.split(sep).at(-1).startsWith('suffice-fixtures-'), 'Cleanup must target the created fixture directory');
    await rm(canonicalTemporary, { recursive: true, force: true });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  console.log(JSON.stringify(await verifyTasks(), null, 2));
}
