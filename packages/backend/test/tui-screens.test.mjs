import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { classifyScreen, parsePickerScreen, pickerSelect, pickerCancel, pickerSearch, screenItems, chrome, TERMINAL_KINDS } from '../src/tui/screens.mjs';
import { createClaudeMapper } from '../src/tui/claude.mjs';
const claude = createClaudeMapper();
import { itemProblem } from '../src/tui/model.mjs';

const dir = join(fileURLToPath(import.meta.url), '..', 'fixtures');
const fx = (p) => readFileSync(join(dir, p), 'utf8');
const BANNER = [' ▐▛███▛█   Claude Code v2.1.325', '▝▜██████▀  Opus 5.5 with high effort · Claude Ultra', '  ▝▝   ▝▝   ~/Downloads', ''].join('\n');
const R = '─'.repeat(100);
const INPUT = `${R}\n❯ \n${R}\n  ? for shortcuts`;
const dec = (b) => new TextDecoder().decode(b.bytes);

const rc = (n) => fx(`tui-real/claude/screens/${n}.txt`);
// Real captures where one exists; the rest are synthetic (written from memory, NOT recorded) and marked `unverified`.
const S = {
  resume: [`${BANNER}\n Resume session\n\n ⌕ Search…\n\n Downloads\n\n ❯ fix the login bug\n   2 hours ago · main · 1.2MB\n\n   add dark mode toggle\n   yesterday · dev · 340KB\n\n Enter to select · Esc to cancel · Ctrl+A to show all projects`, 'picker'],
  model: [fx('tui-real/claude/model-switch/screens/05-model-picker.txt'), 'picker'],
  rewind: [rc('rewind'), 'picker'],
  help: [rc('help-general'), 'dashboard'],
  status: [rc('settings-status'), 'dashboard'],
  cost: [` Total cost:            $0.42\n Total duration (API):  1m 3s\n Total duration (wall): 5m 10s\n Total code changes:    12 lines added, 3 lines removed`, 'dashboard'],
  context: [` Context Usage\n ⛁ ⛀ ⛀ ⛁ ⛁   claude-opus-5-5 · 21k/200k tokens (10%)\n ⛁ System prompt: 3.1k tokens (1.5%)\n ⛁ Messages: 9.8k tokens (4.9%)\n ⛶ Free space: 150k (75%)`, 'dashboard'],
  config: [rc('settings-config'), 'menu'],
  mcp: [rc('mcp'), 'picker'],
  agents: [` Agents\n 3 agents\n\n ❯ Create new agent\n\n   reviewer · sonnet\n   planner · opus\n\n ↑↓ to navigate · Enter to select · Esc to go back`, 'picker'],
  permissions: [rc('permissions-allow'), 'menu'],
  hooks: [rc('hooks'), 'picker'],
  memory: [rc('memory'), 'picker'],
  doctor: [` Diagnostics\n └ Currently running: native (2.1.325)\n └ Path: /usr/local/bin/claude\n └ Auto-updates: enabled\n\n Press Enter to continue…`, 'dashboard'],
  trust: [rc('trust-dialog'), 'trust'],
  login: [` Select login method:\n\n ❯ 1. Claude account with subscription\n   2. Anthropic Console account\n\n Paste code here if prompted >`, 'login'],
  transcript: [rc('transcript-view'), 'transcript-view'],
  tasks: [rc('tasks'), 'picker'],
  export: [` Export Conversation\n\n Select export method:\n\n ❯ 1. Copy to clipboard\n   2. Save to file\n\n Enter to select · Esc to cancel`, 'picker'],
  init: [` Do you want to create CLAUDE.md in /tmp/proj?\n\n ❯ 1. Yes\n   2. No\n\n Enter to confirm · Esc to cancel`, 'permission'],
  bash: [rc('bash-mode'), 'chat'],
  permission: [`${BANNER}\n ● Bash(rm -rf build/)\n\n Do you want to proceed?\n ❯ 1. Yes\n   2. Yes, and don't ask again for rm commands\n   3. No, and tell Claude what to do differently (esc)`, 'permission'],
  question: [fx('tui-real/claude/ask-question/screens/10-dialog.txt'), 'question'],
  plan: [fx('tui-real/claude/plan-mode/screens/10-dialog.txt'), 'plan'],
  chat: [`${BANNER}\n❯ hello\n\n● Hi, how can I help?\n\n${INPUT}`, 'chat'],
  'resume-real': [rc('resume'), 'dashboard'],
  'chat-real': [rc('startup-banner'), 'chat'],
  'permission-real': [rc('permission-prompt'), 'permission'],
  empty: ['', 'unknown'],
  noise: ['lorem ipsum\ndolor sit amet\nconsectetur', 'unknown'],
};
const UNVERIFIED = new Set(Object.keys(S).filter((k) => !['model', 'question', 'plan', 'resume-real', 'chat-real', 'permission-real', 'resume','rewind','help','status','config','mcp','permissions','hooks','memory','trust','tasks','transcript','permission','bash','chat'].includes(k)));

