import test from 'node:test';
import assert from 'node:assert/strict';
import {createRealtimeVoiceProvider} from '../src/voice/provider-realtime.js';
import {validateVoiceEvent} from '../src/voice/provider.js';

globalThis.Audio=class{};

function rig(over={}){
 let time=0,nid=1;const timers=new Map();
 const clock={now:()=>time,setTimer:(fn,ms)=>{const id=nid++;timers.set(id,{fn,due:time+ms});return id;},clearTimer:id=>timers.delete(id)};
 const advance=ms=>{const end=time+ms;for(;;){const n=[...timers].filter(([,t])=>t.due<=end).sort((a,b)=>a[1].due-b[1].due)[0];if(!n)break;timers.delete(n[0]);time=n[1].due;n[1].fn();}time=end;};
 const pcs=[];const events=[],sent=[];let dc,pc,tracks=[],closed={ctx:0};
 const track={enabled:true,stop(){track.stopped=true;}};
 const stream={getTracks:()=>[track],getAudioTracks:()=>[track]};
 class PC{constructor(){pc=this;pcs.push(this);this.closed=false;}
  addTrack(){} createDataChannel(label){this.label=label;dc={readyState:'open',sent,send:m=>sent.push(JSON.parse(m)),close(){dc.readyState='closed';}};return dc;}
  async createOffer(){return {type:'offer',sdp:'OFFER'};} async setLocalDescription(){} async setRemoteDescription(d){this.remote=d;} close(){this.closed=true;}}
 class AC{createAnalyser(){return {fftSize:512,getFloatTimeDomainData(b){b.fill(0.1);}};} createMediaStreamSource(){return {connect(){}};} async close(){closed.ctx++;}}
 const fetchCalls=[];
 const p=createRealtimeVoiceProvider({emit:e=>events.push(validateVoiceEvent(e)),
  mintSession:async()=>({clientSecret:'ek_x',expiresAt:1,model:'m',voice:'v'}),
  getUserMedia:async c=>{rig.constraints=c;return stream;},RTCPeerConnectionImpl:PC,AudioContextImpl:AC,
  fetchImpl:async(u,i)=>{fetchCalls.push({u,i});return {ok:true,text:async()=>'ANSWER'};},...clock,...over});
 const feed=ev=>dc.onmessage({data:JSON.stringify(ev)});
 const states=()=>events.filter(e=>e.type==='state').map(e=>e.state);
 return {p,events,sent,feed,advance,timers,pcs,states,track,fetchCalls,get pc(){return pc;},get dc(){return dc;},closed,open:()=>{dc.onopen();pc.ontrack({streams:[{}]});}};
}

test('normal turn maps server events to contract events',async()=>{
 const r=rig();await r.p.start();r.open();
 assert.equal(r.fetchCalls[0].u,'https://api.openai.com/v1/realtime/calls');
 assert.equal(r.fetchCalls[0].i.headers.Authorization,'Bearer ek_x');assert.equal(r.fetchCalls[0].i.body,'OFFER');
 assert.equal(r.pc.remote.sdp,'ANSWER');assert.equal(r.pc.label,'oai-events');
 assert.equal(rig.constraints.audio.echoCancellation,true);
 r.feed({type:'input_audio_buffer.speech_started'});
 r.feed({type:'conversation.item.input_audio_transcription.delta',item_id:'i',delta:'hel'});
 r.feed({type:'conversation.item.input_audio_transcription.delta',item_id:'i',delta:'lo'});
 r.feed({type:'input_audio_buffer.speech_stopped'});
 r.feed({type:'conversation.item.input_audio_transcription.completed',item_id:'i',transcript:'hello'});
 r.feed({type:'response.created'});
 r.feed({type:'response.output_audio_transcript.delta',delta:'Hi '});
 r.feed({type:'response.output_audio_transcript.delta',delta:'there.'});
 r.feed({type:'response.output_audio_transcript.done',transcript:'Hi there.'});
 r.feed({type:'output_audio_buffer.started'});
 r.feed({type:'response.done',response:{status:'completed'}});
 r.feed({type:'output_audio_buffer.stopped'});
 assert.equal(r.states().at(-1),'speaking');// held 500 ms after the last audio
 r.advance(500);
 assert.deepEqual(r.states(),['connecting','listening','hearing','thinking','speaking','listening']);
 assert.deepEqual(r.events.filter(e=>/partial|final/.test(e.type)).map(e=>[e.type,e.text]),
  [['user_partial','hel'],['user_partial','hello'],['user_final','hello'],['agent_partial','Hi '],['agent_partial','Hi there.'],['agent_final','Hi there.']]);
 await new Promise(r=>setTimeout(r,80));
 assert.ok(r.events.some(e=>e.type==='level'&&e.input>0&&e.input<=1));
 await r.p.stop();
});

