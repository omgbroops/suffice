import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { classifyScreen } from '../src/tui/screens.mjs';

const real = readFileSync(new URL('./fixtures/tui-real/claude/variants/session/plan--02-plan-presented.txt', import.meta.url), 'utf8');
const fake = `   Context\n\n   Add one comment line at the top of util.js.\n\n   Change\n\n   - Insert one line at line 1.\n   - Keep a shebang first if present.\n\n${'─'.repeat(100)}\n   Claude has written up a plan and is ready to execute. Would you like to proceed?\n\n   ❯ 1. Yes, and use auto mode\n     2. Yes, manually approve edits\n     3. Tell Claude what to change\n\n   ctrl+g to edit in Vim`;

test('plan prompt keeps headings and paragraphs on separate lines', () => {
  const r = classifyScreen(fake);
  assert.equal(r.kind, 'plan');
  const plan = r.prompt.plan;
  assert.match(plan, /^Context\n\nAdd one comment line at the top of util\.js\.\n\nChange\n\n- Insert one line at line 1\.\n- Keep a shebang first if present\.$/);
  assert.doesNotMatch(plan, /Context Add one|util\.js\. Change/);
});

test('plan prompt from the real screen holds the whole plan and none of the chrome', () => {
  const p = classifyScreen(real).prompt;
  assert.match(p.plan, /^Plan: REDACTED\n\nContext\n\ngreet\.js exports/);
  assert.match(p.plan, /\n\nSteps\n\n- Add function farewell/);
  assert.match(p.plan, /\n\nNote\n\nExisting greet returns/);
  assert.doesNotMatch(p.plan, /Ready to code|Here is Claude|╌|Would you like/);
});
