import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
const { createTranscriber, NO_KEY } = createRequire(import.meta.url)('../electron/voice-transcribe.cjs');
const KEY = 'sk-test-secret-123';
const ok = (body, status = 200) => ({ ok: status < 300, status, json: async () => body });
function setup(res, key = KEY) {
  const calls = [];
  const fetchImpl = async (url, init) => { calls.push({ url, init }); if (res instanceof Error) throw res; return res; };
  return { calls, t: createTranscriber({ getApiKey: () => key, fetchImpl }) };
}
const audio = new Uint8Array([1, 2, 3]);

test('one request, key only in Authorization, text returned', async () => {
  const { t, calls } = setup(ok({ text: ' hello ' }));
  const out = await t.transcribe({ audio, mimeType: 'audio/webm;codecs=opus', prompt: 'suffice, main.cjs' });
  assert.deepEqual(out, { text: ' hello ' });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://api.openai.com/v1/audio/transcriptions');
  assert.equal(calls[0].init.headers.Authorization, `Bearer ${KEY}`);
  const form = calls[0].init.body;
  assert.equal(form.get('model'), 'gpt-transcribe');
  assert.equal(form.get('prompt'), 'suffice, main.cjs');
  assert.equal(form.get('file').name, 'dictation.webm');
  assert.ok(!JSON.stringify([...form.entries()].map(([k, v]) => (typeof v === 'string' ? v : k))).includes(KEY));
});
test('no key', async () => {
  const { t, calls } = setup(ok({ text: 'x' }), '');
  await assert.rejects(t.transcribe({ audio, mimeType: 'audio/webm' }), { message: NO_KEY });
  assert.equal(NO_KEY, 'Add an OpenAI API key in Settings, Providers, to use voice.');
  assert.equal(calls.length, 0);
});
test('401, 500 and network failure give plain sentences without key or status', async () => {
  for (const res of [ok({ error: { message: KEY } }, 401), ok({}, 500), new Error(`boom ${KEY}`)]) {
    const { t } = setup(res);
    const err = await t.transcribe({ audio, mimeType: 'audio/webm' }).catch((e) => e);
    assert.match(err.message, /^[A-Z][^{}\d]*\.$/);
    assert.ok(!err.message.includes(KEY));
  }
});
test('size and mime rejections happen before any request', async () => {
  const { t, calls } = setup(ok({ text: 'x' }));
  await assert.rejects(t.transcribe({ audio: new Uint8Array(25 * 1024 * 1024 + 1), mimeType: 'audio/webm' }), /too large/);
  await assert.rejects(t.transcribe({ audio, mimeType: 'text/plain' }), /not supported/);
  await assert.rejects(t.transcribe({ audio, mimeType: undefined }), /not supported/);
  await assert.rejects(t.transcribe({ audio: 'nope', mimeType: 'audio/webm' }), /No audio/);
  assert.equal(calls.length, 0);
});
test('malformed response is a plain sentence', async () => {
  const { t } = setup(ok({ nothing: 1 }));
  await assert.rejects(t.transcribe({ audio, mimeType: 'audio/mp4' }), /could not transcribe/);
});