test('function call round trip',async()=>{
 const r=rig();await r.p.start();r.open();
 r.feed({type:'response.created'});
 r.feed({type:'response.function_call_arguments.done',call_id:'c1',name:'background_agent',arguments:'{"prompt":"add a test"}'});
 r.feed({type:'response.done',response:{status:'completed'}});
 assert.deepEqual(r.events.find(e=>e.type==='tool_call'),{type:'tool_call',id:'c1',name:'background_agent',args:{prompt:'add a test'}});
 assert.equal(r.states().at(-1),'working');
 r.p.sendToolResult('c1','done');
 assert.deepEqual(r.sent,[{type:'conversation.item.create',item:{type:'function_call_output',call_id:'c1',output:'done'}},{type:'response.create'}]);
 r.feed({type:'response.created'});r.feed({type:'response.done',response:{status:'completed'}});
 assert.equal(r.states().at(-1),'listening');
 // malformed arguments never reach the app; the model gets an error result instead
 r.feed({type:'response.function_call_arguments.done',call_id:'c2',name:'background_agent',arguments:'{oops'});
 assert.equal(r.events.filter(e=>e.type==='tool_call').length,1);
 assert.equal(r.sent.at(-2).item.call_id,'c2');
 await r.p.stop();
});

test('barge-in cancels, reports what was heard, then heard state',async()=>{
 const r=rig();await r.p.start();r.open();
 r.feed({type:'response.created'});
 r.feed({type:'response.output_audio_transcript.delta',delta:'Working on'});
 r.feed({type:'input_audio_buffer.speech_started'});
 assert.deepEqual(r.sent.map(e=>e.type),['response.cancel','output_audio_buffer.clear']);
 assert.deepEqual(r.events.find(e=>e.type==='agent_final'),{type:'agent_final',text:'Working on',interrupted:true,heard:'Working on'});
 assert.equal(r.states().at(-1),'heard');
 // late deltas of the cancelled response are dropped
 r.feed({type:'response.output_audio_transcript.delta',delta:' more'});
 r.feed({type:'response.done',response:{status:'cancelled'}});
 assert.equal(r.events.filter(e=>e.type==='agent_final').length,1);
 assert.equal(r.states().at(-1),'heard');
 // manual interrupt() while speaking does the same
 r.feed({type:'response.created'});r.feed({type:'response.output_audio_transcript.delta',delta:'Again'});
 r.p.interrupt();
 assert.equal(r.events.filter(e=>e.type==='agent_final').length,2);
 await r.p.stop();
});

test('mute disables the mic track and reports muted then listening',async()=>{
 const r=rig();await r.p.start();r.open();
 r.p.setMuted(true);assert.equal(r.track.enabled,false);assert.equal(r.states().at(-1),'muted');
 r.p.setMuted(false);assert.equal(r.track.enabled,true);assert.equal(r.states().at(-1),'listening');
 await r.p.stop();
});

test('denied microphone gives the plain sentence and ends',async()=>{
 const r=rig({getUserMedia:async()=>{throw Object.assign(new Error('x'),{name:'NotAllowedError'});}});
 await r.p.start();await new Promise(r=>setTimeout(r,0));
 assert.deepEqual(r.events.find(e=>e.type==='error'),{type:'error',message:'Suffice could not use the microphone. Allow it in System Settings, Privacy, Microphone.'});
 assert.equal(r.events.filter(e=>e.type==='ended').length,1);
});

