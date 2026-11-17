import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
const { createVoiceHub } = createRequire(import.meta.url)('../electron/voice-window.cjs');

function rig() {
  const mk = (name) => ({ name, sent: [], destroyed: false, isDestroyed() { return this.destroyed; }, webContents: { mainFrame: { name }, send(c, m) { this.owner.sent.push([c, m]); } } });
  const main = mk('main'), orb = mk('orb');
  main.webContents.owner = main; orb.webContents.owner = orb;
  const log = [];
  const voiceWindow = { window: () => orb, open: () => log.push('open'), close: () => log.push('close') };
  return { main, orb, log, hub: createVoiceHub({ getMainWindow: () => main, voiceWindow }) };
}
const ev = (frame) => ({ senderFrame: frame });

test('allowlist: orb only where declared, main always, unknown never', () => {
  const { hub, main, orb } = rig();
  assert.equal(hub.senderOf(ev(main.webContents.mainFrame)), 'main');
  assert.equal(hub.senderOf(ev(orb.webContents.mainFrame)), null);
  assert.equal(hub.senderOf(ev(orb.webContents.mainFrame), { allowVoiceWindow: true }), 'orb');
  for (const o of [undefined, { allowVoiceWindow: true }]) {
    assert.equal(hub.senderOf(ev({ name: 'child' }), o), null);
    assert.equal(hub.senderOf(ev(undefined), o), null);
    assert.equal(hub.senderOf(undefined, o), null);
  }
});
test('orb cannot pass as a missing/destroyed window', () => {
  const { hub, orb } = rig(); orb.destroyed = true;
  assert.equal(hub.senderOf(ev(orb.webContents.mainFrame), { allowVoiceWindow: true }), null);
});
test('window action: orb may only close', () => {
  const { hub, log } = rig();
  hub.windowAction('main', 'open'); hub.windowAction('orb', 'close');
  assert.throws(() => hub.windowAction('orb', 'open'), /Invalid/);
  assert.throws(() => hub.windowAction('main', 'bogus'), /Invalid/);
  assert.deepEqual(log, ['open', 'close']);
});
test('relay validation', () => {
  const { hub, main, orb } = rig();
  for (const bad of [null, 'x', 5, [], { type: 'run' }, {}, { type: 7 }, { type: 'caption', text: 'a'.repeat(9000) }]) assert.throws(() => hub.relay('main', bad), /voice message/i);
  assert.equal(main.sent.length + orb.sent.length, 0);
});
test('relay forwards to the other window only', () => {
  const { hub, main, orb } = rig();
  hub.relay('main', { type: 'caption', text: 'hi' });
  assert.deepEqual(orb.sent, [['suffice:voice-relay', { type: 'caption', text: 'hi' }]]); assert.equal(main.sent.length, 0);
  hub.relay('orb', { type: 'control', action: 'mute' });
  assert.deepEqual(main.sent, [['suffice:voice-relay', { type: 'control', action: 'mute' }]]); assert.equal(orb.sent.length, 1);
  orb.destroyed = true; hub.relay('main', { type: 'ended' }); assert.equal(orb.sent.length, 1);
});
