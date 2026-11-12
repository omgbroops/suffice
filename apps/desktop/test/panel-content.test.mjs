import test from 'node:test';
import assert from 'node:assert/strict';
import {parseUnifiedDiff} from '../src/panel-content.js';

test('diff presentation retains source line numbers across multiple hunks',()=>{
 const rows=parseUnifiedDiff('diff --git a/a b/a\n--- a/a\n+++ b/a\n@@ -3,2 +3,2 @@\n-old\n+new\n context\n@@ -20,0 +21,1 @@\n+added\n\\ No newline at end of file\n');
 assert.deepEqual(rows.filter(row=>row.kind==='deletion'),[{kind:'deletion',text:'old',old:3,new:null}]);
 assert.deepEqual(rows.filter(row=>row.kind==='addition').map(row=>[row.text,row.new]),[['new',3],['added',21]]);
 assert.equal(rows.find(row=>row.kind==='context').old,4);
 assert.equal(rows.find(row=>row.kind==='context').new,4);
 assert.ok(!rows.some(row=>row.text.startsWith('diff --git')));
});