test('mint failure strips the IPC wrapper',async()=>{
 const r=rig({mintSession:async()=>{throw new Error("Error invoking remote method 'suffice:voice-session': Error: Add an OpenAI API key in Settings, Providers, to use voice.");}});
 await r.p.start();
 assert.equal(r.events.find(e=>e.type==='error').message,'Add an OpenAI API key in Settings, Providers, to use voice.');
});

test('stop emits ended once and releases everything',async()=>{
 const r=rig();await r.p.start();r.open();
 await r.p.stop();await r.p.stop();
 assert.equal(r.events.filter(e=>e.type==='ended').length,1);
 assert.equal(r.track.stopped,true);assert.equal(r.pc.closed,true);assert.equal(r.dc.readyState,'closed');assert.equal(r.closed.ctx,1);
});

const ofType=(r,t)=>r.sent.filter(e=>e.type===t);
const done=r=>r.feed({type:'response.done',response:{status:'completed'}});

test('response queue: no response.create while one is active; it is sent when that response is done',async()=>{
 const r=rig();await r.p.start();r.open();
 r.feed({type:'response.created'});
 r.p.sendToolResult('c1','x');
 assert.equal(ofType(r,'response.create').length,0);
 assert.equal(ofType(r,'conversation.item.create').length,1);
 r.p.sendToolResult('c2','y');r.p.sendToolResult('c3','z'); // several requests collapse into one
 done(r);
 assert.equal(ofType(r,'response.create').length,1);
 // that response is now active, so the next request waits again
 r.p.finishTask('c4');
 assert.equal(ofType(r,'response.create').length,1);
 done(r);
 assert.equal(ofType(r,'response.create').length,2);
 await r.p.stop();
});

test('response queue: an "already has an active response" error defers instead of failing',async()=>{
 const r=rig();await r.p.start();r.open();
 r.p.steerAck('c1');
 assert.equal(ofType(r,'response.create').length,1);
 r.feed({type:'error',error:{message:'Conversation already has an active response in progress: resp_1.'}});
 assert.equal(r.events.filter(e=>e.type==='error').length,0);
 assert.equal(r.events.filter(e=>e.type==='ended').length,0);
 done(r);
 assert.equal(ofType(r,'response.create').length,2);
 await r.p.stop();
});

test('sendProgress sends a [BACKEND] user message with no response request; long text keeps head and tail',async()=>{
 const r=rig();await r.p.start();r.open();
 r.p.sendProgress('Running tests');
 assert.deepEqual(r.sent,[{type:'conversation.item.create',item:{type:'message',role:'user',content:[{type:'input_text',text:'[BACKEND] Running tests'}]}}]);
 r.sent.length=0;
 r.p.sendProgress('H'.repeat(5000)+'T'.repeat(5000));
 const text=r.sent[0].item.content[0].text;
 assert.ok(text.startsWith('[BACKEND] HHH')&&text.endsWith('TTT'));
 assert.ok(text.includes('\n…output truncated…\n'));
 assert.ok(text.length-'[BACKEND] '.length<=4000&&text.length>3900);
 assert.equal(ofType(r,'response.create').length,0);
 await r.p.stop();
});

test('finishTask and steerAck send the fixed tool outputs then request a response',async()=>{
 const r=rig();await r.p.start();r.open();
 r.p.finishTask('a');done(r);r.p.steerAck('b');
 assert.deepEqual(r.sent.map(e=>e.item?.output??e.type),['Background agent finished. Use the preceding [BACKEND] messages as the result.','response.create','This was sent to steer the previous background agent task.','response.create']);
 await r.p.stop();
});

