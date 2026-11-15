import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCliTool, sessionName } from '../src/builtins/cli-tool.mjs';
import { createBrowser } from '../src/builtins/browser.mjs';
import { createDesktop } from '../src/builtins/desktop.mjs';
import { builtinPlugins, defineBuiltinSlots } from '../src/builtins/index.mjs';
import { createSlots } from '../src/slots/index.mjs';

const OK = { code: 0, stdout: '', stderr: '', timedOut: false };
function fakeExec(handler = () => OK) {
  const calls = [];
  const exec = async (cmd, args, opts) => { calls.push({ cmd, args, opts }); return { ...OK, ...(await handler(cmd, args, calls.length)) }; };
  exec.calls = calls;
  return exec;
}
const clockAt = () => { const c = { t: 1000, now: () => c.t }; return c; };
const SNAP = '- textbox "Email" [ref=e1]\n- textbox "Password" [ref=e2]\n- button "Go" [ref=e3]\n';
const sess = (id) => ['--session', sessionName(id)];

// ---------- cli-tool ----------
test('cli-tool: session and json flags go before the command; json parsed', async () => {
  const exec = fakeExec(() => ({ stdout: '{"a":1}' }));
  const t = createCliTool({ exec, binary: 'x', clock: clockAt(), installHint: 'npm i -g x', jsonFlag: '--json' });
  const r = await t.run(['get', 'url'], { session: 's1', json: true, timeoutMs: 5 });
  assert.deepEqual(exec.calls[0].args, ['--session', 's1', '--json', 'get', 'url']);
  assert.equal(exec.calls[0].opts.timeoutMs, 5);
  assert.deepEqual(r, { ok: true, code: 0, data: { a: 1 }, text: '{"a":1}', error: undefined, errorCode: undefined });
});
test('cli-tool: exit 127 gives not-installed with install command; non-zero never throws', async () => {
  const t = createCliTool({ exec: fakeExec(() => ({ code: 127 })), binary: 'agent-browser', clock: clockAt(), installHint: 'npm install -g agent-browser' });
  const r = await t.run(['open']);
  assert.equal(r.ok, false);
  assert.equal(r.errorCode, 'not_installed');
  assert.match(r.error, /npm install -g agent-browser/);
  const t2 = createCliTool({ exec: fakeExec(() => ({ code: 1, stderr: 'boom' })), binary: 'x', clock: clockAt(), installHint: 'i' });
  assert.deepEqual([(await t2.run(['a'])).ok, (await t2.run(['a'])).error], [false, 'boom']);
  const t3 = createCliTool({ exec: async () => { throw new Error('spawn failed'); }, binary: 'x', clock: clockAt(), installHint: 'i' });
  assert.equal((await t3.run(['a'])).error, 'spawn failed');
});
test('cli-tool: error envelope with ok:false is a failure even at exit 0; doctor reports version', async () => {
  const env = '{"ok":false,"error":{"code":"STALE_REF","message":"gone"}}';
  const t = createCliTool({ exec: fakeExec(() => ({ code: 1, stdout: env })), binary: 'd', clock: clockAt(), installHint: 'i', alwaysJson: true });
  const r = await t.run(['click', 'x']);
  assert.equal(r.errorCode, 'STALE_REF');
  const d = createCliTool({ exec: fakeExec(() => ({ stdout: 'agent-browser 0.9.1\n' })), binary: 'agent-browser', clock: clockAt(), installHint: 'i', versionArgs: ['--version'] });
  assert.deepEqual(await d.doctor(), { installed: true, version: 'agent-browser 0.9.1' });
  const m = createCliTool({ exec: fakeExec(() => ({ code: 127 })), binary: 'x', clock: clockAt(), installHint: 'i' });
  assert.deepEqual(await m.doctor(), { installed: false, version: null });
});

