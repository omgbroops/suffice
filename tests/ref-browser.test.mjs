import test from 'node:test';
import assert from 'node:assert/strict';
import { createComputerAgent } from '../packages/backend/src/computer/index.mjs';
import { cdpBrowser } from '../src/ref-browser.mjs';

const node = (id, role, name, kids = [], b) => ({ nodeId: String(id), role: { value: role }, name: { value: name }, childIds: kids.map(String), backendDOMNodeId: id });
const page = (extra = []) => [node(1, 'RootWebArea', 'Shop', [2, 3, ...extra.map((n) => n.id)]), node(2, 'link', 'Laptop'), node(3, 'button', 'Buy'), ...extra.map((n) => node(n.id, n.role, n.name))];
function fakeWc({ nodes = page(), detachClick = false } = {}) {
  const log = []; let attached = false;
  const dbg = {
    isAttached: () => attached, attach: () => { attached = true; }, detach: () => { attached = false; },
    sendCommand: async (m, p) => {
      log.push([m, p]);
      if (m === 'Accessibility.getFullAXTree') return { nodes };
      if (m === 'DOM.resolveNode') { if (detachClick) throw new Error('No node with given id found'); return { object: { objectId: `o${p.backendNodeId}` } }; }
      if (m === 'Page.captureScreenshot') return { data: Buffer.from('png').toString('base64') };
      return {};
    },
  };
  return { log, wc: { debugger: dbg, loadURL: async () => {}, getURL: () => 'https://shop.test/' } };
}
const decide = (observeMode, acts) => async (point) => {
  if (point === 'computer.act') return acts.shift() ?? { action: 'none', done: true, answer: 'ok' };
  if (point === 'computer.observe') return { mode: observeMode };
  if (point === 'computer.check') return { ok: true, reason: 'fake' };
  if (point === 'run.continue') return { continue: true };
  return undefined;
};
const clock = { now: () => 0, sleep: async () => {} };
const run = (browser, d) => createComputerAgent({ browser, decide: d, clock }).run({ goal: 'g', surface: 'browser', start: 'https://shop.test/', agentId: 'a1' });
const calls = (log, m) => log.filter(([x]) => x === m).length;

test('loop clicks through CDP refs: DOM.resolveNode on the Buy node, click runs in page', async () => {
  const f = fakeWc(); const r = await run(cdpBrowser(f.wc), decide('snapshot', [{ action: 'click', ref: 'Buy' }]));
  assert.equal(r.ok, true);
  const resolved = f.log.filter(([m]) => m === 'DOM.resolveNode').map(([, p]) => p.backendNodeId);
  assert.deepEqual(resolved, [3]);
});

test('screenshot only for hybrid, screenshot, or an empty tree', async () => {
  const shots = {};
  for (const mode of ['tree', 'snapshot', 'hybrid', 'screenshot']) { const f = fakeWc(); await run(cdpBrowser(f.wc), decide(mode, [])); shots[mode] = calls(f.log, 'Page.captureScreenshot'); }
  assert.deepEqual([shots.tree, shots.snapshot], [0, 0]);
  assert.ok(shots.hybrid >= 1 && shots.screenshot >= 1);
  const f = fakeWc({ nodes: [node(1, 'generic', '')] }); await run(cdpBrowser(f.wc), decide('tree', []));
  assert.ok(calls(f.log, 'Page.captureScreenshot') >= 1);
});

test('detached node: act fails cleanly as ref expired, run ends without throwing', async () => {
  const f = fakeWc({ detachClick: true }); const b = cdpBrowser(f.wc); await b.open('a', 'https://shop.test/'); await b.snapshot('a');
  const r = await b.click('a', '@e2');
  assert.deepEqual([r.ok, r.error], [false, 'ref expired, re-snapshot']);
  const run2 = await run(cdpBrowser(fakeWc({ detachClick: true }).wc), decide('snapshot', [{ action: 'click', ref: 'Buy' }]));
  assert.equal(run2.steps[0].ok, false); // the failed click is recorded, not thrown
});

test('large page: truncation marker reaches the loop; rapid clicks resolve against one snapshot', async () => {
  const many = Array.from({ length: 800 }, (_, i) => ({ id: 100 + i, role: 'link', name: `Item number ${i}` }));
  const f = fakeWc({ nodes: page(many) }); const b = cdpBrowser(f.wc); await b.open('a', 'u');
  assert.match((await b.snapshot('a')).text, /… truncated, \d+ more elements$/);
  const rs = await Promise.all([b.click('a', '@e2'), b.click('a', '@e3'), b.click('a', '@e2')]);
  assert.deepEqual(rs.map((x) => x.ok), [true, true, true]);
});

import { nativeDesktop } from '../src/ref-browser.mjs';
test('nativeDesktop: snapshot refs -> press/set via ax-snapshot exec; stale ref rejected', async () => {
  const calls = [];
  const exec = async (bin, a) => { calls.push(a); return JSON.stringify(a[0] === 'snapshot' ? { tree: { id: '0', role: 'AXApplication', name: 'App', children: [{ id: '0.0', role: 'AXButton', name: 'Save', actions: ['press'] }, { id: '0.1', role: 'AXTextField', name: 'Name', value: '' }] } } : { ok: true }); };
  const d = nativeDesktop(exec, 'ax');
  const s = await d.snapshot('a', 'App');
  const els = s.data.tree.children;
  assert.ok(s.ok && els.length >= 2);
  const btn = els.find((e) => e.name === 'Save'); const fld = els.find((e) => e.name === 'Name');
  assert.equal((await d.click('a', btn.ref)).ok, true);
  assert.deepEqual(calls.at(-1), ['press', '0.0']);
  assert.equal((await d.type('a', fld.ref, 'hi')).ok, true);
  assert.deepEqual(calls.at(-1), ['set', '0.1', 'hi']);
  await d.snapshot('a', 'App');
  assert.equal((await d.click('a', '@e99')).reason, 'stale_ref');
});
