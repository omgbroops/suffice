import test from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const workspace = process.env.SUFFICE_WORKSPACE;
const load = relative => import(pathToFileURL(resolve(workspace, relative)).href);
if (!workspace) {
  test('acceptance requires an isolated SUFFICE_WORKSPACE', { skip: true }, () => {});
} else {
const { readLines, LineReader } = await load('src/lines.mjs');
test('every byte split preserves multibyte text and CRLF', async () => {
  const bytes = new TextEncoder().encode('café\r\n\n🙂雪\nfinal');
  for (let i = 1; i < bytes.length; i++) {
    assert.deepEqual(await readLines([bytes.slice(0, i), bytes.slice(i)]), ['café', '', '🙂雪', 'final'], 'split ' + i);
  }
  assert.deepEqual(await readLines(Array.from(bytes, byte => Uint8Array.of(byte))), ['café', '', '🙂雪', 'final']);
});
test('lone final CR is content and trailing LF does not invent a line', async () => {
  const encoder = new TextEncoder();
  assert.deepEqual(await readLines([encoder.encode('x\r')]), ['x\r']);
  assert.deepEqual(await readLines([encoder.encode('\r')]), ['\r']);
  assert.deepEqual(await readLines([encoder.encode('x\n')]), ['x']);
  assert.deepEqual(await readLines([]), []);
});
test('unfinished UTF-8 is replaced only when finalized', () => {
  const reader = new LineReader();
  assert.deepEqual(reader.feed(Uint8Array.of(0xe2, 0x82)), []);
  assert.deepEqual(reader.end(), ['�']);
});
}