// ---------- browser ----------
const bpolicy = (o = {}) => ({ allowedDomains: ['example.com', '.corp.test'], ...o });
function browser(handler, policy = bpolicy(), extra = {}) {
  const exec = fakeExec(handler);
  return { exec, b: createBrowser({ exec, clock: clockAt(), policy, ...extra }) };
}
const snapHandler = (cmd, args) => (args.includes('snapshot') ? { stdout: SNAP } : {});

test('browser: exact argv for every call', async () => {
  const { exec, b } = browser(snapHandler);
  const S = sess('a1');
  await b.open('a1', 'https://example.com/x');
  await b.snapshot('a1', { interactive: true });
  await b.snapshot('a1', { interactive: false });
  await b.click('a1', '@e3');
  await b.fill('a1', 'e1', 'hello');
  await b.type('a1', 'abc', { ref: '@e1' });
  await b.press('a1', 'Enter');
  await b.get('a1', 'url');
  await b.get('a1', 'title');
  await b.get('a1', 'text', { ref: '@e3' });
  await b.wait('a1', { text: 'Done' });
  await b.wait('a1', { ms: 500 });
  await b.wait('a1', { selector: '#x' });
  await b.wait('a1', { url: '**/ok' });
  await b.wait('a1', { load: 'networkidle' });
  await b.screenshot('a1', '/tmp/p.png');
  await b.read('a1');
  await b.tabs('a1');
  await b.close('a1');
  const argv = exec.calls.map((c) => c.args);
  assert.ok(exec.calls.every((c) => c.cmd === 'agent-browser'));
  assert.deepEqual(argv, [
    [...S, 'open', 'https://example.com/x'], [...S, 'snapshot', '-i'], [...S, 'snapshot'],
    [...S, 'click', '@e3'], [...S, 'fill', '@e1', 'hello'], [...S, 'type', '@e1', 'abc'],
    [...S, 'press', 'Enter'], [...S, 'get', 'url'], [...S, 'get', 'title'], [...S, 'get', 'text', '@e3'],
    [...S, 'wait', '--text', 'Done'], [...S, 'wait', '500'], [...S, 'wait', '#x'], [...S, 'wait', '--url', '**/ok'],
    [...S, 'wait', '--load', 'networkidle'], [...S, 'screenshot', '/tmp/p.png'], [...S, 'read'], [...S, 'tab'], [...S, 'close'],
  ]);
});
test('browser: eval argv when allowed; each agent gets its own session', async () => {
  const { exec, b } = browser(snapHandler, bpolicy({ allowEval: true }));
  await b.eval('a1', '1+1');
  await b.open('a2', 'https://example.com');
  assert.deepEqual(exec.calls[0].args, [...sess('a1'), 'eval', '1+1']);
  assert.notEqual(exec.calls[0].args[1], exec.calls[1].args[1]);
  assert.notEqual(sessionName('a.b'), sessionName('a_b'));
});
test('browser: missing binary gives install hint', async () => {
  const { b } = browser(() => ({ code: 127 }));
  const r = await b.open('a1', 'https://example.com');
  assert.equal(r.ok, false);
  assert.match(r.error, /not installed.*npm install -g agent-browser/s);
});
test('browser: domain policy refuses without calling the CLI', async () => {
  for (const [policy, url, why] of [
    [bpolicy(), 'https://evil.com', 'host not on list'],
    [bpolicy(), 'https://example.com.evil.com', 'lookalike'],
    [bpolicy(), 'https://example.com@evil.com/', 'userinfo trick'],
    [bpolicy({ allowedDomains: [] }), 'https://example.com', 'empty list'],
    [bpolicy(), 'file:///etc/passwd', 'file'],
    [bpolicy(), 'chrome://settings', 'chrome'],
    [bpolicy(), 'javascript:alert(1)', 'javascript'],
    [bpolicy(), 'data:text/html,hi', 'data'],
    [bpolicy({ allowedDomains: ['file', 'settings'] }), 'file:///etc/passwd', 'file even if listed'],
  ]) {
    const { exec, b } = browser(snapHandler, policy);
    const r = await b.open('a1', url);
    assert.equal(r.ok, false, why);
    assert.equal(r.reason, 'policy', why);
    assert.equal(exec.calls.length, 0, why);
  }
});
test('browser: exact host, leading-dot suffix and about:blank allowed', async () => {
  const { exec, b } = browser(snapHandler);
  for (const u of ['https://example.com', 'http://EXAMPLE.com:8080/p', 'https://a.corp.test/x', 'https://corp.test', 'about:blank'])
    assert.equal((await b.open('a1', u)).ok, true, u);
  assert.equal((await b.open('a1', 'https://sub.example.com')).ok, false);
  assert.equal(exec.calls.length, 5);
  const e = browser(snapHandler, bpolicy({ allowedDomains: [] }));
  assert.equal((await e.b.open('a1', 'about:blank')).ok, true);
});
test('browser: eval off by default and wait --fn needs allowEval', async () => {
  const { exec, b } = browser(snapHandler);
  assert.equal((await b.eval('a1', 'document.cookie')).reason, 'policy');
  assert.equal((await b.wait('a1', { fn: 'true' })).reason, 'policy');
  assert.equal(exec.calls.length, 0);
});
test('browser: fill refuses password field unless allowSecrets', async () => {
  const { exec, b } = browser(snapHandler);
  await b.snapshot('a1', {});
  const n = exec.calls.length;
  const r = await b.fill('a1', '@e2', 'hunter2');
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'policy');
  assert.equal(exec.calls.length, n);
  assert.equal((await b.fill('a1', '@e1', 'me@x.com')).ok, true);
  const s = browser(snapHandler, bpolicy({ allowSecrets: true }));
  await s.b.snapshot('a1', {});
  assert.equal((await s.b.fill('a1', '@e2', 'pw')).ok, true);
});
test('browser: stale ref after navigation is refused locally', async () => {
  const { exec, b } = browser(snapHandler);
  assert.equal((await b.click('a1', '@e1')).reason, 'stale_ref');
  await b.snapshot('a1', {});
  assert.equal((await b.click('a1', '@e1')).ok, true);
  await b.open('a1', 'https://example.com/next');
  const n = exec.calls.length;
  const r = await b.click('a1', '@e1');
  assert.equal(r.reason, 'stale_ref');
  assert.match(r.error, /^stale_ref.*snapshot/);
  assert.equal(exec.calls.length, n);
  await b.snapshot('a1', {});
  assert.equal((await b.click('a1', '@e1')).ok, true);
  // other agent unaffected by a1's navigation
  await b.snapshot('a2', {});
  await b.open('a1', 'https://example.com/z');
  assert.equal((await b.click('a2', '@e1')).ok, true);
});
test('browser: malformed ref refused; onAction carries no typed text', async () => {
  const actions = [];
  const { b } = browser(snapHandler, bpolicy(), { onAction: (e) => actions.push(e) });
  await b.snapshot('a1', {});
  assert.equal((await b.click('a1', '--evil')).reason, 'invalid_ref');
  await b.fill('a1', '@e1', 'MARKER-SECRET-TEXT');
  await b.type('a1', 'MARKER-SECRET-TEXT', { ref: '@e1' });
  assert.ok(actions.length >= 2);
  assert.ok(!JSON.stringify(actions).includes('MARKER'));
  assert.equal(actions.find((a) => a.action === 'fill').length, 18);
});

