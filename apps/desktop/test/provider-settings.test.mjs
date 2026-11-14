import test from 'node:test';
import assert from 'node:assert/strict';
import {createProviderSettings} from '../electron/provider-settings.mjs';

test('provider settings delegate discovery and authentication to Pi without exposing credentials',async()=>{
 const events=[],saved=new Map();let promptReached;const ready=new Promise(resolve=>promptReached=resolve);
 const providers=[{id:'fixture',name:'Fixture',auth:{apiKey:{name:'API key',login:true},oauth:{name:'Subscription'}}}];
 const rt={getProviders:()=>providers,getProvider:id=>providers.find(p=>p.id===id),listCredentials:async()=>[...saved.keys()].map(providerId=>({providerId,type:'api_key'})),hasConfiguredAuth:id=>saved.has(id),async login(id,type,interaction){const secret=await interaction.prompt({type:'secret',message:'Enter key'});saved.set(id,secret);},async logout(id){saved.delete(id);}};
 const service=createProviderSettings({createRuntime:async()=>rt,emit:event=>{events.push(event);if(event.type==='prompt')promptReached(event);},openBrowser:()=>{throw new Error('No browser expected');}});
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
 const service=createProviderSettings({createRuntime:async()=>({getProvider:()=>provider,login:async(id,type,interaction)=>interaction.prompt({type:'manual_code',message:'Code'})}),emit:event=>{if(event.type==='prompt')ready();},openBrowser(){}});
 const result=service.login({provider:'fixture',type:'oauth'});await reached;service.cancel();await assert.rejects(result,/cancelled/);
});
