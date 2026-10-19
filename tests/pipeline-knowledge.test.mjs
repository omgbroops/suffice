import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, writeFile, rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {prepareTaskContext} from '../src/pipeline/context.mjs';
import {createRunbook, promoteRunbook, getReusableRunbooks, createTaskHandoff} from '../src/pipeline/knowledge.mjs';

const verification = {id: 'receipt-1', taskId: 'task-1', command: 'node --test', success: true, completedAt: '2026-10-19T12:00:00Z'};
test('runbooks require verified fresh replay before reuse and become ineligible after source changes', async t => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), 'suffice-runbook-'));
  t.after(() => rm(workspace, {recursive: true, force: true}));
  await writeFile(path.join(workspace, 'index.mjs'), 'export const value = 1;');
  const {references} = await prepareTaskContext({workspace, paths: ['index.mjs']});
  assert.throws(() => createRunbook({id:'r',taskId:'task-1',lesson:'Use cancellation check',references,verification:{...verification,success:false}}), /successful/);
  const candidate = createRunbook({id:'r',taskId:'task-1',lesson:'Use cancellation check',references,verification});
  assert.deepEqual((await getReusableRunbooks({workspace,runbooks:[candidate]})).reusable, []);
  await assert.rejects(promoteRunbook({workspace,runbook:candidate,replayVerification:{...verification,freshReplay:true}}), /distinct fresh replay/);
  const promoted = await promoteRunbook({workspace,runbook:candidate,replayVerification:{...verification,id:'receipt-2',taskId:'task-2',freshReplay:true,completedAt:'2026-10-19T13:00:00Z'}});
  assert.equal((await getReusableRunbooks({workspace,runbooks:[promoted]})).reusable.length, 1);
  for(const invalid of [
    {...promoted,version:'invented'},
    {...promoted,lesson:undefined},
    {...promoted,id:undefined},
    {...promoted,verification:{...promoted.verification,taskId:'other-task'}},
    {...promoted,replayVerification:{...promoted.replayVerification,completedAt:'2026-10-18T12:00:00Z'}},
  ]){
    const selected=await getReusableRunbooks({workspace,runbooks:[invalid]});
    assert.equal(selected.reusable.length,0);
    assert.equal(selected.excluded[0].reason,'invalid_evidence');
  }
  await writeFile(path.join(workspace, 'index.mjs'), 'changed');
  const stale = await getReusableRunbooks({workspace,runbooks:[promoted]});
  assert.equal(stale.reusable.length, 0);
  assert.equal(stale.excluded[0].reason, 'stale_sources');
});

test('handoffs require explicit boundary and preserve an isolated full history snapshot', () => {
  const history = [{role:'user',content:'original task'},{role:'assistant',content:'complete detailed answer'}];
  assert.throws(() => createTaskHandoff({taskId:'t',history,summary:'done'}), /explicit task boundary/);
  const result = createTaskHandoff({boundary:true,taskId:'t',history,summary:'done'});
  assert.deepEqual(result.history, history);
  assert.equal(result.resetsSession, false);
  assert.equal(result.historySha256.length,64);
  history[0].content='mutated';
  assert.equal(result.history[0].content, 'original task');
  assert.throws(() => createTaskHandoff({boundary:true,taskId:'t',history,summary:'done',maxBytes:5}), /refusing to truncate/);
});
