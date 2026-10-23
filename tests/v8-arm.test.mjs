import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runV8Task, parseWriterFile, v8WriterSystem, V8_CODER_SYSTEM_PROMPT, V8_FIX_SYSTEM_PROMPT } from '../src/v8-arm.mjs';
import { armTiers } from '../src/v4-config.mjs';

// Fake claude: roles by system prompt. Tests print "# pass N" (TAP summary) and exit 1 on any failure.
const check = cases => `import { add } from './impl.mjs';
let p = 0, f = 0; for (const [a, b, want] of ${JSON.stringify(cases)}) add(a, b) === want ? p++ : f++;
console.log('# pass ' + p); if (f) process.exitCode = 1;
`;
const RIGHT = check([[1, 2, 3], [0, 0, 0]]);
const WEAK = check([[0, 0, 0]]); // agrees with BAD: the false accept seen on r27
const WRONG = check([[1, 2, 4]]);
const GOOD = 'export const add = (a, b) => a + b;\n';
const BAD = 'export const add = (a, b) => a - b;\n';
const ROLES = { [V8_CODER_SYSTEM_PROMPT]: 'coder', [V8_FIX_SYSTEM_PROMPT]: 'fix', [v8WriterSystem('sonnet')]: 'sonnet', [v8WriterSystem('opus')]: 'opus' };

async function run({ coder = BAD, self = WEAK, sonnet = RIGHT, fixes = [] } = {}) {
  const root = await mkdtemp(join(tmpdir(), 'v8-test-'));
  const original = join(root, 'orig');
  await mkdir(original);
  await writeFile(join(original, 'impl.mjs'), 'export const add = () => { throw new Error("stub"); };\n');
  const calls = [];
  let fixIdx = 0;
  const claude = async ({ model, workspace, system }) => {
    const role = ROLES[system] ?? 'other';
    calls.push({ role, model });
    const w = (n, b) => writeFile(join(workspace, n), b);
    if (role === 'coder') { await w('impl.mjs', coder); await w('selftest.mjs', self); return { costUsd: 0.01, text: 'SELFTEST: node selftest.mjs' }; }
    const reply = (n, b) => `FILE: ${n}\n\`\`\`js\n${b}\`\`\`\nSELFTEST: node ${n}`; // writers have no tools: the file is in the reply
    if (role === 'sonnet') return { costUsd: 0.05, text: reply('add.sonnet.mjs', sonnet) };
    if (role === 'opus') return { costUsd: 0.07, text: reply('add.opus.mjs', RIGHT) };
    const fx = fixes[fixIdx++] ?? {};
    for (const [n, b] of Object.entries(fx.files ?? {})) await w(n, b);
    return { costUsd: 0.01, text: `${fx.text ?? ''}\nSELFTEST: node selftest.mjs` };
  };
  const out = join(root, 'rows.jsonl');
  const verify = async dir => (await readFile(join(dir, 'impl.mjs'), 'utf8')) === GOOD;
  await runV8Task({ task: { id: 't1', prompt: 'Implement add(a, b).', workspaceDir: original }, budgetUsd: 100, out, verify, claude, tiers: armTiers('v8') });
  const row = JSON.parse((await readFile(out, 'utf8')).trim());
  await rm(root, { recursive: true, force: true });
  return { row, calls };
}

test('Sonnet tests catch a bug the weak self-test passed; Haiku fixes it and Opus promotes', async () => {
  const { row, calls } = await run({ fixes: [{ files: { 'impl.mjs': GOOD } }] });
  assert.equal(row.status, 'completed', row.error);
  assert.deepEqual(row.checks.map(c => [c.level, c.pass, c.hidden]), [['self', true, false], ['sonnet', false, false], ['sonnet', true, true], ['opus', true, true]]);
  assert.equal(row.promoted, true);
  assert.equal(row.finalPass, true);
  assert.deepEqual(calls.map(c => c.role), ['coder', 'sonnet', 'fix', 'opus']);
  assert.ok(calls.filter(c => c.role === 'fix').every(c => c.model === 'claude-haiku-5-5'));
});

test('a tagged TESTBUG edit to a wrong writer test is kept', async () => {
  const { row } = await run({ coder: GOOD, sonnet: WRONG, fixes: [{ files: { 'add.sonnet.mjs': RIGHT }, text: 'TESTBUG: add.sonnet.mjs: task says add, 1+2 is 3' }] });
  assert.equal(row.testbugClaims.length, 1);
  assert.equal(row.testbugClaims[0].applied, true);
  assert.equal(row.promoted, true);
  assert.equal(row.finalPass, true);
});

test('an untagged edit to a writer test is discarded; the red level ships the code from the level below', async () => {
  const { row } = await run({ fixes: [{ files: { 'add.sonnet.mjs': WEAK } }, { files: { 'add.sonnet.mjs': WEAK } }] });
  assert.deepEqual(row.testbugClaims.map(c => c.applied), [false, false]);
  assert.equal(row.shippedLevel, 'self');
  assert.equal(row.promoted, false);
  assert.equal(row.finalPass, false);
});

test('writer replies outside the workspace are rejected', () => {
  assert.equal(parseWriterFile('FILE: ../x.js\n```js\nx\n```'), null);
  assert.equal(parseWriterFile('FILE: /etc/x\n```\nx\n```'), null);
  assert.deepEqual(parseWriterFile('FILE: a/b.test.js\n```js\nok()\n```\nSELFTEST: x'), { rel: 'a/b.test.js', body: 'ok()\n' });
});

test('bending correct code to a wrong writer test breaks the frozen self-test, so the passing code ships', async () => {
  const { row } = await run({ coder: GOOD, self: RIGHT, sonnet: WRONG, fixes: [{ files: { 'impl.mjs': 'export const add = (a, b) => a + b + 1;\n' } }, {}] });
  assert.equal(row.shippedLevel, 'self');
  assert.equal(row.finalPass, true);
});
