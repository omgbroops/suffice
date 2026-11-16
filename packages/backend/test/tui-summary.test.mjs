import { test } from 'node:test';
import assert from 'node:assert/strict';
import { summarizeTools } from '../src/tui/summary.mjs';

const tool = (category, extra = {}) => ({ kind: 'tool', category, status: 'ok', ...extra });
const edit = (diff, status = 'ok') => tool('edit', { status, output: diff ? { diff } : undefined });
const text = (items) => summarizeTools(items).text;

test('each category, singular and plural', () => {
  assert.equal(text([tool('shell')]), 'Ran 1 shell command');
  assert.equal(text([tool('shell'), tool('shell')]), 'Ran 2 shell commands');
  assert.equal(text([tool('read')]), 'Read 1 file');
  assert.equal(text([tool('read'), tool('read'), tool('read')]), 'Read 3 files');
  assert.equal(text([tool('search')]), 'Searched 1 time');
  assert.equal(text([tool('search'), tool('search')]), 'Searched 2 times');
  assert.equal(text([tool('web')]), 'Fetched 1 page');
  assert.equal(text([tool('web'), tool('web')]), 'Fetched 2 pages');
  assert.equal(text([{ kind: 'subagent', status: 'ok' }]), 'Ran 1 subagent');
  assert.equal(text([{ kind: 'todo' }]), 'Updated 1 todo list');
  assert.equal(text([tool('mcp')]), 'Used 1 tool');
  assert.equal(text([tool('mcp'), tool('other')]), 'Used 2 tools');
});

test('edits sum diff lines from patch or old/new text; write counts as an edit', () => {
  const patch = '--- a\n+++ b\n@@\n-old\n+new1\n+new2\n context';
  assert.equal(text([edit([{ path: 'a', patch }])]), 'Made 1 edit +2 -1');
  assert.equal(text([edit([{ path: 'a', oldText: 'x\ny', newText: 'p\nq\nr' }]), tool('write', { output: { diff: [{ path: 'b', newText: 'one\n' }] } })]), 'Made 2 edits +4 -2');
  assert.equal(text([edit([{ path: 'a', newText: 'a\nb' }])]), 'Made 1 edit +2'); // no -R when zero
  assert.deepEqual(summarizeTools([edit([{ path: 'a', patch }])]).parts, [{ category: 'edit', count: 1, added: 2, removed: 1 }]);
});

test('unknown diff sizes omit the counts', () => {
  assert.equal(text([edit(null)]), 'Made 1 edit');
  assert.equal(text([edit([{ path: 'a' }])]), 'Made 1 edit');
  assert.equal(summarizeTools([edit(null)]).parts[0].added, undefined);
});

test('mixed runs keep first-seen order and join with commas', () => {
  const r = summarizeTools([tool('read'), tool('shell'), tool('read'), edit([{ path: 'a', newText: 'x' }]), tool('search')]);
  assert.equal(r.text, 'Read 2 files, ran 1 shell command, made 1 edit +1, searched 1 time');
  assert.deepEqual(r.parts.map((p) => [p.category, p.count]), [['read', 2], ['shell', 1], ['edit', 1], ['search', 1]]);
});

test('failures and denials go last', () => {
  assert.equal(text([tool('shell'), tool('shell', { status: 'error' })]), 'Ran 2 shell commands, 1 failed');
  assert.equal(text([tool('shell', { status: 'denied' }), tool('read')]), 'Ran 1 shell command, read 1 file, 1 denied');
  assert.equal(text([tool('shell', { status: 'error' }), tool('read', { status: 'denied' }), tool('read', { status: 'error' })]), 'Ran 1 shell command, read 2 files, 2 failed, 1 denied');
});

test('running calls use the present tense and end with an ellipsis', () => {
  assert.equal(text([tool('shell', { status: 'running' })]), 'Running 1 shell command…');
  assert.equal(text([tool('read'), tool('read', { status: 'running' })]), 'Read 1 file, reading 1 file…');
  assert.equal(text([{ kind: 'subagent', status: 'running' }]), 'Running 1 subagent…');
});

test('empty and non-tool input', () => {
  assert.deepEqual(summarizeTools([]), { text: '', parts: [] });
  assert.deepEqual(summarizeTools(null), { text: '', parts: [] });
  assert.equal(text([{ kind: 'assistant', text: 'hi' }]), '');
});
