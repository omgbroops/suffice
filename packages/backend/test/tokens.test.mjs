import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createCompactor, createDeferredTools, createReducerExtension, estimateTokens, readSettings } from '../src/tokens/index.mjs';

const { allTools, runs } = JSON.parse(fs.readFileSync(new URL('./fixtures/tokens/runs.json', import.meta.url), 'utf8'));
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'tok-'));

// Replays a recorded run: every model call carries the declared tools plus all tool results so far (no prompt cache modelled).
// The simulated agent needs each step's `needs` strings; if compaction hid one it retrieves by grep, as the real agent can.
async function replay(run, { defer, compact, limit = 2000 }) {
  const dt = createDeferredTools(run.tools, { enabled: defer });
  const c = createCompactor({ dir: tmp(), limitTokens: limit });
  let history = 0, input = 0, calls = 1, retrievals = 0, compacted = 0;
  input += dt.tokens() + estimateTokens(run.task); // call 1
  const seen = [], ids = [];
  for (const s of run.steps) {
    const first = dt.use(s.tool).first;
    if (first && defer) history += estimateTokens({ names: [s.tool] }) + estimateTokens(dt.use(s.tool).tool); // load_tool call + schema result
    const r = compact ? await c.compact(s.output) : { text: s.output, compacted: false };
    if (r.compacted) compacted++;
    history += estimateTokens(s.args) + estimateTokens(r.text);
    seen.push(r.text); ids.push(r.id);
    for (const need of s.needs) {
      if (r.text.includes(need)) continue;
      assert.ok(r.id, `fact "${need}" missing from an uncompacted output`);
      const got = await c.retrieve(r.id, { grep: need.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') });
      assert.ok(got.text.includes(need), `retrieve could not find "${need}"`);
      history += estimateTokens({ id: r.id, grep: need }) + estimateTokens(got.text);
      retrievals++; calls++;
      input += dt.tokens() + history;
    }
    calls++;
    input += dt.tokens() + estimateTokens(run.task) + history;
  }
  let answerable = true;
  for (const f of run.facts) {
    if (seen.some((t) => t.includes(f))) continue;
    const i = run.steps.findIndex((s) => s.output.includes(f));
    answerable &&= i >= 0 && !!ids[i] && (await c.retrieve(ids[i], { grep: f.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') })).text.includes(f);
  }
  return { input, calls, retrievals, compacted, answerable, schema: dt.tokens() };
}

test('replay: tokens before vs after on 7 recorded runs, task outcome unchanged', async () => {
  const rows = [];
  for (const run of runs) {
    const before = await replay(run, { defer: false, compact: false });
    const after = await replay(run, { defer: true, compact: true });
    assert.ok(before.answerable && after.answerable, `${run.name}: outcome changed`);
    assert.ok(after.input <= before.input, `${run.name}: reduction made it worse`);
    rows.push({ run: run.name, tools: run.tools.length, before: before.input, after: after.input, saved: Math.round((1 - after.input / before.input) * 100) + '%', compacted: after.compacted, retrievals: after.retrievals });
  }
  const tb = rows.reduce((a, r) => a + r.before, 0), ta = rows.reduce((a, r) => a + r.after, 0);
  console.table(rows);
  console.log(`total input tokens ${tb} -> ${ta} (${Math.round((1 - ta / tb) * 100)}% less); all-servers catalog ${allTools.length} tools: ${estimateTokens(allTools)} -> ${createDeferredTools(allTools).tokens()}`);
  assert.ok(rows.length >= 5);
  assert.ok(ta < tb * 0.6, 'expected at least 40% fewer input tokens across the set');
  assert.equal(rows.find((r) => r.run === 'small-control').compacted, 0);
});

test('each toggle alone changes only its own part; both off reproduces the baseline exactly', async () => {
  const run = runs.find((r) => r.name === 'triage-issues');
  const off = await replay(run, { defer: false, compact: false });
  const deferOnly = await replay(run, { defer: true, compact: false });
  const compactOnly = await replay(run, { defer: false, compact: true });
  assert.equal(deferOnly.compacted, 0);
  assert.equal(compactOnly.schema, off.schema);
  assert.ok(deferOnly.input < off.input && compactOnly.input < off.input);
  assert.equal(off.compacted, 0);
});

test('compaction keeps the error line hidden in the middle and stores the full text by id', async () => {
  const dir = tmp(), c = createCompactor({ dir, limitTokens: 500 });
  const text = Array.from({ length: 2000 }, (_, i) => (i === 1000 ? 'FATAL: disk quota exceeded on /var' : `line ${i} ok`)).join('\n');
  const r = await c.compact(text);
  assert.ok(r.compacted && r.after < 700 && r.text.includes('FATAL: disk quota exceeded'));
  assert.match(r.id, /^out_[0-9a-f]{12}$/);
  assert.equal(fs.readFileSync(path.join(dir, r.id + '.txt'), 'utf8'), text);
  assert.equal((await c.retrieve(r.id, { offset: 0 })).text.startsWith('line 0 ok'), true);
  const p = await c.retrieve(r.id, { offset: 2000 });
  assert.ok(p.text.length > 0 && p.next !== undefined);
  assert.deepEqual(await c.compact('short'), { text: 'short', compacted: false });
});

test('single long line (minified JSON) is windowed, retrieval rejects bad ids', async () => {
  const c = createCompactor({ dir: tmp(), limitTokens: 300 });
  const r = await c.compact(JSON.stringify(Array.from({ length: 800 }, (_, i) => ({ i, v: 'x'.repeat(20) }))));
  assert.ok(r.compacted && r.after < 500);
  for (const bad of ['../etc/passwd', 'out_zz', '', 'out_0123456789abc', undefined]) await assert.rejects(c.retrieve(bad), /invalid output id/);
  await assert.rejects(c.retrieve('out_000000000000'), /no stored output/);
});

test('deferred tools: stubs only until first use, then the full schema', () => {
  const tools = runs[1].tools;
  const dt = createDeferredTools(tools);
  const d0 = dt.declared();
  assert.equal(d0.length, 1);
  assert.match(d0[0].description, /mcp__github__list_issues: List issues in a GitHub repository\./);
  assert.ok(dt.tokens() < estimateTokens(tools) / 3);
  assert.equal(dt.use('mcp__github__get_issue').first, true);
  assert.equal(dt.use('mcp__github__get_issue').first, false);
  assert.deepEqual(dt.declared().map((t) => t.name).slice(1), ['mcp__github__get_issue']);
  assert.throws(() => dt.use('nope'), /unknown tool/);
  assert.equal(createDeferredTools(tools, { enabled: false }).declared().length, tools.length);
});

test('settings: defaults on, toggles off, limit parsed', () => {
  assert.deepEqual(readSettings({}), { defer: true, compact: true, limit: 2000 });
  assert.deepEqual(readSettings({ 'defer-mcp-schemas': false, 'compact-tool-results': false, 'compact-limit': '8,000 tokens' }), { defer: false, compact: false, limit: 8000 });
});

test('extension: compacts a big tool_result, leaves small and retrieve_output alone, off registers nothing', async () => {
  const mk = (settings) => { const h = {}, tools = []; createReducerExtension({ dir: tmp(), settings })({ on: (n, f) => { h[n] = f; }, registerTool: (t) => tools.push(t) }); return { h, tools }; };
  const on = mk({ 'compact-limit': '1,000 tokens' });
  assert.equal(on.tools[0].name, 'retrieve_output');
  const big = 'row\n'.repeat(5000), small = 'ok';
  const res = await on.h.tool_result({ toolName: 'bash', content: [{ type: 'text', text: big }] });
  const id = /out_[0-9a-f]{12}/.exec(res.content[0].text)[0];
  assert.equal(await on.h.tool_result({ toolName: 'bash', content: [{ type: 'text', text: small }] }), undefined);
  assert.equal(await on.h.tool_result({ toolName: 'retrieve_output', content: [{ type: 'text', text: big }] }), undefined);
  const back = await on.tools[0].execute('c1', { id });
  assert.ok(back.content[0].text.startsWith('row'));
  const off = mk({ 'compact-tool-results': false });
  assert.equal(off.tools.length, 0);
  assert.equal(off.h.tool_result, undefined);
});
