import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createGenericMapper } from '../src/tui/generic.mjs';
import { createCodexMapper } from '../src/tui/codex.mjs';
import { createOpencodeMapper } from '../src/tui/opencode.mjs';

const generic = (s) => createGenericMapper().parsePrompt(s);
const codex = (s) => createCodexMapper().parsePrompt(s);
const opencode = (s) => createOpencodeMapper().parsePrompt(s);

const dir = fileURLToPath(new URL('./fixtures/tui-real/claude/screens/', import.meta.url));
const NOT_PROMPTS = ['model', 'permissions-allow', 'mcp', 'startup-banner', 'theme', 'slash-list', 'history-search', 'settings-config', 'help-commands', 'hooks', 'memory', 'tasks', 'advisor', 'powerup', 'resume', 'rewind'];

for (const [name, fn] of Object.entries({ generic, codex, opencode })) {
  test(`${name}.parsePrompt returns null on real Claude picker/menu/chat captures`, () => {
    for (const f of NOT_PROMPTS) assert.equal(fn(fs.readFileSync(`${dir}${f}.txt`, 'utf8')), null, f);
  });
}
