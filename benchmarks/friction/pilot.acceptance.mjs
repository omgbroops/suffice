import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const W=process.env.SUFFICE_WORKSPACE;
const require=createRequire(resolve(W,'package.json'));
const api=require(resolve(W,'src/collections/queue.js'));
test('drain empties original queue',()=>{const q=[1,2];assert.deepEqual(api.drain(q),[1,2]);assert.deepEqual(q,[]);});
