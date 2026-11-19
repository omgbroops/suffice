import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {renderSnapshot, fromCdp, createRefControl, tokensOfText, tokensOfImage, EXPIRED} from '../src/snapshot.mjs';
const fx = JSON.parse(readFileSync(new URL('./fixtures/ax-form.json', import.meta.url)));

test('fixture tree renders to the expected lines; decorative nodes drop', () => {
  assert.equal(renderSnapshot(fx.tree).text, [
    '@e1 window Checkout', '@e2 heading Shipping details', '@e3 textbox Name value="Ada"', '@e4 textbox Email [required]',
    '@e5 checkbox Gift wrap [checked]', '@e6 button Save', '@e7 button Delete [disabled]', '@e8 link Back to cart'].join('\n'));
});

test('truncation at the size cap leaves a marker', () => {
  const r = renderSnapshot(fx.tree, {maxChars: 60});
  assert.ok(r.text.length < 140 && /… truncated, \d+ more elements$/.test(r.text) && r.truncated > 0);
  assert.equal(renderSnapshot(fx.tree, {maxNodes: 2}).refs.size, 2);
});

test('CDP AX nodes convert; ignored nodes promote children', () => {
  const nodes = [
    {nodeId: '1', role: {value: 'RootWebArea'}, name: {value: 'Shop'}, childIds: ['2'], backendDOMNodeId: 1},
    {nodeId: '2', ignored: true, childIds: ['3']},
    {nodeId: '3', role: {value: 'button'}, name: {value: 'Buy'}, properties: [{name: 'disabled', value: {value: true}}], childIds: [], backendDOMNodeId: 9}];
  assert.equal(renderSnapshot(fromCdp(nodes)).text, '@e1 rootWebArea Shop\n@e2 button Buy [disabled]');
  assert.equal(fromCdp(nodes).children[0].id, 9);
});

const fake = () => {
  const calls = [];
  const ok = (k) => async (...a) => (calls.push([k, ...a]), {ok: true});
  return {calls, backend: {press: ok('press'), setValue: ok('set'), scroll: ok('scroll'), clickAt: ok('at')}};
};

test('click @e6 resolves to the Save node; refs expire on the next snapshot', async () => {
  const f = fake(); const c = createRefControl({source: {tree: async () => fx.tree}, backend: f.backend});
  const o = await c.observe(); assert.match(o.text, /^snapshot 1\n/);
  assert.equal((await c.act({action: 'click', ref: '@e6', snapshot: 1})).text, 'click @e6');
  assert.deepEqual(f.calls[0], ['press', fx.tree.children[0].children[6]]);
  assert.equal(fx.tree.children[0].children[6].id, 's');
  await c.act({action: 'fill', ref: '@e3', text: 'Bob'}); assert.deepEqual(f.calls[1].slice(0, 1).concat(f.calls[1][2]), ['set', 'Bob']);
  await c.snapshot();
  const stale = await c.act({action: 'click', ref: '@e6', snapshot: 1});
  assert.deepEqual([stale.ok, stale.error], [false, EXPIRED]);
  assert.equal((await c.act({action: 'click', ref: '@e99'})).error, EXPIRED);
});

test('press failure falls back to a coordinate click at the node centre', async () => {
  const f = fake(); f.backend.press = async () => ({ok: false});
  const c = createRefControl({source: {tree: async () => fx.tree}, backend: f.backend}); await c.snapshot();
  assert.equal((await c.act({action: 'click', ref: '@e6'})).ok, true);
  assert.deepEqual(f.calls[0], ['at', 140, 316]);
});

test('screenshot only on request or when the snapshot is empty', async () => {
  const shots = []; const src = (tree) => ({tree: async () => tree, screenshot: async () => (shots.push(1), 'PNG')});
  const c = createRefControl({source: src(fx.tree), backend: {}});
  assert.equal((await c.observe()).shot, undefined); assert.equal(shots.length, 0);
  assert.equal((await c.observe({screenshot: true})).shot, 'PNG');
  assert.equal((await createRefControl({source: src({role: 'generic', name: ''}), backend: {}}).observe()).shot, 'PNG');
});

test('snapshot costs far fewer tokens than a 1440x900 screenshot (logged)', () => {
  const t = tokensOfText(renderSnapshot(fx.tree).text), i = tokensOfImage(fx.screenshot.width, fx.screenshot.height);
  console.log(`TOKENS snapshot=${t} screenshot_1440x900=${i} ratio=${(i / t).toFixed(1)}x`);
  assert.ok(t * 10 < i);
});

test('backend exception in act returns a result; detached node reads as expired', async () => {
  const f = fake(); const c = createRefControl({source: {tree: async () => fx.tree}, backend: {...f.backend, press: async () => { throw new Error('No node with given id found'); }, setValue: async () => { throw new Error('boom'); }}});
  await c.observe();
  const a = await c.act({action: 'click', ref: '@e6'});
  assert.deepEqual([a.ok, a.reason, a.error], [false, 'stale_ref', EXPIRED]);
  const b = await c.act({action: 'fill', ref: '@e3', text: 'x'});
  assert.deepEqual([b.ok, b.reason, b.error], [false, 'action_failed', 'boom']);
});
