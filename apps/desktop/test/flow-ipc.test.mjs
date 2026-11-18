import test from 'node:test';
import assert from 'node:assert/strict';
import {createFlow} from '../electron/flow-ipc.mjs';

test('flow-cancel reports a run this window does not own instead of pretending it was cancelled',()=>{
 const f=createFlow({dataDir:'/nonexistent-flow-ipc',env:{SUFFICE_FLOW_RUNNER:'fake'},send(){}});
 f.attach({cancelRun:id=>id==='mine'});
 assert.equal(f.handlers['flow-cancel']('mine'),true);
 assert.throws(()=>f.handlers['flow-cancel']('theirs'),/not running in this window/);
});