test('tool calls: background_agent carries the prompt; remain_silent gets an empty result and no response',async()=>{
 const r=rig();await r.p.start();r.open();
 r.feed({type:'response.created'});
 r.feed({type:'response.function_call_arguments.done',call_id:'s1',name:'remain_silent',arguments:'{}'});
 r.feed({type:'response.function_call_arguments.done',call_id:'b1',name:'background_agent',arguments:'{"prompt":"fix it"}'});
 done(r);
 assert.deepEqual(r.events.filter(e=>e.type==='tool_call').map(e=>[e.name,e.args]),[['remain_silent',{}],['background_agent',{prompt:'fix it'}]]);
 r.p.sendToolResult('s1','',{respond:false});
 assert.deepEqual(r.sent.at(-1),{type:'conversation.item.create',item:{type:'function_call_output',call_id:'s1',output:''}});
 assert.equal(ofType(r,'response.create').length,0);
 assert.equal(r.states().at(-1),'working'); // b1 still pending
 // an old tool name is not valid any more
 r.feed({type:'response.function_call_arguments.done',call_id:'o1',name:'run_task',arguments:'{"prompt":"x"}'});
 assert.equal(r.events.filter(e=>e.type==='tool_call').length,2);
 await r.p.stop();
});

test('barge-in sends truncate with the milliseconds played, shows heard for 400 ms, then listening',async()=>{
 const r=rig();await r.p.start();r.open();
 r.feed({type:'response.created'});
 r.feed({type:'response.output_audio_transcript.delta',item_id:'item_9',delta:'Working on it'});
 r.feed({type:'output_audio_buffer.started'});
 r.advance(700);
 r.feed({type:'input_audio_buffer.speech_started'});
 assert.deepEqual(r.sent,[{type:'response.cancel'},{type:'output_audio_buffer.clear'},{type:'conversation.item.truncate',item_id:'item_9',content_index:0,audio_end_ms:700}]);
 assert.deepEqual(r.events.find(e=>e.type==='agent_final'),{type:'agent_final',text:'Working on it',interrupted:true,heard:'Working on it'});
 assert.equal(r.states().at(-1),'heard');
 r.advance(399);assert.equal(r.states().at(-1),'heard');
 r.advance(1);assert.equal(r.states().at(-1),'listening');
 await r.p.stop();
});

test('speaking is held for 500 ms after the last output audio and cancelled by new speech',async()=>{
 const r=rig();await r.p.start();r.open();
 r.feed({type:'response.created'});r.feed({type:'response.output_audio_transcript.delta',delta:'Hi'});
 r.feed({type:'output_audio_buffer.started'});done(r);r.feed({type:'output_audio_buffer.stopped'});
 r.advance(499);assert.equal(r.states().at(-1),'speaking');
 r.advance(1);assert.equal(r.states().at(-1),'listening');
 // a second answer starting inside the hold keeps speaking
 r.feed({type:'response.created'});r.feed({type:'response.output_audio_transcript.delta',delta:'Again'});
 r.feed({type:'output_audio_buffer.started'});done(r);r.feed({type:'output_audio_buffer.stopped'});
 r.advance(300);
 r.feed({type:'input_audio_buffer.speech_started'}); // not playing any more: plain hearing, no cancel
 assert.equal(r.states().at(-1),'hearing');assert.equal(ofType(r,'response.cancel').length,0);
 r.advance(1000);assert.equal(r.states().at(-1),'hearing');
 await r.p.stop();
});

test('suppressSpeech stops playback at once and discards the rest of the answer',async()=>{
 const r=rig();await r.p.start();r.open();
 r.feed({type:'response.created'});r.feed({type:'response.output_audio_transcript.delta',delta:'Long answer'});
 r.feed({type:'output_audio_buffer.started'});
 r.p.suppressSpeech();
 assert.deepEqual(r.sent.map(e=>e.type),['response.cancel','output_audio_buffer.clear']);
 assert.equal(r.states().at(-1),'listening');
 r.feed({type:'response.output_audio_transcript.delta',delta:' more'}); // late delta dropped
 assert.equal(r.events.filter(e=>e.type==='agent_partial').length,1);
 await r.p.stop();
});

test('level events carry input and output about every 100 ms',async()=>{
 const r=rig();await r.p.start();r.open();
 r.advance(1000);
 const levels=r.events.filter(e=>e.type==='level');
 assert.ok(levels.length>=10&&levels.length<=12,String(levels.length));
 assert.ok(levels.every(l=>l.input>0&&l.output>0));
 await r.p.stop();
});

