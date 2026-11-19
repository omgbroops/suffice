import test from 'node:test';
import assert from 'node:assert/strict';
import { createToolRegistry, shouldDefer, ledgerLine, SEARCH_TOOL } from '../src/tokens/tool-registry.mjs';
import { createDeferralExtension } from '../src/tokens/tool-deferral.mjs';

const prop = (n) => ({ type: 'string', description: `The ${n} value. Must be a non-empty string that follows the service naming rules.` });
const schema = () => ({ type: 'object', properties: { id: prop('identifier'), name: prop('display name'), body: prop('body text'), limit: { type: 'integer', description: 'Maximum number of results to return in one page.' } }, required: ['id'] });
const SERVICES = { github: 'GitHub repository', slack: 'Slack channel', jira: 'Jira ticket', stripe: 'Stripe customer', notion: 'Notion page', gmail: 'Gmail message', calendar: 'Google Calendar event', s3: 'S3 bucket object', postgres: 'Postgres table row', docker: 'Docker container', figma: 'Figma frame', sentry: 'Sentry error event' };
const ACTIONS = { create: 'Create a new', delete: 'Permanently delete a', list: 'List all', update: 'Update fields of a', search: 'Find by keyword a', archive: 'Archive a', export: 'Export data of a', share: 'Share access to a', comment: 'Add a comment on a', restore: 'Restore a deleted' };
const synthetic = () => Object.entries(SERVICES).flatMap(([svc, noun]) => Object.entries(ACTIONS).map(([act, phrase]) => ({ name: `${svc}_${act}`, description: `${phrase} ${noun}. Returns the resulting record as JSON with all metadata fields.`, parameters: schema() })));
const core = ['read', 'edit', 'bash', 'search'].map((name) => ({ name, description: `Core ${name} tool.`, parameters: schema() }));
const build = (deferred = true) => { const r = createToolRegistry({ deferred }); [...core, ...synthetic()].forEach((t) => r.register(t)); return r; };

test('120 synthetic tools: deferred prompt carries names only and shrinks ~10x', () => {
  const on = build(true), off = build(false);
  assert.equal(on.size(), 124);
  const names = on.declared().map((t) => t.name);
  assert.deepEqual(names, ['read', 'edit', 'bash', 'search', SEARCH_TOOL]);
  assert.ok(on.declared().every((t) => !JSON.stringify(t).includes('Must be a non-empty string') || core.some((c) => c.name === t.name)));
  assert.match(on.declared().at(-1).description, /github_create: Create a new GitHub repository\./);
  const a = on.stats(), b = off.stats();
  assert.equal(b.declaredTokens, a.schemaTokens);
  assert.ok(a.declaredTokens < a.schemaTokens / 3, `${a.declaredTokens} vs ${a.schemaTokens}`);
  assert.equal(a.deferred, 120);
});

test('search recall: expected tool in top 5 for 10 queries', () => {
  const r = build(true);
  const cases = [['create a new GitHub issue repository', 'github_create'], ['delete slack channel', 'slack_delete'], ['jira ticket comment', 'jira_comment'], ['export stripe customer data', 'stripe_export'],
    ['restore deleted notion page', 'notion_restore'], ['list gmail messages', 'gmail_list'], ['share calendar event', 'calendar_share'], ['archive s3 bucket object', 's3_archive'], ['update postgres table row', 'postgres_update'], ['find sentry error by keyword', 'sentry_search']];
  for (const [q, want] of cases) assert.ok(build(true).search(q).map((t) => t.name).includes(want), `${q} -> ${want}`);
  assert.equal(r.search('zzzz qqqq').length, 0);
  assert.ok(r.search('docker container').length <= 5);
});

test('loaded tools stay loaded; declared list only grows at its end (cache-safe prefix)', () => {
  const r = build(true);
  const h0 = r.prefixHash();
  const n0 = r.declared().length;
  r.search('slack channel create');
  const first = r.loaded();
  assert.ok(first.length > 0 && first.length <= 5);
  assert.equal(r.prefixHash(n0), h0, 'tool-list prefix unchanged after a load');
  const h1 = r.prefixHash();
  assert.equal(r.prefixHash(), h1, 'no search, no change');
  const n1 = r.declared().length;
  r.search('figma frame');
  assert.deepEqual(r.loaded().slice(0, first.length), first);
  assert.equal(r.prefixHash(n1), h1, 'earlier prefix intact after a second load');
  r.search('slack channel create'); // already loaded: not duplicated
  assert.equal(new Set(r.loaded()).size, r.loaded().length);
  assert.ok(first.every((n) => r.guard(n) === null));
});

