import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {mkdtemp,rm,readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {ModelRuntime} from '@earendil-works/pi-coding-agent';
import {parseOptions} from '../packages/cli/src/options.mjs';
import {createSufficeSession} from '../packages/cli/src/session.mjs';

for(const scenario of [{name:'cost allowance',options:{maxCost:0.1,requestReserveUsd:0.15},reason:'allowance'},{name:'payload allowance',options:{maxCost:10,maxProviderPayloadBytes:1},reason:'input_payload_limit'}]){
  test(`a rejected ${scenario.name} makes no HTTP model request and retains known zero usage`,async()=>{
    const dir=await mkdtemp(resolve(tmpdir(),'suffice-preflight-'));let requests=0,agent;
    const server=createServer((_req,res)=>{requests++;res.writeHead(503,{'content-type':'application/json'});res.end('{"error":{"message":"Local test only"}}');});
    await new Promise(r=>server.listen(0,'127.0.0.1',r));
    const originalFetch=globalThis.fetch;
    globalThis.fetch=(url,init)=>{if(!String(url).startsWith('http://127.0.0.1:'))throw new Error('External network prohibited in preflight test');return originalFetch(url,init);};
    try{
      await writeFile(resolve(dir,'auth.json'),JSON.stringify({openai:{type:'api_key',key:'local-unit-test-only'}}));
      const runtime=await ModelRuntime.create({authPath:resolve(dir,'auth.json'),modelsPath:null,refreshOnCreate:false,allowModelNetwork:false});
      const model={...runtime.getModel('openai','gpt-6-luna'),api:'openai-responses',baseUrl:`http://127.0.0.1:${server.address().port}/v1`};
      agent=await createSufficeSession({...parseOptions([]),cwd:dir,home:dir,model:'gpt-6-luna',effort:'xhigh',modelObject:model,timeout:10,retryCount:0,...scenario.options},runtime);
      await assert.rejects(agent.run('Local preflight unit fixture.'),/allowance|payload|aborted/i);
      await agent.flush();const events=(await readFile(agent.eventPath,'utf8')).trim().split('\n').map(JSON.parse);
      assert.equal(requests,0);assert.equal(events.filter(e=>e.type==='provider_request').length,0);
      assert.ok(events.some(e=>e.type==='provider_request_blocked'&&e.reason===scenario.reason&&e.dispatched===false));
      assert.equal(agent.totals.estimatedApiUsd,0);assert.equal(agent.totals.costUnknown,false);
    }finally{globalThis.fetch=originalFetch;await agent?.dispose();server.closeAllConnections();await new Promise(r=>server.close(r));await rm(dir,{recursive:true,force:true});}
  });
}
test('a dispatched request without usage remains unknown',async()=>{
  const dir=await mkdtemp(resolve(tmpdir(),'suffice-dispatch-'));let requests=0,agent;
  const server=createServer((_req,res)=>{requests++;res.writeHead(503,{'content-type':'application/json'});res.end('{"error":{"message":"Local test only"}}');});await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const originalFetch=globalThis.fetch;globalThis.fetch=(url,init)=>{if(!String(url).startsWith('http://127.0.0.1:'))throw new Error('External network prohibited in dispatch test');return originalFetch(url,init);};
  try{
    await writeFile(resolve(dir,'auth.json'),JSON.stringify({openai:{type:'api_key',key:'local-unit-test-only'}}));
    const runtime=await ModelRuntime.create({authPath:resolve(dir,'auth.json'),modelsPath:null,refreshOnCreate:false,allowModelNetwork:false});
    const model={...runtime.getModel('openai','gpt-6-luna'),api:'openai-responses',baseUrl:`http://127.0.0.1:${server.address().port}/v1`};
    agent=await createSufficeSession({...parseOptions([]),cwd:dir,home:dir,model:'gpt-6-luna',effort:'xhigh',modelObject:model,timeout:10,retryCount:0},runtime);
    await assert.rejects(agent.run('Local missing-usage unit fixture.'));
    assert.equal(requests,1);assert.equal(agent.totals.costUnknown,true);
  }finally{globalThis.fetch=originalFetch;await agent?.dispose();server.closeAllConnections();await new Promise(r=>server.close(r));await rm(dir,{recursive:true,force:true});}
});
