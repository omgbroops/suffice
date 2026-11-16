// Baseline: BASELINE_PLACEHOLDER
// One test per real capture (fixtures/tui-real/claude/screens). Expected kinds were decided from each capture's tail
// and its INDEX entry before the classifier was run. Text-input and slider dialogs have no selectable list: dashboard.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { classifyScreen } from '../src/tui/screens.mjs';

const dir = fileURLToPath(new URL('./fixtures/tui-real/claude/screens/', import.meta.url));
import { TABLE } from './fixtures/tui-real/claude/screens-expected.mjs';
const OPT_KINDS = new Set(['permission', 'question', 'plan', 'trust']);

test('table covers every capture exactly once', () => {
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.txt')).map((f) => f.slice(0, -4)).sort();
  assert.deepEqual(TABLE.map((r) => r[0]).sort(), files);
});

for (const [file, kind, title, count] of TABLE) {
  test(`capture ${file} is ${kind}`, () => {
    const r = classifyScreen(fs.readFileSync(dir + file + '.txt', 'utf8'));
    assert.equal(r.kind, kind);
    if (!OPT_KINDS.has(kind)) assert.ok(!(r.prompt?.options?.length), 'no option buttons');
    if (kind === 'permission') assert.equal(r.prompt.options.length, 3);
    if (title) assert.equal(r.title, title);
    if (count !== undefined) assert.equal(r.entries?.length ?? r.options?.length ?? 0, count);
    if (file.endsWith('startup-banner')) {
      assert.match(r.chrome.header?.version ?? '', /2\.1\.325/);
      assert.ok(!r.chrome.tmux?.length || r.chrome.tmux.every((l) => !/tmux/i.test(l)));
    }
  });
}
