import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {executeStrategy} from '../src/execution/strategies.mjs';

async function request(t,extra={}) {
  const root=await mkdtemp(join(tmpdir(),'suffice-orchestrated-'));
  t.after(()=>rm(root,{recursive:true,force:true}));await mkdir(join(root,'repo'));
  return {strategy:'orchestrated',experimental:true,workspace:join(root,'repo'),runDir:join(root,'out'),
    prompt:'Implement a public task.',executionScope:'isolated-task',maxCostUsd:1,
    checks:[{command:['node','public-check.mjs']}],...extra};
}
const message=cost=>({usage:{input:10,cacheRead:2,cacheWrite:0,output:3,cost:cost===null?undefined:{total:cost}},content:[],stopReason:'stop'});

test('Sol cannot edit; Luna implements; nested usage is attributed exactly once',async t=>{
  const options=[];
  const d={runCheck:async()=>({passed:true,exitCode:0,output:'exact evidence'}),
    createSession:async(opt,_runtime,cb)=>{
      options.push(opt);
      return {dispose:async()=>{},run:async()=>{
        if(opt.profile==='coordinate') {
          const names=opt.tools.map(t=>t.name);
          for(const name of ['write','edit','bash'])assert.equal(names.includes(name),false);
          assert.ok(names.includes('delegate')&&names.includes('verify')&&names.includes('read'));
          const output=await opt.tools.find(t=>t.name==='delegate').execute('one',{kind:'implement',brief:'Implement then test the public behavior.'});
          assert.match(output.content[0].text,/Worker claim/);
          await opt.tools.find(t=>t.name==='verify').execute('verify',{});
          cb.onAssistant(message(.03));return 'Reviewed public evidence';
        }
        assert.equal(opt.model,'gpt-6-luna');assert.equal(opt.effort,'high');
        assert.ok(opt.tools.some(t=>t.name==='write'));
        cb.onAssistant(message(.01));return 'Changed implementation.js; test exit 0';
      }};
    }};
  const r=await request(t),out=await executeStrategy(r,d);
  assert.equal(options[0].model,'gpt-6.1-sol');assert.equal(options[0].effort,'high');
  assert.equal(out.delegations,1);assert.equal(out.status,'completed');assert.equal(out.usage.modelCalls,2);
  assert.equal(out.workerCostUsd,.01);assert.ok(Math.abs(out.coordinatorCostUsd-.03)<1e-10);
  assert.ok(Math.abs(out.stages.reduce((n,s)=>n+s.usage.estimatedApiUsd,0)-out.usage.estimatedApiUsd)<1e-10);
  assert.equal(JSON.parse(await readFile(join(r.runDir,'worker.json'),'utf8')).verificationStatus,'passed');
});

test('investigation has no write or shell tools, rejects concurrent delegations and caps them',async t=>{
  const d={runCheck:async()=>({passed:true,exitCode:0}),createSession:async(opt,_r,cb)=>({dispose:async()=>{},run:async()=>{
    if(opt.profile==='coordinate') {
      const delegate=opt.tools.find(t=>t.name==='delegate');
      const first=delegate.execute('1',{kind:'investigate',brief:'Inspect source'});
      await assert.rejects(delegate.execute('2',{kind:'implement',brief:'Edit'}),/active/);await first;
      for(let i=0;i<3;i++)await delegate.execute(String(i),{kind:'investigate',brief:'Inspect source'});
      await assert.rejects(delegate.execute('5',{kind:'implement',brief:'Edit'}),/Four-delegation/);
    }else {
      assert.equal(opt.tools.some(t=>['write','edit','bash'].includes(t.name)),false);
    }
    cb.onAssistant(message(.01));return 'Evidence';
  }})};
  const out=await executeStrategy(await request(t),d);assert.equal(out.delegations,4);assert.equal(out.usage.modelCalls,5);
});

test('unknown worker usage prevents further paid delegation and never becomes a zero-cost success',async t=>{
  let stages=0;
  const d={createSession:async(opt,_r,cb)=>{stages++;return {dispose:async()=>{},run:async()=>{
    if(opt.profile==='coordinate')await opt.tools.find(t=>t.name==='delegate').execute('1',{kind:'implement',brief:'Fix'});
    else cb.onAssistant(message(null));
    return 'Claim';
  }};}};
  const out=await executeStrategy(await request(t),d);
  assert.equal(stages,2);assert.equal(out.status,'cost_unknown');assert.equal(out.usage.costUnknown,true);
  assert.equal(out.budgetEligible,false);assert.equal(out.completionEvidence,'unverified');
});
