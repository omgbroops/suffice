import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {installationId} from '../../../packages/cli/src/installation-id.mjs';
import {createProviderSettings,providerLoginErrorMessage} from '../electron/provider-settings.mjs';

test('provider settings delegate discovery and authentication to Pi without exposing credentials',async()=>{
 const events=[],saved=new Map();let promptReached;const ready=new Promise(resolve=>promptReached=resolve);
 const providers=[{id:'fixture',name:'Fixture',auth:{apiKey:{name:'API key',login:true},oauth:{name:'Subscription'}}}];
 const rt={getProviders:()=>providers,getProvider:id=>providers.find(p=>p.id===id),listCredentials:async()=>[...saved.keys()].map(providerId=>({providerId,type:'api_key'})),hasConfiguredAuth:id=>saved.has(id),async login(id,type,interaction){const secret=await interaction.prompt({type:'secret',message:'Enter key'});saved.set(id,secret);},async logout(id){saved.delete(id);}};
 const service=createProviderSettings({home:await mkdtemp(resolve(tmpdir(),'suffice-auth-test-')),createRuntime:async()=>rt,emit:event=>{events.push(event);if(event.type==='prompt')promptReached(event);},openBrowser:()=>{throw new Error('No browser expected');}});
 assert.equal((await service.list())[0].methods.length,2);
 await assert.rejects(service.login({provider:'unknown',type:'api_key'}),/Unsupported/);
 const login=service.login({provider:'fixture',type:'api_key'}),prompt=await ready;
 assert.throws(()=>service.answer({id:999,value:'bad'}),/Invalid/);
 service.answer({id:prompt.id,value:'fixture-secret'});
 assert.equal((await login)[0].connected,true);assert.equal(saved.get('fixture'),'fixture-secret');assert.ok(!JSON.stringify(events).includes('fixture-secret'));
 assert.equal((await service.logout('fixture'))[0].connected,false);
});

test('cancelling login rejects pending prompt and permits another connection',async()=>{
 let ready;const reached=new Promise(resolve=>ready=resolve);const provider={id:'fixture',name:'Fixture',auth:{oauth:{name:'Subscription'}}};
 const service=createProviderSettings({home:await mkdtemp(resolve(tmpdir(),'suffice-auth-test-')),createRuntime:async()=>({getProvider:()=>provider,login:async(id,type,interaction)=>interaction.prompt({type:'manual_code',message:'Code'})}),emit:event=>{if(event.type==='prompt')ready();},openBrowser(){}});
 const result=service.login({provider:'fixture',type:'oauth'});await reached;service.cancel();await assert.rejects(result,/cancelled/);
});

test('real Pi ChatGPT OAuth reaches browser authorization with the shared installation ID',{timeout:15000},async()=>{
 const previous=process.env.PI_OFFLINE,previousHost=process.env.PI_OAUTH_CALLBACK_HOST;process.env.PI_OFFLINE='1';process.env.PI_OAUTH_CALLBACK_HOST='127.0.0.2';const home=await mkdtemp(resolve(tmpdir(),'suffice-chatgpt-auth-'));let authorization;
 const service=createProviderSettings({home,emit(){},openBrowser(url){authorization=new URL(url);service.cancel();}});
 try{
  await assert.rejects(service.login({provider:'openai',type:'oauth'}),/cancelled|aborted/i);
  assert.equal(authorization?.origin,'https://auth.openai.com');
  assert.equal(authorization.searchParams.get('agent_name_hint'),'Suffice');
  assert.equal(authorization.searchParams.get('ext_agent_host_id'),'urn:uuid:'+await installationId(home));
 }finally{service.cancel();if(previous===undefined)delete process.env.PI_OFFLINE;else process.env.PI_OFFLINE=previous;if(previousHost===undefined)delete process.env.PI_OAUTH_CALLBACK_HOST;else process.env.PI_OAUTH_CALLBACK_HOST=previousHost;}
});

test('provider errors expose useful causes without forwarding credential-bearing SDK responses',()=>{
 assert.match(providerLoginErrorMessage(new Error('Port 1455 is in use, probably by an unfinished login')),/callback port/);
 assert.match(providerLoginErrorMessage(new Error('fetch failed')),/connection/);
 assert.equal(providerLoginErrorMessage(new Error('Login cancelled')),'Sign-in cancelled.');
 const secret='secret-access-token';const message=providerLoginErrorMessage(new Error('OpenAI OAuth token request failed (403): '+secret));assert.match(message,/HTTP 403/);assert.ok(!message.includes(secret));
 assert.equal(providerLoginErrorMessage(new Error(secret)),'Could not connect to the provider. Please try again.');
});
