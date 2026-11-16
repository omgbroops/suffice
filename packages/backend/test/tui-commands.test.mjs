import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { slashCommands, filterCommands, models, efforts, modelControl, pressesToRow, modes, modeControl, KNOWN_AT } from '../src/tui/commands.mjs';

function fakeHome() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tui-cmd-'));
  const w = (p, t) => { fs.mkdirSync(path.dirname(path.join(root, p)), { recursive: true }); fs.writeFileSync(path.join(root, p), t); };
  w('home/.claude/commands/x.md', '---\ndescription: user x\nargument-hint: [file]\n---\nbody');
  w('home/.claude/commands/sub/y.md', 'no frontmatter');
  w('home/.claude/commands/dual.md', '---\ndescription: from commands\n---\n');
  w('home/.claude/skills/dual/SKILL.md', '---\nname: dual\ndescription: from skill\n---\n');
  w('home/.claude/skills/foo/SKILL.md', '---\ndescription: foo skill\n---\n');
  w('proj/.claude/commands/p.md', '---\ndescription: project p\n---\n');
  return { root, home: path.join(root, 'home'), cwd: path.join(root, 'proj') };
}

test('claude discovery tags sources and names', () => {
  const f = fakeHome();
  try {
    const list = slashCommands('claude', { home: f.home, cwd: f.cwd });
    const by = Object.fromEntries(list.map((c) => [c.name, c]));
    assert.equal(by.x.source, 'user');
    assert.equal(by.x.description, 'user x');
    assert.equal(by.x.argumentHint, '[file]');
    assert.equal(by['sub:y'].source, 'user');
    assert.equal(by.p.source, 'project');
    assert.equal(by.foo.source, 'skill');
    assert.equal(by.dual.source, 'skill'); // skill beats command of the same name
    assert.equal(by.dual.description, 'from skill');
    assert.equal(list.filter((c) => c.name === 'dual').length, 1);
    assert.ok(list.filter((c) => c.source === 'builtin').length > 100);
    assert.ok(by.compact?.source === 'builtin');
  } finally { fs.rmSync(f.root, { recursive: true, force: true }); }
});

test('missing home/cwd gives builtins only; codex and unknown agents', () => {
  const l = slashCommands('claude', { home: '/nonexistent-zz', cwd: '/nonexistent-zz' });
  assert.ok(l.length > 100 && l.every((c) => c.source === 'builtin'));
  const cx = slashCommands('codex', {});
  assert.ok(cx.length > 40 && cx.every((c) => c.source === 'builtin'));
  assert.ok(cx.some((c) => c.name === 'model'));
  assert.deepEqual(slashCommands('nope', {}), []);
});

test('filterCommands puts prefix matches before substring matches and keeps order', () => {
  const list = [{ name: 'xcompact' }, { name: 'compact' }, { name: 'config' }, { name: 'zzz' }, { name: 'comp-b' }];
  assert.deepEqual(filterCommands(list, '/comp').map((c) => c.name), ['compact', 'comp-b', 'xcompact']);
  assert.deepEqual(filterCommands(list, '').map((c) => c.name), list.map((c) => c.name));
  assert.deepEqual(filterCommands(list, 'nomatch'), []);
});

test('models and efforts shape', () => {
  for (const a of ['claude', 'codex']) {
    const ms = models(a);
    assert.ok(ms.length >= 5);
    for (const m of ms) { assert.ok(m.id && m.label); assert.equal(m.knownAt, KNOWN_AT); }
  }
  assert.ok(models('claude').some((m) => m.id === 'opus'));
  assert.ok(efforts('claude').includes('xhigh'));
  assert.ok(efforts('codex').length >= 3);
  assert.deepEqual(models('nope'), []);
});