// ---------- desktop ----------
const dsnap = (app = 'Notes', id = 's1abc') => JSON.stringify({ version: '2.6', ok: true, command: 'snapshot', data: { app, snapshot_id: id, ref_count: 2, complete: true, tree: { role: 'window', name: app, children: [
  { role: 'textfield', name: 'Body', ref_id: `@${id}:e1`, children: [] },
  { role: 'textfield', name: 'Password', ref_id: `@${id}:e2`, states: ['secure'], children: [] }] } } });
const dok = (extra = {}) => ({ stdout: JSON.stringify({ version: '2.6', ok: true, command: 'x', data: extra }) });
const dhandler = (cmd, args) => (args.includes('snapshot') ? { stdout: dsnap(args[args.indexOf('--app') + 1]) } : dok());
function desktop(policy = {}, o = {}) {
  const exec = fakeExec(o.handler ?? dhandler);
  const asked = [];
  const actions = [];
  const clock = clockAt();
  const d = createDesktop({
    exec, clock, policy: { allowedApps: ['Notes', 'Finder'], ...policy },
    approve: o.approve ?? (async (q) => { asked.push(q); return true; }),
    onAction: (e) => actions.push(e),
  });
  return { exec, d, asked, actions, clock };
}

test('desktop: exact argv for every call', async () => {
  const { exec, d } = desktop();
  const S = sess('g1');
  await d.apps('g1');
  await d.snapshot('g1', 'Notes', { depth: 4 });
  await d.type('g1', '@s1abc:e1', 'hi');
  await d.scroll('g1', '@s1abc:e1', 'down');
  await d.click('g1', '@s1abc:e1');
  await d.focus('g1', 'Notes');
  await d.screenshot('g1', 'Notes', '/tmp/s.png');
  await d.snapshot('g1', 'Notes', {});
  await d.snapshot('g1', 'Notes', { root: '@s1abc:e1' });
  await d.key('g1', 'ctrl+s');
  assert.ok(exec.calls.every((c) => c.cmd === 'agent-desktop'));
  assert.deepEqual(exec.calls.map((c) => c.args), [
    [...S, 'list-apps'], [...S, 'snapshot', '--app', 'Notes', '-i', '--max-depth', '4'],
    [...S, 'type', '@s1abc:e1', 'hi'], [...S, 'scroll', '@s1abc:e1', '--direction', 'down'], [...S, 'click', '@s1abc:e1'],
    [...S, 'focus-window', '--app', 'Notes'], [...S, 'screenshot', '--app', 'Notes', '/tmp/s.png'],
    [...S, 'snapshot', '--app', 'Notes', '-i'], [...S, 'snapshot', '--app', 'Notes', '-i', '--root', '@s1abc:e1'],
    [...S, 'press', 'ctrl+s'],
  ]);
});
test('desktop: per-agent session isolation and missing binary hint', async () => {
  const { exec, d } = desktop();
  await d.apps('g1'); await d.apps('g2');
  assert.notEqual(exec.calls[0].args[1], exec.calls[1].args[1]);
  const m = desktop({}, { handler: () => ({ code: 127 }) });
  const r = await m.d.apps('g1');
  assert.match(r.error, /not installed.*npm install -g agent-desktop/s);
});
test('desktop: app policy refuses without calling the CLI', async () => {
  for (const [policy, app, why] of [
    [{}, 'Calculator', 'not on list'],
    [{ allowedApps: [] }, 'Notes', 'empty list'],
    [{ allowedApps: ['1Password'] }, '1Password', 'password manager'],
    [{ allowedApps: ['System Settings'] }, 'System Settings', 'settings'],
    [{ allowedApps: ['Terminal'] }, 'Terminal', 'terminal'],
    [{ allowedApps: ['com.apple.Terminal'] }, 'com.apple.Terminal', 'terminal bundle id'],
    [{ allowedApps: ['Suffice'] }, 'Suffice', 'self'],
    [{ allowedApps: ['Notes'], denyExtra: ['Notes'] }, 'Notes', 'custom deny wins'],
  ]) {
    const { exec, d, asked } = desktop(policy);
    for (const r of [await d.snapshot('g1', app, {}), await d.focus('g1', app), await d.screenshot('g1', app, '/tmp/x.png')]) {
      assert.equal(r.ok, false, why);
      assert.equal(r.reason, 'policy', why);
    }
    assert.equal(exec.calls.length, 0, why);
    assert.equal(asked.length, 0, why);
  }
});
test('desktop: approval asked once per agent per app; denial blocks', async () => {
  const { exec, d, asked } = desktop();
  await d.snapshot('g1', 'Notes', {});
  await d.click('g1', '@s1abc:e1');
  await d.type('g1', '@s1abc:e1', 'x');
  assert.equal(asked.length, 1);
  assert.deepEqual(asked[0], { agentId: 'g1', app: 'Notes', action: 'click', target: '@s1abc:e1' });
  await d.snapshot('g2', 'Notes', {});
  await d.type('g2', '@s1abc:e1', 'x');
  assert.equal(asked.length, 2);
  const auto = desktop({ autoApprove: ['Notes'] });
  await auto.d.snapshot('g1', 'Notes', {});
  await auto.d.click('g1', '@s1abc:e1');
  assert.equal(auto.asked.length, 0);
  const no = desktop({}, { approve: async () => false });
  await no.d.snapshot('g1', 'Notes', {});
  const n = no.exec.calls.length;
  const r = await no.d.click('g1', '@s1abc:e1');
  assert.deepEqual([r.ok, r.reason], [false, 'denied']);
  assert.equal(no.exec.calls.length, n);
  const boom = desktop({}, { approve: async () => { throw new Error('x'); } });
  await boom.d.snapshot('g1', 'Notes', {});
  assert.equal((await boom.d.click('g1', '@s1abc:e1')).reason, 'denied');
  assert.equal(exec.calls.length > 0, true);
});
test('desktop: typing into a secure field is refused', async () => {
  const { exec, d, asked } = desktop();
  await d.snapshot('g1', 'Notes', {});
  const n = exec.calls.length;
  const r = await d.type('g1', '@s1abc:e2', 'pw');
  assert.deepEqual([r.ok, r.reason], [false, 'policy']);
  assert.equal(exec.calls.length, n);
  assert.equal(asked.length, 0);
});
test('desktop: stale refs refused locally; CLI STALE_REF forces a new snapshot', async () => {
  const { exec, d } = desktop();
  assert.equal((await d.click('g1', '@s1abc:e1')).reason, 'stale_ref');
  assert.equal((await d.click('g1', 'e1')).reason, 'invalid_ref');
  await d.snapshot('g1', 'Notes', {});
  assert.equal((await d.type('g1', '@s1abc:e1', 'a')).ok, true);
  await d.click('g1', '@s1abc:e1');
  const n = exec.calls.length;
  assert.equal((await d.type('g1', '@s1abc:e1', 'a')).reason, 'stale_ref');
  assert.equal(exec.calls.length, n);
  const cli = desktop({}, { handler: (c, args) => (args.includes('snapshot') ? { stdout: dsnap() } : { code: 1, stdout: JSON.stringify({ ok: false, error: { code: 'STALE_REF', message: 'gone' } }) }) });
  await cli.d.snapshot('g1', 'Notes', {});
  assert.equal((await cli.d.type('g1', '@s1abc:e1', 'a')).reason, 'stale_ref');
  assert.equal((await cli.d.type('g1', '@s1abc:e1', 'a')).reason, 'stale_ref');
});
test('desktop: per-agent rate limit', async () => {
  const { exec, d, clock } = desktop({ autoApprove: ['Notes'], rateLimit: { max: 3, windowMs: 1000 } });
  await d.snapshot('g1', 'Notes', {});
  await d.type('g1', '@s1abc:e1', 'a');
  await d.type('g1', '@s1abc:e1', 'a');
  const n = exec.calls.length;
  assert.equal((await d.type('g1', '@s1abc:e1', 'a')).reason, 'rate_limited');
  assert.equal(exec.calls.length, n);
  await d.snapshot('g2', 'Notes', {});
  assert.equal(exec.calls.length, n + 1);
  clock.t += 1001;
  assert.equal((await d.type('g1', '@s1abc:e1', 'a')).ok, true);
});
test('desktop: onAction reports length, never typed text', async () => {
  const { d, actions } = desktop({ autoApprove: ['Notes'] });
  await d.snapshot('g1', 'Notes', {});
  await d.type('g1', '@s1abc:e1', 'MARKER-SECRET-TEXT');
  await d.key('g1', 'ctrl+s');
  assert.ok(!JSON.stringify(actions).includes('MARKER'));
  const t = actions.find((a) => a.action === 'type');
  assert.deepEqual([t.agentId, t.app, t.length, t.ok], ['g1', 'Notes', 18, true]);
  assert.equal(actions.find((a) => a.action === 'key').app, 'Notes');
});
test('desktop: key needs a known app', async () => {
  const { exec, d } = desktop();
  assert.equal((await d.key('g1', 'ctrl+s')).reason, 'no_app');
  assert.equal(exec.calls.length, 0);
});

