import test from 'node:test';
import assert from 'node:assert/strict';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const W = resolve(process.env.SUFFICE_TASK_WORKSPACE || process.cwd());
const {default: Emittery} = await import(pathToFileURL(resolve(W, 'src/index.js')));
async function settled(promise) {
  let handle;
  try { return await Promise.race([promise, new Promise(resolve => { handle = setTimeout(() => resolve('unsettled'), 100); })]); }
  finally { clearTimeout(handle); }
}

test('I01 named events multicast to all independent iterators', {timeout:2000}, async () => {
  const e = new Emittery(); const a = e.events('x'); const b = e.events('x'); await e.emit('x', 7);
  const result = await Promise.all([settled(a.next()),settled(b.next())]); await a.return(); await b.return();
  assert.deepEqual(result, [{done:false,value:7},{done:false,value:7}]);
});
test('I02 anyEvent multicasts to all independent iterators', {timeout:2000}, async () => {
  const e = new Emittery(); const a = e.anyEvent(); const b = e.anyEvent(); await e.emit('x', 9);
  const result = await Promise.all([settled(a.next()),settled(b.next())]); await a.return(); await b.return();
  assert.deepEqual(result, [{done:false,value:['x',9]},{done:false,value:['x',9]}]);
});
test('I03 slow and fast consumers preserve their own FIFO buffers', {timeout:2000}, async () => {
  const e = new Emittery(); const a = e.events('x'); const b = e.events('x'); await e.emit('x', 1);
  const fast = await settled(a.next()); await e.emit('x', 2);
  const result = [fast,await settled(a.next()),await settled(b.next()),await settled(b.next())]; await a.return(); await b.return();
  assert.deepEqual(result, [{done:false,value:1},{done:false,value:2},{done:false,value:1},{done:false,value:2}]);
});
test('I04 returning one named iterator preserves sibling registration', () => {
  const e = new Emittery(); const a = e.events('x'); const b = e.events('x'); a.return();
  assert.equal(e.listenerCount('x'), 1);
});
test('I05 sibling named iterator keeps receiving after return', {timeout:2000}, async () => {
  const e = new Emittery(); const a = e.events('x'); const b = e.events('x'); await a.return(); await e.emit('x', 'live');
  const result = await settled(b.next()); await b.return();
  assert.deepEqual(result, {done:false,value:'live'});
});
test('I06 returning one any iterator preserves sibling delivery', {timeout:2000}, async () => {
  const e = new Emittery(); const a = e.anyEvent(); const b = e.anyEvent(); await a.return(); await e.emit('x', 3);
  const result = [e.listenerCount('x'),await settled(b.next())]; await b.return();
  assert.deepEqual(result, [1,{done:false,value:['x',3]}]);
});
test('I07 multi-event return preserves all unrelated subscriptions', {timeout:2000}, async () => {
  const e = new Emittery(); const a = e.events(['x','y']); const b = e.events('x'); const c = e.events('y');
  await a.return(); await e.emit('x', 1); await e.emit('y', 2);
  const result = [e.listenerCount(),await settled(b.next()),await settled(c.next())]; await b.return(); await c.return();
  assert.deepEqual(result, [2,{done:false,value:1},{done:false,value:2}]);
});
test('I08 clear named event drains buffered data before done', {timeout:2000}, async () => {
  const e = new Emittery(); const a = e.events('x'); await e.emit('x', 1); await e.emit('x', 2); e.clearListeners('x');
  assert.deepEqual([await settled(a.next()),await settled(a.next()),await settled(a.next()),e.listenerCount('x')], [{done:false,value:1},{done:false,value:2},{done:true},0]);
});
test('I09 clear all retains buffers of named and any iterators', {timeout:2000}, async () => {
  const e = new Emittery(); const a = e.events('x'); const b = e.anyEvent(); await e.emit('x', 4); e.clearListeners();
  assert.deepEqual([await settled(a.next()),await settled(a.next()),await settled(b.next()),await settled(b.next()),e.listenerCount()], [{done:false,value:4},{done:true},{done:false,value:['x',4]},{done:true},0]);
});
test('I10 clear named event leaves other named and any streams active', {timeout:2000}, async () => {
  const e = new Emittery(); const a = e.events('x'); const b = e.events('y'); const c = e.anyEvent(); e.clearListeners('x'); await e.emit('y', 5);
  const result = [await settled(a.next()),await settled(b.next()),await settled(c.next())]; await b.return(); await c.return();
  assert.deepEqual(result, [{done:true},{done:false,value:5},{done:false,value:['y',5]}]);
});
test('I11 return discards own buffer and forwards awaited value', {timeout:2000}, async () => {
  const e = new Emittery(); const a = e.events('x'); await e.emit('x', 1);
  assert.deepEqual([await a.return(Promise.resolve('closed')),await settled(a.next()),e.listenerCount('x')], [{done:true,value:'closed'},{done:true},0]);
});
test('I12 return wakes a pending next with done', {timeout:2000}, async () => {
  const e = new Emittery(); const a = e.events('x'); const pending = a.next(); await a.return();
  assert.deepEqual(await settled(pending), {done:true});
});
test('I13 clear wakes an empty waiting iterator and permits a fresh one', {timeout:2000}, async () => {
  const e = new Emittery(); const a = e.events('x'); const pending = a.next(); e.clearListeners('x');
  const b = e.events('x'); await e.emit('x', 6); const result = [await settled(pending),await settled(b.next())]; await b.return();
  assert.deepEqual(result, [{done:true},{done:false,value:6}]);
});
test('I14 symbol and numeric channels keep identity in anyEvent', {timeout:2000}, async () => {
  const e = new Emittery(); const symbol = Symbol('channel'); const a = e.events([symbol,0]); const b = e.anyEvent();
  await e.emit(symbol, Promise.resolve('s')); await e.emit(0, Promise.resolve('n'));
  const result = [await settled(a.next()),await settled(a.next()),await settled(b.next()),await settled(b.next())]; await a.return(); await b.return();
  assert.deepEqual(result, [{done:false,value:'s'},{done:false,value:'n'},{done:false,value:[symbol,'s']},{done:false,value:[0,'n']}]);
});
test('I15 instances isolate subscriptions cleanup and buffers', {timeout:2000}, async () => {
  const e = new Emittery(); const other = new Emittery(); const a = e.events('x'); const b = other.events('x');
  await e.emit('x', 1); await other.emit('x', 2); e.clearListeners();
  const result = [await settled(a.next()),await settled(b.next()),e.listenerCount(),other.listenerCount()]; await b.return();
  assert.deepEqual(result, [{done:false,value:1},{done:false,value:2},0,1]);
});
test('I16 clear buffers independent same-event consumers', {timeout:2000}, async () => {
  const e = new Emittery(); const a = e.events('x'); const b = e.events('x'); await e.emit('x', 3); e.clearListeners('x');
  assert.deepEqual([await settled(a.next()),await settled(b.next()),await settled(a.next()),await settled(b.next())], [{done:false,value:3},{done:false,value:3},{done:true},{done:true}]);
});
test('I17 returning repeatedly does not unregister a new sibling', {timeout:2000}, async () => {
  const e = new Emittery(); const a = e.events('x'); await a.return(); const b = e.events('x'); await a.return(); await e.emit('x', 8);
  const result = await settled(b.next()); await b.return();
  assert.deepEqual(result, {done:false,value:8});
});
test('I18 clearing several names drains each selected buffer', {timeout:2000}, async () => {
  const e = new Emittery(); const a = e.events('x'); const b = e.events('y'); await e.emit('x', 1); await e.emit('y', 2); e.clearListeners(['x','y']);
  assert.deepEqual([await settled(a.next()),await settled(b.next()),await settled(a.next()),await settled(b.next())], [{done:false,value:1},{done:false,value:2},{done:true},{done:true}]);
});