test('modelControl plan: Claude never types /model <alias>, Codex saves default', () => {
  const p = modelControl('claude', 'opus');
  assert.equal(p.savesDefault, false);
  assert.deepEqual(p.steps.map((s) => Object.keys(s)[0]), ['send', 'waitPicker', 'selectLabelMatching', 'key']);
  assert.equal(p.steps[0].send, '/model');
  assert.equal(p.steps[3].key, 's');
  for (const s of p.steps) assert.ok(!/^\/model\s+\S/.test(s.send || ''));
  const re = new RegExp(p.steps[2].selectLabelMatching, 'i');
  assert.ok(re.test('Opus 5.5') && !re.test('Default (recommended) Opus 5.5'));
  assert.ok(new RegExp(modelControl('claude', 'haiku').steps[2].selectLabelMatching, 'i').test('Haiku 5.5'));
  assert.throws(() => modelControl('claude', 'nope'), RangeError);
  const c = modelControl('codex', 'gpt-x');
  assert.equal(c.savesDefault, true);
  assert.deepEqual(c.steps, [{ send: '/model gpt-x', enter: true }]);
});

test('pressesToRow: target above, below, absent', () => {
  const opts = ['Default (recommended) Opus 5.5', 'Opus 5.5', 'Fable 5.2', 'Sonnet 5.5', 'Haiku 5.5'].map((label, i) => ({ index: i + 1, label }));
  assert.equal(pressesToRow(opts, 5, '^Sonnet'), -1);
  assert.equal(pressesToRow(opts, 5, '^Opus\\b'), -3);
  assert.equal(pressesToRow(opts, 2, '^Haiku'), 3);
  assert.equal(pressesToRow(opts, 4, '^Sonnet'), 0);
  assert.equal(pressesToRow(opts, 4, '^Nope'), null);
  assert.equal(pressesToRow(opts, 9, '^Sonnet'), null);
});

const CLAUDE_IDS = ['default', 'acceptEdits', 'plan', 'bypassPermissions', 'auto'];
const dec = (s) => s;
for (const bypass of [false, true]) for (const auto of [false, true]) {
  test(`claude cycle arithmetic bypass=${bypass} auto=${auto}: every from/to pair`, () => {
    const cycle = CLAUDE_IDS.filter((m) => (m !== 'bypassPermissions' || bypass) && (m !== 'auto' || auto));
    const n = cycle.length;
    let pairs = 0;
    for (const from of cycle) for (const to of cycle) {
      const out = dec(modeControl('claude', from, to, { bypass, auto }));
      const want = (cycle.indexOf(to) - cycle.indexOf(from) + n) % n;
      assert.equal(out, '\x1b[Z'.repeat(want), `${from}->${to}`);
      pairs++;
    }
    assert.equal(pairs, n * n);
  });
}

test('claude: dontAsk and out-of-cycle modes throw; same mode is empty', () => {
  assert.throws(() => modeControl('claude', 'default', 'dontAsk'), RangeError);
  assert.throws(() => modeControl('claude', 'dontAsk', 'plan'), RangeError);
  assert.throws(() => modeControl('claude', 'default', 'auto', { auto: false }), RangeError);
  assert.equal(modeControl('claude', 'plan', 'plan'), '');
});

test('codex: every from/to pair', () => {
  const ids = modes('codex').map((m) => m.id);
  assert.ok(ids.length >= 4);
  for (const from of ids) for (const to of ids) {
    const out = modeControl('codex', from, to);
    if (from === to) { assert.equal(out, ''); continue; }
    assert.equal(out, to === 'plan' || to === 'default' ? '\x1b[Z' : '/permissions\r', `${from}->${to}`);
  }
  assert.throws(() => modeControl('codex', 'default', 'bogus'), RangeError);
  assert.throws(() => modeControl('nope', 'a', 'b'), RangeError);
});

test('claude mode list has the six documented modes', () => {
  assert.deepEqual(modes('claude').map((m) => m.id).sort(), [...CLAUDE_IDS, 'dontAsk'].sort());
});
