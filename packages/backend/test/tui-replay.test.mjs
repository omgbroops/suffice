import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { run, buildReport, buildFindings, writeOutputs, leakCheck, eachLine } from '../tools/tui-replay/replay.mjs';

const J = (...a) => `${a.map((x) => JSON.stringify(x)).join('\n')}\n`;
const T = (s) => `2026-01-01T00:00:${String(s).padStart(2, '0')}.000Z`;

function fakeHome() {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'tui-replay-test-'));
  const proj = path.join(home, '.claude', 'projects', 'p1');
  fs.mkdirSync(path.join(proj, 'sess1', 'subagents'), { recursive: true });
  fs.writeFileSync(path.join(proj, 'sess1.jsonl'), J(
    { type: 'permission-mode', permissionMode: 'default', sessionId: 'sess1' },
    { type: 'queue-operation', operation: 'enqueue', timestamp: T(0) },
    { type: 'user', uuid: 'u1', timestamp: T(1), entrypoint: 'cli', promptSource: 'typed', cwd: '/x', gitBranch: 'main', sessionId: 'sess1', message: { role: 'user', content: 'hi' } },
    { type: 'assistant', uuid: 'a1', timestamp: T(2), sessionId: 'sess1', message: { id: 'm1', model: 'claude-test', usage: { input_tokens: 1, output_tokens: 2 }, content: [
      { type: 'thinking', thinking: '', signature: 'sig' }, { type: 'text', text: 'ok' },
      { type: 'tool_use', id: 'tu1', name: 'Bash', input: { command: 'ls' } },
      { type: 'tool_use', id: 'tu2', name: 'mcp__srv__x', input: {} },
      { type: 'tool_use', id: 'tu3', name: 'Agent', input: { prompt: 'p' } }] } },
    { type: 'user', uuid: 'u2', timestamp: T(3), sessionId: 'sess1', toolUseResult: { stdout: 'a', stderr: '' }, message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'tu1', content: 'a' }] } },
    { type: 'user', uuid: 'u3', timestamp: T(4), sessionId: 'sess1', toolUseResult: { agentId: 'abc123', status: 'completed' }, message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'tu3', content: 'done' }] } },
    { type: 'system', subtype: 'turn_duration', uuid: 's1', timestamp: T(5), durationMs: 5000 },
    { type: 'brand-new-type', timestamp: T(6) },
  ));
  fs.writeFileSync(path.join(proj, 'sess1', 'subagents', 'agent-abc123.jsonl'), J(
    { type: 'user', uuid: 'c1', isSidechain: true, timestamp: T(10), sessionId: 'sess1', message: { role: 'user', content: 'child prompt' } },
    { type: 'assistant', uuid: 'c2', isSidechain: true, timestamp: T(11), sessionId: 'sess1', message: { id: 'm2', model: 'claude-test', content: [{ type: 'text', text: 'child' }] } },
  ));
  const cdir = path.join(home, '.codex', 'sessions', '2026', '01', '01');
  fs.mkdirSync(cdir, { recursive: true });
  fs.writeFileSync(path.join(cdir, 'rollout-2026-01-01T00-00-00-00000000-0000-4000-8000-000000000001.jsonl'), J(
    { timestamp: T(0), type: 'session_meta', payload: { id: '00000000-0000-4000-8000-000000000001', cwd: '/x', source: 'cli' } },
    { timestamp: T(1), type: 'event_msg', payload: { type: 'user_message', message: 'hello' } },
    { timestamp: T(2), type: 'event_msg', payload: { type: 'agent_message', message: 'there' } },
    { timestamp: T(3), type: 'event_msg', payload: { type: 'token_count', info: null } },
    { timestamp: T(4), type: 'something_new', payload: {} },
  ));
  return home;
}

test('replay counts a synthetic home and writes a clean report', async () => {
  const home = fakeHome(), out = fs.mkdtempSync(path.join(os.tmpdir(), 'tui-replay-out-'));
  try {
    const r = await run({ home, minutes: 1 });
    const rep = buildReport(r, home);
    assert.equal(rep.coverage.groups['claude.interactive'].done, 1);
    assert.equal(rep.coverage.groups['claude.subagent'].done, 1);
    assert.equal(rep.coverage.groups['codex.all'].done, 1);
    assert.equal(rep.claude.lines, 10);
    assert.equal(rep.claude.lineCoverage['queue-operation'].none, 1);
    assert.equal(rep.claude.lineCoverage['brand-new-type'].none, 1);
    assert.equal(rep.claude.tools['mcp__*'].calls, 1);
    assert.equal(rep.claude.tools.Bash.noResult, 0);
    assert.equal(rep.claude.tools['mcp__*'].noResult, 1);
    assert.equal(rep.claude.thinking.empty, 1);
    assert.equal(rep.claude.thinking.itemsEmitted, 0);
    assert.equal(rep.claude.subagents.calls, 1);
    assert.equal(rep.claude.subagents.exact, 1);
    assert.equal(rep.codex.lineCoverage.something_new.none, 1);
    assert.equal(rep.codex.lines, 5);
    assert.ok(JSON.stringify(rep).indexOf('child prompt') < 0 && JSON.stringify(rep).indexOf(home) < 0);
    const { lines } = writeOutputs(r, home, out);
    assert.ok(lines.length > 0);
    assert.ok(fs.existsSync(path.join(out, 'REPORT.json')) && fs.existsSync(path.join(out, 'FINDINGS.txt')));
    assert.ok(buildFindings(rep).every((l) => !l.includes('\n')));
  } finally { fs.rmSync(home, { recursive: true, force: true }); fs.rmSync(out, { recursive: true, force: true }); }
});

test('leak check rejects long strings, spaces and paths; accepts plain names', () => {
  assert.doesNotThrow(() => leakCheck({ a: { 'user.string': 3, mcp__x: 1 }, b: ['Bash'] }));
  assert.throws(() => leakCheck({ a: 'x'.repeat(100) }), /over 80/);
  assert.throws(() => leakCheck({ a: 'two words' }), /space/);
  assert.throws(() => leakCheck({ a: 'a/b' }), /separator/);
  assert.throws(() => leakCheck({ 'bad key': 1 }), /space/);
});

test('eachLine skips lines over 5 MB and counts them', async () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'tui-replay-line-')), f = path.join(d, 'a.jsonl');
  try {
    fs.writeFileSync(f, `a\n${'x'.repeat(5 * 1024 * 1024 + 10)}\nb\n`);
    const got = [], st = { bytes: 0, skippedLong: 0, unreadable: 0 };
    await eachLine(f, (l) => { got.push(l); }, st);
    assert.deepEqual(got, ['a', 'b']);
    assert.equal(st.skippedLong, 1);
  } finally { fs.rmSync(d, { recursive: true, force: true }); }
});
