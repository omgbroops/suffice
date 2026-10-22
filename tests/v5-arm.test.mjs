import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { armTiers } from '../src/v4-config.mjs';
import { buildBundle, v5Prompt, V5_BUNDLE_TOKENS } from '../src/v5-bundle.mjs';
import { makeClaudeAdapter } from '../src/v4-claude.mjs';
import { runBench } from '../scripts/v4-bench.mjs';

const fakeBin = resolve(import.meta.dirname, 'fixtures/fake-claude.mjs');
const tmp = () => mkdtemp(join(tmpdir(), 'v5-arm-'));

// A tiny repo: the issue names parseThing, which lives in src/parse.mjs.
async function repo(root) {
  await mkdir(join(root, 'src'), { recursive: true });
  await writeFile(join(root, 'src/parse.mjs'), 'export function parseThing(x) {\n  return x.trim();\n}\n');
  await writeFile(join(root, 'src/other.mjs'), 'export const unrelated = 1;\n');
  await writeFile(join(root, 'src/zzz_gold.mjs'), 'export const qqq = 2;\n');
  return root;
}
const ISSUE = 'parseThing returns the wrong value for padded input';

test("arm 'v5' is the ladder with lean tiers and fixed tools; 'v4' is not lean", () => {
  const v5 = armTiers('v5');
  assert.deepEqual(v5.map(t => t.model), ['claude-haiku-5-5', 'claude-sonnet-5-5']);
  for (const t of v5) {
    assert.equal(t.lean, true);
    assert.deepEqual(t.tools, ['Read', 'Edit', 'Write', 'Bash']);
  }
  assert.ok(armTiers('v4').every(t => !t.lean));
});

test('bundle holds ranked files and stays under the token cap', async t => {
  const root = await repo(await tmp());
  t.after(() => rm(root, { recursive: true, force: true }));
  const b = await buildBundle(root, ISSUE);
  assert.equal(b.files[0], 'src/parse.mjs');
  assert.ok(b.bundleTokens <= V5_BUNDLE_TOKENS);
  assert.ok(b.bundle.includes('parseThing'));
  assert.deepEqual(b.bundledFiles.filter(f => !b.files.includes(f)), []);
  const prompt = v5Prompt(ISSUE, b);
  assert.match(prompt, /Likely files, most likely first/);
  assert.match(prompt, /1\. src\/parse\.mjs/);
});

test('v5 bench row carries localization fields; gold files are compared, never prompted', async t => {
  const root = await tmp();
  t.after(() => rm(root, { recursive: true, force: true }));
  const dir = await repo(join(root, 'ws'));
  const results = join(root, 'rows.jsonl');
  const items = [{ taskId: 'x/1', prompt: ISSUE, goldFiles: ['src/zzz_gold.mjs'] }];
  const seen = [];
  const runTask = async ({ task, meta }) => {
    seen.push({ prompt: task.prompt, meta });
    const row = { task: task.id, status: 'completed', ...meta };
    await writeFile(results, JSON.stringify(row) + '\n', { flag: 'a' });
    return row;
  };
  const provider = { prepWorkspace: async () => ({ dir, cleanup: async () => {} }), runAcceptance: async () => true };
  await runBench({ items, arm: 'v5', workers: 1, globalCapUsd: 1, results, provider, probe: async () => 90, runTask });
  assert.equal(seen.length, 1);
  assert.match(seen[0].prompt, /Likely files/);
  // The localizer ranks every small-repo file, so the gold file is bundled here; the flag is report-only.
  assert.ok(!seen[0].prompt.includes('goldFiles'));
  assert.equal(seen[0].meta.arm, 'v5');
  assert.equal(seen[0].meta.goldInBundle, true);
  assert.equal(seen[0].meta.localizedFiles[0], 'src/parse.mjs');
  assert.ok(seen[0].meta.bundleTokens > 0);
  assert.equal((await readFile(results, 'utf8')).trim().split('\n').length, 1);
});

test('lean adapter passes --max-turns 12 and the fixed tool list; default adapter does not', async t => {
  const root = await tmp();
  t.after(() => rm(root, { recursive: true, force: true }));
  const log = join(root, 'calls.jsonl');
  process.env.FAKE_LOG = log;
  t.after(() => { delete process.env.FAKE_LOG; });
  const call = { model: 'claude-haiku-5-5', prompt: 'p', workspace: root, tools: ['Read', 'Edit', 'Write', 'Bash'], remainingBudgetUsd: 1 };
  await makeClaudeAdapter({ bin: fakeBin, lean: true })(call);
  await makeClaudeAdapter({ bin: fakeBin })(call);
  const [lean, plain] = (await readFile(log, 'utf8')).trim().split('\n').map(l => JSON.parse(l));
  assert.equal(lean.maxTurns, '12');
  assert.equal(lean.tools, 'Read,Edit,Write,Bash');
  assert.equal(plain.maxTurns, undefined);
});
