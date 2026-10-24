import test from 'node:test';
import assert from 'node:assert/strict';
import {publicOrder,SEED,UPSTREAM_COMMIT,runPublicProbe,assertDiskHeadroom,MIN_FREE_BYTES} from '../scripts/v11-swepro-prepare.mjs';
import {hash} from '../src/v9/workspace.mjs';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';

test('SWEPro order is input-order independent, exhaustive and repository balanced',()=>{
  const ids=['instance_alpha__project-'+ 'a'.repeat(40),'instance_alpha__project-'+ 'b'.repeat(40),'instance_beta__project-'+ 'c'.repeat(40),'instance_beta__project-'+ 'd'.repeat(40)];
  const rows=publicOrder(ids);
  assert.deepEqual(publicOrder([...ids].reverse()),rows);
  assert.equal(new Set(rows.map(x=>x.id)).size,4);
  assert.notEqual(rows[0].repo,rows[1].repo);
  assert.notEqual(rows[2].repo,rows[3].repo);
  for(const row of rows)assert.equal(row.rank,hash(SEED+'\0'+row.id));
});
test('SWEPro selection rejects invented or unsafe task identifiers',()=>{
  for(const id of ['task','../instance_a-'+ 'a'.repeat(40),'instance_a-xx','instance_../../foo-'+ 'a'.repeat(40)])assert.throws(()=>publicOrder([id]),/Invalid/);
  assert.match(UPSTREAM_COMMIT,/^[a-f0-9]{40}$/);
});
test('SWEPro selector cannot count a duplicated task twice',()=>{
  const id='instance_alpha__project-'+ 'a'.repeat(40);
  assert.throws(()=>publicOrder([id,id]),/unique/);
  assert.deepEqual(publicOrder([]),[]);
});
test('qualification pauses on low or unknown disk without deleting existing resources',()=>{
  assert.doesNotThrow(()=>assertDiskHeadroom(MIN_FREE_BYTES));
  for(const available of[MIN_FREE_BYTES-1,0,NaN,undefined])assert.throws(()=>assertDiskHeadroom(available),/preserve existing images and volumes/);
});
test('an engine failure still attempts probe cleanup and cannot claim safe closure',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'suffice-swepro-probe-test-'));
  try{
    const calls=[],dockerRun=async args=>{calls.push(args);if(args[0]==='run')throw Error('engine unavailable');return{exitCode:1,error:'engine unavailable',stdout:''};};
    const result=await runPublicProbe({imageId:'sha256:'+'a'.repeat(64),directory,probe:directory,dockerRun});
    assert.equal(result.removed,false);assert.match(result.process.error,/engine unavailable/);
    assert.ok(calls.some(args=>args[0]==='rm'));assert.ok(calls.some(args=>args[0]==='ps'));
    const receipt=JSON.parse(await readFile(join(directory,'probe-closure.json'),'utf8'));
    assert.equal(receipt.removed,false);assert.ok(receipt.errors.length>0);
  }finally{await rm(directory,{recursive:true,force:true});}
});