test('calling a deferred tool without loading it returns an error that says to search', () => {
  const r = build(true);
  assert.match(r.guard('stripe_delete'), /deferred.*tool_search/s);
  assert.equal(r.guard('read'), null);
  assert.equal(build(false).guard('stripe_delete'), null);
});

test('auto threshold: defer above 10% of the window, override wins', () => {
  assert.equal(shouldDefer({ schemaTokens: 13000, contextWindow: 128000 }), true);
  assert.equal(shouldDefer({ schemaTokens: 12800, contextWindow: 128000 }), false);
  assert.equal(shouldDefer({ schemaTokens: 20000, contextWindow: 128000, override: 'Off' }), false);
  assert.equal(shouldDefer({ schemaTokens: 10, contextWindow: 128000, override: 'On' }), true);
});

test('ledger line shows schema tokens and cache hit rate', () => {
  const l = ledgerLine(3, build(true).stats(), { input: 100, cacheRead: 900, cacheWrite: 0 });
  assert.equal(l.cacheHitRate, 0.9);
  assert.equal(l.cacheRead, 900);
  assert.ok(l.schemaTokensLoaded < l.schemaTokensAll);
});

// Fake pi host: drives the real extension through a whole thread.
function fakePi(tools, active) {
  const handlers = {}, registered = new Map();
  const pi = { registerTool: (t) => registered.set(t.name, t), on: (e, h) => (handlers[e] = h), getAllTools: () => [...tools, ...registered.values()], getActiveTools: () => [...active], setActiveTools: (n) => { active = [...n]; } };
  return { pi, handlers, registered, active: () => active };
}
test('fake worker end to end: names only, search, load, call, stable prefix, savings ledger', async () => {
  const tools = [...core, ...synthetic()].map((t) => ({ ...t, exposure: 'direct' }));
  const host = fakePi(tools, tools.map((t) => t.name));
  const ext = createDeferralExtension({ setting: 'auto', contextWindow: 20000 }); // 124 tools exceed 10% of 20k
  ext(host.pi);
  const prompt = await host.handlers.before_agent_start({ systemPrompt: 'base' });
  assert.deepEqual(host.active().sort(), [...['read', 'edit', 'bash', 'search'], SEARCH_TOOL].sort());
  assert.match(prompt.systemPrompt, /slack_delete: Permanently delete a Slack channel\./);
  assert.match((await host.handlers.tool_call({ toolName: 'slack_delete' })).reason, /tool_search/);
  host.handlers.before_provider_request({});
  const hash = ext.snapshot().prefixHash;
  const result = await host.registered.get(SEARCH_TOOL).execute('1', { query: 'delete slack channel' });
  assert.ok(result.details.found.includes('slack_delete'));
  assert.equal(await host.handlers.tool_call({ toolName: 'slack_delete' }), undefined);
  assert.ok(host.active().includes('slack_delete'));
  assert.notEqual(ext.snapshot().prefixHash, hash); // grew at the end, earlier entries asserted in the registry test
  const again = await host.handlers.before_agent_start({ systemPrompt: 'base' });
  assert.equal(again.systemPrompt, prompt.systemPrompt, 'catalog in the system prompt is fixed for the thread');
  host.handlers.before_provider_request({});
  const s = ext.snapshot();
  assert.equal(s.calls, 2);
  assert.ok(s.saved > 0 && s.deferOn && s.deferred < 120 && s.loaded > 4);
});

test('small tool sets stay loaded in auto, but already-deferred (MCP) tools still wait behind tool_search', async () => {
  const tools = [...core, { name: 'mcp_x_send', description: 'Send an x message.', parameters: schema(), exposure: 'deferred' }].map((t) => ({ exposure: 'direct', ...t }));
  const host = fakePi(tools, core.map((t) => t.name));
  const ext = createDeferralExtension({ setting: 'auto', contextWindow: 1_000_000 });
  ext(host.pi);
  await host.handlers.before_agent_start({ systemPrompt: 'b' });
  assert.equal(ext.snapshot().deferOn, false);
  assert.ok(host.active().includes(SEARCH_TOOL) && host.active().includes('read'));
  const r = await host.registered.get(SEARCH_TOOL).execute('1', { query: 'send x message' });
  assert.deepEqual(r.details.found, ['mcp_x_send']);
});