for (const [name, [screen, kind]] of Object.entries(S)) {
  test(`${name} -> ${kind}${UNVERIFIED.has(name) ? ' (unverified)' : ''}`, () => {
    const c = classifyScreen(screen);
    assert.equal(c.kind, kind, JSON.stringify(c).slice(0, 300));
    const p = claude.parsePrompt(screen);
    if (['permission', 'question', 'plan', 'trust'].includes(kind)) assert.ok(p && p.options.length >= 2, 'prompt expected');
    else assert.equal(p, null, 'no options from a non-prompt screen');
    const items = screenItems(screen, 1);
    assert.equal(items.length, TERMINAL_KINDS.includes(kind) ? 1 : 0);
  });
}

test('unverified table covers every synthetic screen', () => {
  const rows = [...UNVERIFIED].sort();
  assert.ok(rows.length >= 6);
  for (const k of rows) assert.ok(S[k]);
});

test('terminal notice: valid item, openTerminal, no options, no scraped text', () => {
  for (const k of ['empty', 'noise', 'help', 'status', 'config', 'login', 'transcript', 'cost']) {
    const items = screenItems(S[k][0], 5);
    assert.equal(items.length, 1, k);
    const it = items[0];
    assert.equal(itemProblem(it), null, k);
    assert.equal(it.kind, 'notice');
    assert.equal(it.openTerminal, true);
    assert.equal(it.text, 'This screen is shown in the terminal view');
    assert.ok(!('options' in it) && !('prompt' in it));
    assert.ok(!JSON.stringify(it).includes('Total cost'));
  }
});

test('mapper exposes classifyScreen and screenItems', () => {
  assert.equal(typeof claude.classifyScreen, 'function');
  assert.equal(typeof claude.screenItems, 'function');
});

test('resume picker parse', () => {
  const p = parsePickerScreen(S.resume[0]);
  assert.equal(p.title, 'Resume session');
  assert.equal(p.searchable, true);
  assert.deepEqual(p.groups, ['Downloads']);
  assert.equal(p.entries.length, 2);
  assert.equal(p.entries[0].label, 'fix the login bug');
  assert.equal(p.entries[0].detail, '2 hours ago · main · 1.2MB');
  assert.equal(p.entries[0].selected, true);
  assert.equal(p.entries[1].label, 'add dark mode toggle');
  assert.equal(p.entries[1].detail, 'yesterday · dev · 340KB');
  assert.equal(p.entries[1].selected, false);
  assert.ok(p.hints.includes('Esc to cancel'));
});

test('resume picker classify carries the parsed picker', () => {
  const c = classifyScreen(S.resume[0]);
  assert.equal(c.title, 'Resume session');
  assert.equal(c.entries.length, 2);
});

test('resume picker: no banner or box text in entries', () => {
  const p = parsePickerScreen(S.resume[0]);
  for (const e of p.entries) assert.ok(!/Claude Code|▐|⌕|Esc/.test(e.label + e.detail));
});

test('model picker parse: numbered entries, selected row, hint footer', () => {
  const p = parsePickerScreen(S.model[0]);
  assert.equal(p.title, 'Select model');
  assert.equal(p.entries.length, 5);
  assert.equal(p.selected, 4);
  assert.ok(p.entries[4].label.startsWith('Haiku 5.5'));
  assert.ok(!p.entries.some((e) => /More models/.test(e.label)));
});

