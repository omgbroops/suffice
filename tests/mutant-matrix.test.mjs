import test from 'node:test';
import assert from 'node:assert/strict';
import {tasks} from '../benchmarks/tasks.mjs';
import {mutantMatrix} from '../scripts/mutant-matrix.mjs';
test('hard tasks: visible tests cannot tell partial fixes from broken code; only the full fix passes acceptance',async()=>{
  for(const task of tasks.filter(t=>t.split==='hard')){
    const rows=await mutantMatrix(task),full=rows.filter(r=>r.fixed.every(Boolean));
    assert.equal(full.length,1,task.id);assert.equal(full[0].acceptance,'passed',task.id);
    for(const r of rows.filter(r=>!r.fixed.every(Boolean))){assert.notEqual(r.acceptance,'passed',`${task.id} ${r.fixed}`);assert.equal(r.visible,'passed',`${task.id} ${r.fixed}`);}
  }
});
