import test from 'node:test';
import assert from 'node:assert/strict';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const W = resolve(process.env.SUFFICE_TASK_WORKSPACE || process.cwd());
const {default: Emittery} = await import(pathToFileURL(resolve(W, 'src/index.js')));

test('IV01 named listener registration and disposal', async () => {
  const emitter = new Emittery(); const values = [];
  const off = emitter.on('data', value => values.push(value)); await emitter.emit('data', 1); off(); await emitter.emit('data', 2);
  assert.deepEqual(values, [1]);
});
test('IV02 once and serial event listeners retain payloads', async () => {
  const emitter = new Emittery(); const values = []; const once = emitter.once('data');
  emitter.on('data', async value => values.push(value)); await emitter.emitSerial('data', 4);
  assert.deepEqual([await once, values], [4,[4]]);
});
test('IV03 one named iterator receives ordinary emissions', async () => {
  const emitter = new Emittery(); const it = emitter.events('data'); await emitter.emit('data', 8);
  const result = await it.next(); await it.return();
  assert.deepEqual(result, {done:false,value:8});
});