test('picker key drivers', () => {
  const p = parsePickerScreen(S.resume[0]);
  assert.equal(dec(pickerSelect(p, 1)), '\x1b[B\r');
  assert.equal(dec(pickerSelect(p, 0)), '\r');
  const m = parsePickerScreen(S.model[0]);
  assert.equal(dec(pickerSelect(m, 1)), '\x1b[A'.repeat(3) + '\r');
  assert.equal(dec(pickerSelect(m, 0)), '\x1b[A'.repeat(4) + '\r');
  assert.equal(dec(pickerCancel()), '\x1b');
  assert.equal(dec(pickerSearch(p, 'login')), 'login');
  assert.throws(() => pickerSelect(p, 5), RangeError);
  assert.throws(() => pickerSelect(p, -1), RangeError);
  assert.throws(() => pickerSearch(p, 'a\rb'), RangeError);
  assert.throws(() => pickerSearch(m, 'x'), RangeError);
});

test('chrome: banner becomes a session header', () => {
  const c = chrome(S.chat[0]);
  assert.deepEqual(c.header, { version: '2.1.325', model: 'Opus 5.5 with high effort · Claude Ultra', folder: '~/Downloads' });
  assert.ok(!c.rows.some((l) => /Claude Code|▐|▝/.test(l)));
});

test('chrome: header exposed on classify', () => {
  assert.equal(classifyScreen(S.chat[0]).chrome.header.version, '2.1.325');
});

test('chrome: no banner -> null header', () => assert.equal(chrome('hello').header, null));

test('chrome: tmux advisory lines dropped and counted', () => {
  const c = chrome(`tmux detected · scroll with mouse\ntmux focus-events off · notifications may lag\n${R} tmux detected · x\nhello`);
  assert.equal(c.tmux, 3);
  assert.deepEqual(c.rows, ['hello']);
});

test('chrome: rules counted, kept in rows', () => {
  const c = chrome(`a\n${R}\nb\n${R}`);
  assert.equal(c.rules, 2);
});

test('chrome: ansi stripped', () => assert.deepEqual(chrome('\x1b[1mhi\x1b[0m').rows, ['hi']));

test('chrome: tmux text in prose is kept', () => {
  assert.equal(chrome('I use tmux detected things').tmux, 0);
});

test('startup banner alone is not chat options or text', () => {
  const c = classifyScreen(BANNER);
  assert.equal(c.kind, 'unknown');
  assert.equal(claude.parsePrompt(BANNER), null);
});

test('tmux advisory lines never produce options', () => {
  const s = `${BANNER}\ntmux detected · x\ntmux focus-events off · y\n${INPUT}`;
  assert.equal(classifyScreen(s).kind, 'chat');
  assert.equal(claude.parsePrompt(s), null);
});

test('permission prompt content', () => {
  const p = claude.parsePrompt(S.permission[0]);
  assert.equal(p.type, 'permission');
  assert.equal(p.title, 'Do you want to proceed?');
  assert.equal(p.options.length, 3);
  assert.equal(p.selected, 0);
  assert.match(p.body, /rm -rf build/);
});

test('question prompt content', () => {
  const p = claude.parsePrompt(S.question[0]);
  assert.equal(p.type, 'choice');
  assert.equal(p.title, 'Which color do you prefer, red or blue?');
});

test('plan prompt content', () => {
  const p = claude.parsePrompt(S.plan[0]);
  assert.equal(p.type, 'choice');
  assert.deepEqual(p.options.map((o) => o.label), ['Yes, and use auto mode', 'Yes, manually approve edits', 'Tell Claude what to change']);
});

test('trust prompt: unnumbered dialog still works', () => {
  const t = fx('sessionstate/claude-trust.txt');
  assert.equal(classifyScreen(t).kind, 'trust');
  assert.equal(claude.parsePrompt(t).type, 'trust');
});

test('numbered list in chat output is not a prompt', () => {
  const s = `● Steps:\n  1. install\n  2. build\n\n${INPUT}`;
  assert.equal(classifyScreen(s).kind, 'chat');
  assert.equal(claude.parsePrompt(s), null);
});

