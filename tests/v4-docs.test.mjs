import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readPolyglotDocs } from '../src/v4-docs.mjs';

test('readPolyglotDocs concatenates in Aider order and skips missing files', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'v4-docs-'));
  try {
    await mkdir(join(dir, '.docs'));
    await writeFile(join(dir, '.docs', 'instructions.append.md'), 'APPEND');
    await writeFile(join(dir, '.docs', 'instructions.md'), 'INSTR');
    await writeFile(join(dir, '.docs', 'introduction.md'), 'INTRO');
    await writeFile(join(dir, '.docs', 'hints.md'), 'HINTS');
    assert.equal(await readPolyglotDocs(dir), 'INTRO\nINSTR\nAPPEND');
    await rm(join(dir, '.docs', 'introduction.md'));
    await rm(join(dir, '.docs', 'instructions.append.md'));
    assert.equal(await readPolyglotDocs(dir), 'INSTR');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
