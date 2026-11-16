import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures/tui-real/claude/screens');
const index = JSON.parse(fs.readFileSync(path.join(dir, 'INDEX.json'), 'utf8'));

test('every indexed capture is non-empty plain text without emails', () => {
  assert.ok(index.captures.length > 0);
  for (const c of index.captures) {
    const t = fs.readFileSync(path.join(dir, c.file), 'utf8');
    assert.ok(t.trim().length > 0, `${c.file} empty`);
    assert.ok(!t.includes('\x1b'), `${c.file} has ESC`);
    assert.ok(!/[^\s]+@[^\s]+/.test(t), `${c.file} has email pattern`);
    assert.ok(c.keys && c.closed && c.rows && c.cols && c.version, `${c.file} missing metadata`);
  }
});

test('index matches files on disk', () => {
  const disk = fs.readdirSync(dir).filter((f) => f.endsWith('.txt')).sort();
  assert.deepEqual(index.captures.map((c) => c.file).sort(), disk);
  for (const s of index.skipped) assert.ok(s.command && s.reason);
});

test('captures contain no owner identifiers or home paths', () => {
  const dir = new URL('./fixtures/tui-real/claude/screens/', import.meta.url);
  for (const f of fs.readdirSync(dir)) {
    const t = fs.readFileSync(new URL(f, dir), 'utf8');
    assert.ok(!/abhay|godavarthy/i.test(t), `${f} has owner name`);
    assert.ok(!/\/Users\//.test(t), `${f} has home path`);
  }
});