// ---------- plugins and slots ----------
test('builtinPlugins: manifests, namespaced tools, valid schemas', async () => {
  const plugins = builtinPlugins();
  assert.deepEqual(plugins.map((p) => p.manifest.name), ['browser', 'desktop']);
  assert.deepEqual(plugins.map((p) => p.manifest.permissions), [['exec', 'net'], ['exec', 'ui']]);
  const { validateManifest } = await import('../src/plugins/index.mjs');
  for (const p of plugins) {
    assert.deepEqual(validateManifest(p.manifest), { ok: true, errors: [] });
    const regs = [];
    const exec = fakeExec();
    await p.activate({ name: p.manifest.name, register: (k, id, impl) => regs.push([k, id, impl]), config: { exec, policy: {}, approve: async () => false }, clock: clockAt() });
    assert.deepEqual(regs.map((r) => r[1]), p.manifest.contributes.tools);
    for (const [kind, id, impl] of regs) {
      assert.equal(kind, 'tools');
      const def = impl.def;
      assert.equal(def.name, `${p.manifest.name}:${id}`);
      assert.ok(def.description.length > 10 && !def.description.includes('\n'));
      const s = def.inputSchema;
      assert.equal(s.type, 'object');
      assert.equal(s.additionalProperties, false);
      assert.ok(Array.isArray(s.required ?? []) && (s.required ?? []).every((k) => k in s.properties));
      for (const v of Object.values(s.properties)) assert.ok(typeof v.type === 'string' || v.enum || v.oneOf);
      assert.equal(typeof impl, 'function');
    }
  }
  assert.ok(plugins[0].manifest.contributes.tools.includes('open'));
  assert.ok(plugins[1].manifest.contributes.tools.includes('snapshot'));
});
test('builtin tool impl drives the tool and refuses by policy', async () => {
  const regs = new Map();
  const exec = fakeExec();
  const [bp] = builtinPlugins();
  await bp.activate({ register: (k, id, impl) => regs.set(id, impl), config: { exec, policy: { allowedDomains: ['example.com'] } }, clock: clockAt() });
  assert.equal((await regs.get('open')({ agentId: 'a', url: 'https://evil.com' })).reason, 'policy');
  assert.equal(exec.calls.length, 0);
  assert.equal((await regs.get('open')({ agentId: 'a', url: 'https://example.com' })).ok, true);
});
test('slots: builtins:status and agents:screens', async () => {
  const slots = createSlots();
  const exec = fakeExec((cmd) => (cmd === 'agent-desktop' ? { code: 127 } : { stdout: 'agent-browser 1.2.3' }));
  const clock = clockAt();
  const h = defineBuiltinSlots(slots, { exec, clock });
  await h.refresh();
  assert.deepEqual(slots.read('builtins:status').value, { browser: { installed: true, version: 'agent-browser 1.2.3' }, desktop: { installed: false, version: null } });
  h.record({ agentId: 'a1', tool: 'browser', action: 'click', target: 'https://example.com', at: 5 });
  h.record({ agentId: 'a2', tool: 'desktop', action: 'type', app: 'Notes', at: 6, length: 3 });
  assert.deepEqual(slots.read('agents:screens').value, {
    a1: { tool: 'browser', target: 'https://example.com', action: 'click', at: 5 },
    a2: { tool: 'desktop', target: 'Notes', action: 'type', at: 6 },
  });
  assert.ok(slots.catalog().some((d) => d.id === 'builtins:status'));
});
