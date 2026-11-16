import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as P from '../src/tui/screens-parsers.mjs';

const dir = fileURLToPath(new URL('./fixtures/tui-real/claude/screens/', import.meta.url));
const cap = (n) => fs.readFileSync(`${dir}${n}.txt`, 'utf8');

test('slash list: commands with a selected row, arrow keys', () => {
  const r = P.parseSlashList(cap('slash-list'));
  assert.ok(r.commands.length >= 3 && r.commands[0].name === '/loop' && r.commands[0].selected);
  assert.equal(r.keys.down, '\x1b[B');
  assert.equal(r.keys.enter, '\r');
});

test('settings: typed rows, no tab bar or search box', () => {
  const r = P.parseSettings(cap('settings-config'));
  assert.equal(r.settings[0].label, 'Auto-compact');
  assert.equal(r.settings[0].type, 'boolean');
  assert.ok(r.settings.every((s) => !/Settings|⌕|│/.test(s.label)));
});

test('status dashboard: key/value fields', () => {
  const r = P.parseDashboard(cap('settings-status'));
  assert.equal(r.fields.find((f) => f.key === 'Version').value, '2.1.325');
  assert.equal(r.keys.tab, '\t');
});

test('stats dashboard: two-column rows split into separate fields', () => {
  const f = P.parseDashboard(cap('settings-stats')).fields;
  assert.deepEqual(f.slice(0, 2), [{ key: 'Favorite model', value: 'Sonnet 5.5' }, { key: 'Total tokens', value: '53.8b' }]);
});

test('usage dashboard: cost fields', () => {
  assert.equal(P.parseDashboard(cap('settings-usage')).fields[0].key, 'Total cost');
});

test('context: categories as fields and percent bars', () => {
  const r = P.parseDashboard(cap('context'));
  assert.deepEqual(r.fields[0], { key: 'System prompt', value: '5.2k tokens' });
  assert.equal(r.bars[0].percent, 1.3);
});

test('help: shortcut pairs, no prose row', () => {
  const r = P.parseHelp(cap('shortcuts-help'));
  assert.deepEqual(r.shortcuts[0], { key: '!', action: 'for shell mode' });
  assert.ok(r.shortcuts.some((s) => s.key === 'double tap esc'));
  assert.ok(r.shortcuts.every((s) => s.key !== 'Ask Claude'));
});

test('permissions: numbered rules', () => {
  const r = P.parsePermissions(cap('permissions-allow'));
  assert.deepEqual(r.rules[0], { n: 1, rule: 'Add a new rule…', selected: false });
  assert.equal(r.rules[1].rule, 'mcp__computer-use__computer_batch');
});

test('mcp: servers with status', () => {
  const r = P.parseMcp(cap('mcp'));
  assert.deepEqual(r.servers[0], { name: 'snet', status: 'connected', detail: '19 tools', selected: true });
  assert.ok(r.servers.some((s) => s.name === 'computer-use' && s.status === 'disabled'));
});

test('agents list: state rows', () => {
  const r = P.parseAgents(cap('list-agents'));
  assert.equal(r.agents[0].state, 'waiting');
  assert.equal(r.agents[0].started, '10m ago');
});

test('tasks: counts', () => assert.deepEqual({ ...P.parseTasks(cap('tasks')), keys: undefined }, { running: 0, earlier: 0, keys: undefined }));

test('mode footer', () => {
  assert.equal(P.parseModeFooter(cap('mode-plan')).mode, 'plan');
  assert.equal(P.parseModeFooter(cap('mode-auto')).mode, 'auto');
});

test('file popup: query from the input row', () => assert.equal(P.parseFilePopup(cap('file-mention')).query, 'pack'));

test('history search: filter box and aged entries', () => {
  const r = P.parseHistorySearch(cap('history-search'));
  assert.equal(r.filter, 'Filter history…');
  assert.equal(r.entries[0].text, '/advisor');
});

test('null on non-matching captures', () => {
  assert.equal(P.parseSlashList(cap('mode-auto')), null);
  assert.equal(P.parseMcp(cap('slash-list')), null);
  assert.equal(P.parseModeFooter(cap('mcp')), null);
  assert.equal(P.parseHistorySearch(cap('startup-banner')), null);
  assert.equal(P.parseFilePopup(cap('mode-auto')), null);
  assert.equal(P.parseAgents(cap('mcp')), null);
});
