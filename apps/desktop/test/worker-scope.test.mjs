import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const src=readFileSync(new URL('../electron/worker.mjs',import.meta.url),'utf8');
test('newlyCreated is declared outside the if(!agent) block that its later uses sit outside of',()=>{
  const decl=src.indexOf('let newlyCreated'),block=src.indexOf('if(!agent){'),late=src.lastIndexOf('newlyCreated&&options.desktopSettings.naming');
  assert.ok(decl>0&&late>0,'declaration and late use exist');
  assert.ok(decl<block,'declared before the block');
  assert.ok(!/const newlyCreated/.test(src),'no block-scoped const');
});
