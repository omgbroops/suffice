import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const {createVoiceSessions}=createRequire(import.meta.url)('../electron/voice-session.cjs');

const KEY='sk-test-SECRET-123';
const mock=(reply)=>{const calls=[];const fetchImpl=async(url,init)=>{calls.push({url,init});return reply();};return {calls,fetchImpl};};
const ok=()=>({ok:true,status:200,json:async()=>({value:'ek_abc',expires_at:1700000600,session:{id:'sess_1',secret:'extra'}})});

test('mint returns only four fields and sends the key only in the Authorization header',async()=>{
 const {calls,fetchImpl}=mock(ok);
 const out=await createVoiceSessions({getApiKey:async()=>KEY,fetchImpl}).mint();
 assert.deepEqual(Object.keys(out).sort(),['clientSecret','expiresAt','model','voice']);
 assert.equal(out.clientSecret,'ek_abc');assert.equal(out.expiresAt,1700000600);
 assert.equal(calls.length,1);
 assert.equal(calls[0].url,'https://api.openai.com/v1/realtime/client_secrets');
 assert.equal(calls[0].init.headers.Authorization,`Bearer ${KEY}`);
 assert.ok(!calls[0].url.includes(KEY));assert.ok(!calls[0].init.body.includes(KEY));
 assert.ok(!JSON.stringify(out).includes(KEY));
});

test('request body declares background_agent and remain_silent',async()=>{
 const {calls,fetchImpl}=mock(ok);
 await createVoiceSessions({getApiKey:async()=>KEY,fetchImpl}).mint();
 const {session}=JSON.parse(calls[0].init.body);
 assert.equal(session.type,'realtime');
 assert.deepEqual(session.tools.map(t=>t.name),['background_agent','remain_silent']);
 const run=session.tools.find(t=>t.name==='background_agent'),stop=session.tools.find(t=>t.name==='remain_silent');
 assert.equal(run.parameters.properties.prompt.type,'string');assert.deepEqual(run.parameters.required,['prompt']);
 assert.deepEqual(stop.parameters.properties,{});
 assert.match(session.instructions,/Suffice/);assert.match(session.instructions,/\[BACKEND\]/);assert.doesNotMatch(session.instructions,/Codex/);
 const a=session.audio.input;assert.equal(a.turn_detection.type,'server_vad');assert.equal(a.turn_detection.silence_duration_ms,500);
 assert.equal(a.turn_detection.interrupt_response,true);assert.equal(a.turn_detection.create_response,true);assert.equal(a.noise_reduction.type,'near_field');assert.ok(a.transcription.model);
});

test('no key gives the exact sentence and makes no request',async()=>{
 const {calls,fetchImpl}=mock(ok);
 await assert.rejects(createVoiceSessions({getApiKey:async()=>undefined,fetchImpl}).mint(),{message:'Add an OpenAI API key in Settings, Providers, to use voice.'});
 assert.equal(calls.length,0);
});

test('HTTP 401 and network failures give plain sentences without key or status code',async()=>{
 for(const reply of [()=>({ok:false,status:401,json:async()=>({error:{message:`bad ${KEY}`}})}),()=>({ok:false,status:500,json:async()=>({})}),()=>{throw new Error(`ECONNRESET ${KEY}`);}]){
  const err=await createVoiceSessions({getApiKey:async()=>KEY,fetchImpl:mock(reply).fetchImpl}).mint().then(()=>null,e=>e);
  assert.ok(err);assert.ok(!err.message.includes(KEY));assert.ok(!/\d{3}|\{|ECONN/.test(err.message),err.message);
  assert.match(err.message,/^[A-Z][^{}]*\.$/);
 }
});