test('footer-only screens never create options', () => {
  for (const s of ['foo\n  bar\n  baz\nEsc to cancel', '❯ a\n  b\nEnter to confirm · Esc to cancel x']) assert.equal(claude.parsePrompt(s), null);
});

test('box rows are never options', () => {
  const s = ` Pick\n ╭────╮\n │ ❯ a │\n │   b │\n ╰────╯\n Esc to cancel`;
  assert.equal(claude.parsePrompt(s), null);
  assert.equal(parsePickerScreen(s), null);
});

test('search box never becomes an entry', () => {
  const p = parsePickerScreen(S.resume[0]);
  assert.ok(!p.entries.some((e) => /Search/.test(e.label)));
});

test('rule lines never become options', () => {
  assert.equal(claude.parsePrompt(`${R}\n${R}\nEnter to select · Esc to cancel`), null);
});

test('ordinary fixtures stay non-prompts', () => {
  for (const f of ['model-switch/screens/07-help.txt', 'model-switch/screens/08-slash-menu.txt']) assert.equal(claude.parsePrompt(fx(`tui-real/claude/${f}`)), null, f);
});

test('slash menu is never a prompt or chat options', () => {
  const k = classifyScreen(fx('tui-real/claude/model-switch/screens/08-slash-menu.txt')).kind;
  assert.ok(['chat', 'menu', 'picker', 'dashboard', 'unknown'].includes(k));
});

test('classify never throws on garbage', () => {
  for (const g of [undefined, null, 5, {}, [], [1, 2], '\x00\x01', '╭╮╰╯', '❯', '1.', 'x'.repeat(5000)]) {
    const c = classifyScreen(g);
    assert.equal(typeof c.kind, 'string');
    assert.equal(typeof c.confidence, 'number');
  }
});

test('confidence in range and array rows accepted', () => {
  const c = classifyScreen(S.permission[0].split('\n'));
  assert.equal(c.kind, 'permission');
  assert.ok(c.confidence > 0 && c.confidence <= 1);
});

test('every kind in the spec is reachable', () => {
  const got = new Set(Object.values(S).map(([s]) => classifyScreen(s).kind));
  for (const k of ['chat', 'permission', 'question', 'plan', 'picker', 'menu', 'dashboard', 'trust', 'login', 'transcript-view', 'unknown']) assert.ok(got.has(k), k);
});

test('screenItems ids are stable per kind', () => {
  assert.equal(screenItems(S.help[0], 1)[0].id, 'screen:dashboard');
  assert.equal(screenItems(S.noise[0], 1)[0].id, 'screen:unknown');
});

// Real recordings added later: every .txt must classify to something and never throw.
const realDir = join(dir, 'tui-real', 'claude', 'screens');
if (existsSync(realDir)) {
  for (const f of readdirSync(realDir).filter((x) => x.endsWith('.txt'))) {
    test(`real screen ${f}`, () => {
      const t = readFileSync(join(realDir, f), 'utf8');
      const c = classifyScreen(t);
      assert.ok(c.kind);
      if (!['permission', 'question', 'plan', 'trust'].includes(c.kind)) assert.equal(claude.parsePrompt(t), null);
    });
  }
}

// ---- per-screen strictness (one test each) ----
for (const [name, [screen, kind]] of Object.entries(S)) {
  if (['permission', 'question', 'plan', 'trust'].includes(kind)) continue;
  test(`${name}: zero option buttons, zero scraped text`, () => {
    assert.equal(claude.parsePrompt(screen), null);
    for (const it of screenItems(screen, 1)) {
      assert.equal(itemProblem(it), null);
      assert.ok(!('options' in it));
      assert.deepEqual(Object.keys(it).sort(), ['code', 'id', 'kind', 'level', 'openTerminal', 'screenKind', 'text', 'ts']);
    }
  });
}

// ---- extra shapes ----
test('permission with banner and spinner above keeps body clean', () => {
  const s = `${BANNER}\n✻ Thinking… (3s · esc to interrupt)\n\n Do you want to proceed?\n ❯ 1. Yes\n   2. No`;
  const p = claude.parsePrompt(s);
  assert.equal(p.type, 'permission');
  assert.ok(!(p.body ?? '').includes('Thinking'));
  assert.ok(!(p.body ?? '').includes('Claude Code'));
});

