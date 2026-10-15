import test from 'node:test';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
const W = process.env.SUFFICE_WORKSPACE || process.cwd();
const {default:TinyQueue} = await import(pathToFileURL(resolve(W,'src/index.js')));
test('new empty queue has no item', () => {
 const q=new TinyQueue(); assert.equal(q.length,0); assert.equal(q.peek(),undefined); assert.equal(q.pop(),undefined);
});
test('ascending pushes expose the smallest item', () => {
 const q=new TinyQueue(); q.push(2); q.push(5); q.push(9);
 assert.equal(q.length,3); assert.equal(q.peek(),2); assert.equal(q.peek(),2);
});
