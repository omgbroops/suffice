import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGenericMapper } from '../src/tui/generic.mjs';
import { landscape, mappingPlan, acpCount } from '../src/tui/landscape.mjs';
import { itemProblem, promptProblem } from '../src/tui/model.mjs';

const g = createGenericMapper();
const str = (c) => Buffer.from(c.bytes).toString();

const SCREENS = {
  numbered: ['Overwrite file?\n1. Yes\n2. No\n', ['Yes', 'No'], 0],
  numberedHint: ['Select an action\n1. Retry\n2. Skip\n3. Abort\nenter to confirm  esc to cancel', ['Retry', 'Skip', 'Abort'], 0],
  numberedMarked: ['Choose a model\n❯ 2. fast\n  1. big'.replace('❯ 2. fast\n  1. big', '  1. big\n❯ 2. fast'), ['big', 'fast'], 1],
  arrowChevron: ['Pick a theme?\n❯ Alpha\n  Beta\n  Gamma', ['Alpha', 'Beta', 'Gamma'], 0],
  arrowGt: ['Choose\n  Alpha\n> Beta\n  ↑↓ navigate  enter select', ['Alpha', 'Beta'], 1],
  radio: ['Mode\n○ Fast\n● Slow\n○ Safe', ['Fast', 'Slow', 'Safe'], 1],
  yn: ['Continue? (y/n) ', ['Yes', 'No'], 0],
  capY: ['Install package? [Y/n]', ['Yes', 'No'], 0],
  capN: ['Proceed [y/N]:', ['Yes', 'No'], 1],
  enter: ['Setup complete.\nPress Enter to continue', ['Continue'], 0],
};

for (const [name, [screen, labels, selected]] of Object.entries(SCREENS)) {
  test(`screen: ${name}`, () => {
    const p = g.parsePrompt(screen);
    assert.notEqual(p, null);
    assert.equal(promptProblem(p), null);
    assert.deepEqual(p.options.map((o) => o.label), labels);
    assert.equal(p.selected, selected);
  });
}

test('look-alikes return null', () => {
  assert.equal(g.parsePrompt('Here are the options:\n1. Postgres\n2. SQLite\n\n> '), null);
  assert.equal(g.parsePrompt('> quoted\n> more quoted\n\n> '), null);
  assert.equal(g.parsePrompt('Steps to follow:\n1. Install\n2. Run\nThat is all.\n> '), null);
  assert.equal(g.parsePrompt(''), null);
});

test('controls: exact bytes', () => {
  const c = g.controls;
  assert.equal(str(c.interrupt()), '\x1b');
  assert.equal(str(c.interruptCtrlC()), '\x03');
  assert.equal(str(c.slash('help')), '/help\r');
  assert.equal(str(c.send('hi')), 'hi\r');
  assert.throws(() => c.send('a\nb'), RangeError);
  const num = g.parsePrompt(SCREENS.numbered[0]);
  assert.equal(str(c.answerPrompt(num, 1)), '2');
  assert.equal(str(c.answerPrompt(g.parsePrompt(SCREENS.yn[0]), 1)), 'n');
  assert.equal(str(c.answerPrompt(g.parsePrompt(SCREENS.enter[0]), 0)), '\r');
  const arrow = g.parsePrompt(SCREENS.arrowChevron[0]);
  assert.equal(str(c.answerPrompt(arrow, 2)), '\x1b[B\x1b[B\r');
  assert.equal(str(c.answerPrompt(g.parsePrompt(SCREENS.arrowGt[0]), 0)), '\x1b[A\r');
  assert.throws(() => c.answerPrompt(arrow, 7), RangeError);
});

test('sent() makes a valid user item; coverage says chat shows only sent text', () => {
  const it = g.sent(g.newState(), 'hello', 5);
  assert.equal(itemProblem(it), null);
  assert.equal(it.kind, 'user');
  assert.deepEqual(g.meta(g.newState()), { agent: 'generic' });
  assert.ok(g.coverage.length >= 1);
  assert.ok(g.coverage.some((r) => /sent|user/i.test(r.element + r.how) && r.shown === 'chat'));
  assert.ok(g.coverage.some((r) => r.shown === 'terminal-only'));
});

test('landscape: sources non-empty, no undefined field, counts consistent', () => {
  assert.equal(landscape.length, 17);
  for (const e of landscape) {
    assert.ok(Array.isArray(e.sources) && e.sources.length > 0, `${e.name} sources`);
    for (const [k, v] of Object.entries(e)) assert.notEqual(v, undefined, `${e.name}.${k}`);
    assert.ok(mappingPlan[e.name]?.route, `${e.name} route`);
  }
  assert.equal(new Set(landscape.map((e) => e.name)).size, 17);
  const routes = Object.values(mappingPlan).map((x) => x.route);
  // opencode speaks ACP natively but is mapped through its server API, so direct = acp routes + opencode
  assert.equal(routes.filter((r) => r === 'acp').length + 1, acpCount.direct);
  assert.equal(acpCount.direct + acpCount.adapterOnly + acpCount.none.length, acpCount.total);
  assert.deepEqual([...acpCount.none].sort(), Object.entries(mappingPlan).filter(([, x]) => x.route === 'generic-fallback').map(([n]) => n).sort());
});
