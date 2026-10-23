import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseCliOutput } from '../src/v4-claude.mjs';
import { keepPassTranscripts } from '../scripts/v4-bench.mjs';

test('parseCliOutput takes the last result event of stream-json, or plain json', () => {
  assert.equal(parseCliOutput('{"type":"system"}\n{"type":"result","num_turns":3}\n').num_turns, 3);
  assert.equal(parseCliOutput('{"num_turns":2}').num_turns, 2);
});

test('keepPassTranscripts keeps passes under pass/<arm>/<task>/ and deletes failures', async () => {
  const root = mkdtempSync(join(tmpdir(), 'v4-tr-'));
  const mk = name => { const dir = join(root, 'staging', name); mkdirSync(dir, { recursive: true }); writeFileSync(join(dir, '1-m.jsonl'), '{}'); return { dir, files: [join(dir, '1-m.jsonl')] }; };
  const ok = mk('a'), bad = mk('b');
  await keepPassTranscripts(ok, { finalPass: true }, 'single:flint', 'org/t1');
  await keepPassTranscripts(bad, { finalPass: false }, 'single:flint', 't2');
  const dest = join(root, 'pass', 'single:flint', 'org_t1', 'a');
  assert.ok(existsSync(join(dest, '1-m.jsonl')));
  assert.equal(JSON.parse(readFileSync(join(dest, 'row.json'), 'utf8')).finalPass, true);
  assert.ok(!existsSync(bad.dir));
});
