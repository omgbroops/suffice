// Real claude recordings (tools/tui-record): scrub is clean, recordings are complete, produced items are valid.
// test.todo entries come from CONFORMANCE.json: each is a known mismatch between the parsers and the real TUI.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClaudeMapper } from '../src/tui/claude.mjs';
import { itemProblem } from '../src/tui/model.mjs';
import { createScrubber } from '../tools/tui-record/scrub.mjs';

const root = fileURLToPath(new URL('./fixtures/tui-real/claude/', import.meta.url));
const dirs = fs.existsSync(root) ? fs.readdirSync(root).filter((d) => fs.existsSync(path.join(root, d, 'steps.json'))) : [];
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
const rec = (d) => JSON.parse(fs.readFileSync(path.join(root, d, 'steps.json'), 'utf8'));
// scenarios the recorder marked ok but where claude wrote no transcript (mode-cycle, at-mention, status-idle) are screens-only
const okDirs = dirs.filter((d) => rec(d).status === 'ok' && fs.existsSync(path.join(root, d, 'transcript.jsonl')));

test('scrubber removes emails, home paths, temp dir, uuids, themes, limits (synthetic input)', () => {
  const s = createScrubber({ cwd: '/private/tmp/sfxrec-abc123', user: 'jdoe' });
  const t = s.text('mail g***@gmail.com and bob@corp.io at /Users/jdoe/x and /Users/bob/y in /private/tmp/sfxrec-abc123/a, /tmp/claude-501/z');
  assert.ok(!/@gmail|bob@|jdoe|\/Users\/bob|sfxrec|claude-501/.test(t), t);
  assert.ok(t.includes('/Users/USER/x') && t.includes('/tmp/PROJECT/a'), t);
  const u = '123e4567-e89b-42d3-a456-426614174000';
  assert.equal(s.text(`${u} ${u}`).split(' ')[0], s.text(u));
  assert.ok(!s.text(u).includes('123e4567'));
  const scr = s.screen('theme: neon-mech\nplugin foo\n◐●●○○○○○○○ 42% 90K | wk 17% used\nok line');
  assert.ok(!/neon|plugin|42|17/.test(scr) && scr.includes('ok line'), scr);
  const j = JSON.parse(s.jsonl(JSON.stringify({ a: 'my CLAUDE.md says', b: 'a `@name` b', c: 'fine', d: 'x@y.com' })));
  assert.equal(j.a, '[scrubbed]'); assert.equal(j.b, '[scrubbed]'); assert.equal(j.c, 'fine'); assert.equal(j.d, 'user@example.com');
});

test('recordings exist, each ok scenario has a screen and a transcript', () => {
  assert.ok(okDirs.length > 0, 'no ok recordings');
  for (const d of okDirs) {
    assert.ok(fs.readdirSync(path.join(root, d, 'screens')).some((f) => f.endsWith('.txt')), `${d}: no screens`);
    const t = path.join(root, d, 'transcript.jsonl');
    assert.ok(fs.existsSync(t) && fs.readFileSync(t, 'utf8').trim(), `${d}: no transcript`);
  }
});

test('saved files hold no emails, real home paths, uid dirs or the user name', () => {
  for (const f of walk(root)) {
    const s = fs.readFileSync(f, 'utf8').replace(/user@example\.com/g, '');
    assert.ok(!/[\w.*-]+@[\w.-]+/.test(s), `${f}: email-like`); // a bare '@' typed in the at-mention scenario is fine
    assert.ok(!/\/Users\/(?!USER)/.test(s), `${f}: /Users/`);
    assert.ok(!/claude-501|abhayg/i.test(s), `${f}: uid or name`);
  }
});

test('every item produced from every real transcript passes itemProblem', () => {
  for (const d of okDirs) {
    const m = createClaudeMapper(); const st = m.newState();
    for (const l of fs.readFileSync(path.join(root, d, 'transcript.jsonl'), 'utf8').split('\n').filter(Boolean))
      for (const it of m.mapLine(JSON.parse(l), st)) assert.equal(itemProblem(it), null, `${d}: ${JSON.stringify(it).slice(0, 200)}`);
  }
});

// Known mismatches, derived from the recorded CONFORMANCE.json (regenerate: node tools/tui-record/conformance.mjs).
const cf = fs.existsSync(path.join(root, 'CONFORMANCE.json')) ? JSON.parse(fs.readFileSync(path.join(root, 'CONFORMANCE.json'), 'utf8')) : {};
const todos = new Set();
for (const [d, r] of Object.entries(cf)) {
  for (const x of r.dialogs || []) todos.add(`${d}: dialog ${x.screen} ${x.issues.join('; ')}`);
  for (const x of r.workingNotParsed || []) todos.add(`${d}: working line not parsed on ${x.screen}`);
  for (const k of Object.keys(r.onScreenNoItem || {})) todos.add(`${d}: on screen, no item: ${k}`);
  for (const x of r.toolCategoryMismatches || []) todos.add(`${d}: tool ${x.tool} expected ${x.expected} got ${x.produced}`);
  for (const x of r.subagent || []) if (!x.childFileFound || !x.childSessionId) todos.add(`${d}: subagent item does not link child transcript`);
  for (const k of Object.keys(r.blockTypesWithoutItems || {})) if (!k.startsWith('api-request')) todos.add(`${d}: content block ${k} produced no item`);
  for (const k of Object.keys(r.lineTypesWithoutItems || {})) if (['user', 'assistant', 'system', 'queue-operation', 'sidechain'].includes(k)) todos.add(`${d}: line type ${k} produced no item`);
}
for (const t of todos) test.todo(t);