test('Yes/No dialog without a cue phrase is still a permission', () => {
  assert.equal(classifyScreen(' Apply this patch?\n\n ❯ 1. Yes\n   2. No').kind, 'permission');
});

test('numbered options without any known cue are not a prompt', () => {
  const s = ' Pick a flavour\n\n 1. vanilla\n 2. chocolate\n';
  assert.equal(claude.parsePrompt(s), null);
});

test('a dialog with the chat input box below is chat, not a prompt', () => {
  const s = ` Do you want to proceed?\n 1. Yes\n 2. No\n${INPUT}`;
  assert.equal(claude.parsePrompt(s), null);
});

test('plain chat with tool output and markers has no prompt', () => {
  const s = `${BANNER}\n❯ run it\n\n● Bash(ls)\n  ⎿ a\n    b\n\n${INPUT}`;
  assert.equal(classifyScreen(s).kind, 'chat');
  assert.equal(claude.parsePrompt(s), null);
});

test('login screen never yields options even with numbered rows', () => {
  assert.equal(claude.parsePrompt(S.login[0]), null);
});

test('transcript view with numbered list text has no options', () => {
  const s = ` 1. one\n 2. two\n Showing detailed transcript · ctrl+o to toggle`;
  assert.equal(classifyScreen(s).kind, 'transcript-view');
  assert.equal(claude.parsePrompt(s), null);
});

test('picker with only a search box parses nothing', () => {
  assert.equal(parsePickerScreen(' Resume session\n\n ⌕ Search…\n\n Esc to cancel'), null);
});

test('picker parser: empty and garbage', () => {
  for (const g of ['', 'abc', undefined, '❯']) assert.equal(parsePickerScreen(g), null);
});

test('picker: non-searchable has searchable false', () => {
  assert.equal(parsePickerScreen(S.rewind[0]).searchable, false);
});

test('picker: hints split on separators', () => {
  const p = parsePickerScreen(S.agents[0]);
  assert.deepEqual(p.hints, ['↑↓ to navigate', 'Enter to select', 'Esc to go back']);
});

test('picker: selected index matches the marked entry', () => {
  const p = parsePickerScreen(S.agents[0]);
  assert.equal(p.selected, 0);
  assert.equal(p.entries[0].label, 'Create new agent');
});

test('key driver: moving up from a later selection', () => {
  const p = { entries: [{}, {}, {}, {}], selected: 3 };
  assert.equal(dec(pickerSelect(p, 0)), '\x1b[A\x1b[A\x1b[A\r');
});

test('key driver: bytes are a Uint8Array', () => {
  assert.ok(pickerCancel().bytes instanceof Uint8Array);
});

test('key driver: non-integer index rejected', () => {
  assert.throws(() => pickerSelect({ entries: [{}], selected: 0 }, 0.5), RangeError);
});

test('controls: no regression of existing keys', () => {
  assert.equal(typeof claude.controls, 'object');
});

test('classifyScreen result is JSON serialisable', () => {
  for (const [s] of Object.values(S)) JSON.parse(JSON.stringify(classifyScreen(s)));
});

test('real fixtures: plan, question and trust classify as their kinds', () => {
  assert.equal(classifyScreen(fx('tui-real/claude/plan-mode/screens/11-dialog.txt')).kind, 'plan');
  assert.equal(classifyScreen(fx('sessionstate/claude-permission.txt')).kind, 'permission');
  assert.equal(classifyScreen(fx('tui-claude/choice.txt')).kind, 'question');
});

test('real idle and working fixtures are chat or unknown, never a prompt', () => {
  for (const f of ['sessionstate/claude-idle.txt', 'sessionstate/claude-working.txt']) {
    assert.ok(['chat', 'unknown'].includes(classifyScreen(fx(f)).kind), f);
    assert.equal(claude.parsePrompt(fx(f)), null);
  }
});

test('TERMINAL_KINDS is exactly the five spec kinds', () => {
  assert.deepEqual([...TERMINAL_KINDS].sort(), ['dashboard', 'login', 'menu', 'transcript-view', 'unknown']);
});
