import test from 'node:test';
import assert from 'node:assert/strict';
import {usageOf,syntaxOf,repeatReads} from '../scripts/audit-context-waste.mjs';

test('Pi fresh/cache/output accounting deduplicates responses and retains unknown failed attempts',()=>{
  const m={role:'assistant',responseId:'r1',usage:{input:20,cacheRead:100,cacheWrite:0,output:10,totalTokens:130,cost:{input:.02,cacheRead:.01,output:.03,total:.06}}};
  const r=usageOf([m,m,{role:'assistant',responseId:'r2',stopReason:'error',usage:{input:0,cacheRead:0,cacheWrite:0,output:0,totalTokens:0,cost:{total:0}}}]);
  assert.equal(r.calls,2);assert.equal(r.duplicates,1);assert.equal(r.usage.totalTokens,130);assert.equal(r.costs.total,.06);assert.equal(r.unknown,1);assert.equal(r.zeroUsageErrorCalls,1);assert.equal(r.identityMismatches,0);
});
test('AST audit ignores store/parallel words in comments and strings, and never executes scripts',()=>{
  const r=syntaxOf('// store("x", 1)\nconst s="load(x) Promise.all"; const r=await tools.file_read({path:"a"}); text(r); store("r",r); text(load("r").text); await Promise.allSettled([]);');
  assert.equal(r.parsed,true);assert.equal(r.store,1);assert.equal(r.load,1);assert.equal(r.parallel,1);assert.equal(r.wholeResultEmits,1);
  assert.equal(syntaxOf('not valid JS !').parsed,false);
});
test('repeat reads require the same returned hash and actor as well as a normalized range',()=>{
  const e={type:'tool',name:'file_read',actor:'parent',args:{path:'src/a.js'},resultHash:'first',resultChars:80};
  const r=repeatReads([e,{...e,args:{path:'src\\a.js',offset:1,limit:200}},{...e,resultHash:'after-edit'},{...e,actor:'worker'}]);
  assert.equal(r.reads,4);assert.equal(r.exactRepeats,1);assert.equal(r.repeatRawCharacters,80);
});