test('attempt numbering: a late result of an older start is ignored after stop or a newer start',async()=>{
 const mints=[];let media=0;
 const r=rig({mintSession:()=>new Promise(res=>mints.push(res)),getUserMedia:async()=>{media++;return {getTracks:()=>[],getAudioTracks:()=>[]};}});
 const first=r.p.start();
 await r.p.stop();
 mints[0]({clientSecret:'a'});await first;
 assert.equal(media,0);assert.equal(r.fetchCalls.length,0);
 assert.equal(r.events.filter(e=>e.type==='ended').length,1);
 const second=r.p.start(),third=r.p.start();
 mints[1]({clientSecret:'b'});mints[2]({clientSecret:'c'});await Promise.all([second,third]);
 assert.equal(media,1);assert.equal(r.fetchCalls.length,1);assert.equal(r.fetchCalls[0].i.headers.Authorization,'Bearer c');
 await r.p.stop();
});

test('a startup timeout retries once with a notice, then fails',async()=>{
 const r=rig();await r.p.start();
 r.advance(10000);
 assert.deepEqual(r.events.filter(e=>e.type==='notice'),[{type:'notice',text:'Voice connection timed out. Retrying once after cleanup.'}]);
 await new Promise(x=>setTimeout(x,0));
 assert.equal(r.pcs.length,2);assert.equal(r.pcs[0].closed,true);
 r.open();assert.equal(r.states().at(-1),'listening');
 await r.p.stop();
 // second timeout: error and ended with reason error
 const q=rig();await q.p.start();q.advance(10000);await new Promise(x=>setTimeout(x,0));q.advance(10000);await new Promise(x=>setTimeout(x,0));
 assert.equal(q.events.filter(e=>e.type==='notice').length,1);
 assert.ok(q.events.some(e=>e.type==='error'));
 assert.deepEqual(q.events.filter(e=>e.type==='ended'),[{type:'ended',reason:'error'}]);
});

test('a close during startup retries once with its own notice',async()=>{
 const r=rig();await r.p.start();
 r.dc.onclose();
 assert.deepEqual(r.events.filter(e=>e.type==='notice').map(e=>e.text),['Voice connection closed during startup. Retrying once.']);
 await new Promise(x=>setTimeout(x,0));
 assert.equal(r.pcs.length,2);
 r.open();
 await r.p.stop();
});

test('ended reasons: requested, transport_closed, error',async()=>{
 const a=rig();await a.p.start();a.open();await a.p.stop();
 assert.deepEqual(a.events.find(e=>e.type==='ended'),{type:'ended',reason:'requested'});
 const b=rig();await b.p.start();b.open();b.dc.onclose();await new Promise(x=>setTimeout(x,0));
 assert.deepEqual(b.events.filter(e=>e.type==='ended'),[{type:'ended',reason:'transport_closed'}]);
 const c=rig();await c.p.start();c.open();c.feed({type:'error',error:{message:'boom',code:'x'}});await new Promise(x=>setTimeout(x,0));
 assert.deepEqual(c.events.filter(e=>e.type==='ended'),[{type:'ended',reason:'error'}]);
});

test('mute survives a startup retry',async()=>{
 const r=rig();await r.p.start();
 r.p.setMuted(true);
 r.advance(10000);await new Promise(x=>setTimeout(x,0));
 assert.equal(r.track.enabled,false);
 r.open();
 assert.equal(r.states().at(-1),'muted');
 await r.p.stop();
});

test('offer is sent after ICE gathering, with candidates',async()=>{
 const r=rig();const P=r.pc;// first start with the plain fake to get a class-free rig, then a gathering fake
 const g=rig({RTCPeerConnectionImpl:class{constructor(){this.iceGatheringState='gathering';this.localDescription={sdp:'OFFER'};this.l=[];g.pc2=this;}
  addTrack(){} addEventListener(n,f){this.l.push(f);} createDataChannel(){return {readyState:'open',close(){}};}
  async createOffer(){return {type:'offer',sdp:'OFFER'};} async setLocalDescription(){setTimeout(()=>{this.localDescription={sdp:'OFFER a=candidate:1'};this.iceGatheringState='complete';this.l.forEach(f=>f());},5);}
  async setRemoteDescription(){} close(){}}});
 await g.p.start();
 assert.match(g.fetchCalls[0].i.body,/a=candidate/);
});
