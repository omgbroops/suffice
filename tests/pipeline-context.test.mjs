import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, mkdir, writeFile, rm, symlink} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {prepareTaskContext, verifySourceReferences} from '../src/pipeline/context.mjs';

async function fixture(t) {
  const workspace = await mkdtemp(path.join(os.tmpdir(), 'suffice-context-'));
  t.after(() => rm(workspace, {recursive: true, force: true}));
  await mkdir(path.join(workspace, 'src'));
  await writeFile(path.join(workspace, 'src', 'stream.mjs'), 'export const stream = true;\n');
  await writeFile(path.join(workspace, 'other.json'), '{}');
  return workspace;
}

test('prepared context ranks deterministically, carries explicit contracts and detects stale sources', async t => {
  const workspace = await fixture(t);
  const options = {workspace, task: 'Fix stream behavior', maxFiles: 1, contracts: ['Preserve cancellation'], guidance: ['Use existing conventions'], commands: {test: 'node --test'}};
  const first = await prepareTaskContext(options);
  const second = await prepareTaskContext(options);
  assert.deepEqual(first, second);
  assert.equal(first.sources[0].path, 'src/stream.mjs');
  assert.deepEqual(first.contracts, ['Preserve cancellation']);
  assert.equal((await verifySourceReferences({workspace, references: first.references})).fresh, true);
  await writeFile(path.join(workspace, 'src', 'stream.mjs'), 'changed');
  assert.equal((await verifySourceReferences({workspace, references: first.references})).fresh, false);
});

test('context rejects path escapes, skips oversized files, bounds serialized payload and never reads hidden files automatically', async t => {
  const workspace = await fixture(t);
  await writeFile(path.join(workspace, '.env'), 'SECRET=do-not-read');
  await writeFile(path.join(workspace, 'large.py'), 'x'.repeat(300000));
  await writeFile(path.join(workspace, 'src', 'unicode.py'), '# '+ '\u{1f600}'.repeat(1500));
  const result = await prepareTaskContext({workspace, paths: ['../escape', 'large.py', '.env', 'src/unicode.py'], maxBytes: 1300, maxFileBytes: 300});
  assert.ok(result.skipped.some(item => item.path === '../escape'));
  assert.ok(result.skipped.some(item => item.reason === 'source_size_limit'));
  assert.ok(result.byteUsage <= result.maxBytes);
  const automatic = await prepareTaskContext({workspace});
  assert.equal(automatic.sources.some(item => item.path === '.env'), false);
  assert.equal(result.sources.find(item => item.path === 'src/unicode.py')?.truncated, true);
});

test('source references cannot resolve through an outside workspace symlink', async t => {
  const workspace = await fixture(t);
  const outside = await mkdtemp(path.join(os.tmpdir(), 'suffice-outside-'));
  t.after(() => rm(outside, {recursive: true, force: true}));
  await writeFile(path.join(outside, 'outside.mjs'), 'outside');
  try { await symlink(outside, path.join(workspace, 'linked'), process.platform === 'win32' ? 'junction' : 'dir'); }
  catch (error) { if (error.code === 'EPERM') return t.skip('Symlinks unavailable'); throw error; }
  const result = await prepareTaskContext({workspace, paths: ['linked/outside.mjs']});
  assert.equal(result.sources.length, 0);
  assert.match(result.skipped[0].reason, /outside workspace/);
});
