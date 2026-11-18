import fs from 'node:fs';
import {execFile} from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
import {createFlow} from './flow-ipc.mjs';
import {createComputer} from './computer-ipc.mjs';
import {createBackend} from '../../../packages/backend/src/app/backend.mjs';
import {createIpcBridge} from '../../../packages/backend/src/app/ipc.mjs';
import {createClaudeMapper} from '../../../packages/backend/src/tui/claude.mjs';
import {createSubagentTracker} from '../../../packages/backend/src/tui/subagents.mjs';
import {createCodexMapper,controls as codexControls} from '../../../packages/backend/src/tui/codex.mjs';
import * as screenparts from '../../../packages/backend/src/tui/screenparts.mjs';
import * as commands from '../../../packages/backend/src/tui/commands.mjs';
import {createUsageMeter,format as formatUsage} from '../../../packages/backend/src/tui/usage.mjs';

const LABELS={claude:'Claude Code',codex:'Codex',fake:'Fake agent',fakeclaude:'Fake Claude',simclaude:'Sim Claude'};
const AGENT_BY_SOURCE={'claude-code':'claude',codex:'codex'};
const q=v=>typeof v==='string'?v.slice(0,200):''; // search text is clamped, not rejected: a huge paste must search, not fall back to the unfiltered list
const str=v=>typeof v==='string'&&v.length>0&&v.length<4096;
const onPath=bin=>(process.env.PATH||'').split(path.delimiter).some(dir=>{try{fs.accessSync(path.join(dir,bin),fs.constants.X_OK);return true;}catch{return false;}});

// One backend per app. The test agent exists only when SUFFICE_TEST_AGENT names a script.
export function createSessionsIpc({dataDir,env=process.env,send}){
 const testAgent=env.SUFFICE_TEST_AGENT;
 const sessionAgents={};
 if(testAgent){
  const transcript=path.join(dataDir,'fake-transcript.jsonl');fs.mkdirSync(dataDir,{recursive:true});fs.writeFileSync(transcript,'');
  sessionAgents.fake={bin:env.SUFFICE_TEST_NODE||'node',startArgs:()=>[testAgent,transcript],resumeArgs:()=>[testAgent,transcript],locateTranscript:()=>transcript,listHistory:()=>[],
   parseLine:o=>[{id:`${o.k}:${o.t}`,role:o.k==='u'?'user':'assistant',text:o.t,ts:Date.now()}]};
 }
 const claudeAgent=env.SUFFICE_TEST_CLAUDE_AGENT;
 if(claudeAgent){
  const transcript=path.join(dataDir,'fakeclaude-transcript.jsonl');fs.mkdirSync(dataDir,{recursive:true});fs.writeFileSync(transcript,'');
  sessionAgents.fakeclaude={bin:env.SUFFICE_TEST_NODE||'node',startArgs:()=>[claudeAgent,transcript],resumeArgs:()=>[claudeAgent,transcript],locateTranscript:()=>transcript,listHistory:()=>[],parseLine:()=>[]};
 }
 // Test-only: one tui-sim scenario per session. The scenario comes from <dataDir>/sim-run.json at spawn, each session gets its own transcript.
 const simAgent=env.SUFFICE_TEST_SIM_AGENT;
 if(simAgent){
  fs.mkdirSync(dataDir,{recursive:true});
  const run=()=>{try{return JSON.parse(fs.readFileSync(path.join(dataDir,'sim-run.json'),'utf8'));}catch{return {};}};
  const tf=sessionId=>path.join(dataDir,`sim-${sessionId}.jsonl`),args=({sessionId})=>{const r=run();return [simAgent,'--scenario',r.scenario||'status-idle','--speed',String(r.speed||1),'--seed',String(r.seed||1),'--session-id',sessionId,tf(sessionId)];};
  sessionAgents.simclaude={bin:env.SUFFICE_TEST_NODE||'node',newSessionId:()=>'sim'+Math.random().toString(36).slice(2,10),startArgs:args,resumeArgs:args,locateTranscript:({sessionId})=>{const f=tf(sessionId);fs.writeFileSync(f,'',{flag:'a'});return f;},listHistory:()=>[],parseLine:()=>[]};
 }
 // Test mode never reads the real history: an explicit SUFFICE_HISTORY_HOME wins, else a fresh empty dir.
 const historyHome=env.SUFFICE_HISTORY_HOME||(env.SUFFICE_TEST_HIDE_WINDOW==='1'?fs.mkdtempSync(path.join(os.tmpdir(),'sfx-history-')):process.env.HOME);
 const socket=env.SUFFICE_SESSIONS_SOCKET||'suffice';
 let lastScan=0;
 const flow=createFlow({dataDir,env,send});
 const computer=createComputer({dataDir,env,send});
 const backend=createBackend({dataDir,sessions:true,history:true,socketName:socket,home:historyHome,sessionAgents,exec:flow.exec,approve:flow.approve,runners:flow.runners,limits:flow.limits,...((testAgent||simAgent)&&{idleMs:400,settleMs:100})});
 flow.attach(backend);computer.attach(backend);
 const bridge=createIpcBridge(backend);
 bridge.subscribe(send);
 const call=async message=>{const r=await bridge.handle(message);if(!r.ok)throw new Error(r.error);return r.result;};
 const ready=call({type:'slots.subscribe',selector:'session:'}).catch(()=>{});
 // A dead pane (stopped or exited session) reads as one plain message, not tmux text; other errors pass through.
 const ended=e=>{throw /can't find pane|can't find session|no server running/.test(e?.message||'')?new Error('Session ended'):e;};
 const agentName=v=>{if(!str(v)||!/^[a-z]+$/.test(v))throw new Error('Invalid agent');return v;};
 const folder=v=>{if(!str(v)||!path.isAbsolute(v))throw new Error('Invalid folder');return v;};
 const id=v=>{if(!str(v)||!/^[A-Za-z0-9._-]+$/.test(v))throw new Error('Invalid session');return v;};
 // Rich feed: transcript lines -> mapper items (replace by id, keep order); screen -> prompt dialog. Pushed as one 'ui' slot per session.
 const tracked=new Map();
 const slot=id=>`session:${id}:ui`;
 function track(row){
  const sid=row?.id;if(!sid||tracked.has(sid))return;
  const kind=row.agent==='codex'?'codex':row.agent==='claude'||row.agent==='fakeclaude'||row.agent==='simclaude'?'claude':null;if(!kind)return;
  const mapper=kind==='codex'?createCodexMapper():createClaudeMapper();
  const t={kind,mapper,state:mapper.newState?.()??{},order:[],byId:new Map(),prompt:null,ready:false,status:null,screenMeta:{},meter:createUsageMeter(),unsubs:[],timer:null,last:0,dirty:false,pending:null};
  tracked.set(sid,t);
  const publish=()=>{t.dirty=false;const meta={...(mapper.meta?.(t.state)||{}),...t.screenMeta};
   for(const i of [...t.order].reverse()){const am=/Set model to `([^`]+)`/.exec(t.byId.get(i)?.text||'')?.[1];if(am){meta.model=am;break;}} // the CLI's own ack; transcripts name the model only after a turn
   let usage;try{t.meter.setMeta(meta);const sn=t.meter.snapshot();if(sn.turns)usage={lines:formatUsage(sn),inputTokens:sn.inputTokens,outputTokens:sn.outputTokens};}catch{}
   send({type:'slot',id:slot(sid),value:{items:t.order.map(i=>t.byId.get(i)),prompt:t.prompt,status:t.status,ready:t.ready,meta:{...meta,...(usage&&{usage})}}});};
  const soon=()=>{if(!t.dirty){t.dirty=true;setTimeout(publish,30).unref?.();}};t.soon=soon;
  const reset=()=>{t.state=mapper.newState?.()??{};t.meter=createUsageMeter();t.order=[];t.byId=new Map();soon();};
  const onLine=line=>{let o;try{o=JSON.parse(line);}catch{return;}
   let items;try{items=mapper.mapLine(o,t.state)||[];}catch{return;}
   for(const it of items){if(!t.byId.has(it.id))t.order.push(it.id);t.byId.set(it.id,it);t.meter.add(it);}
   if(items.length)soon();};
  t.unsubs.push(backend.sessions.rawLines(sid,onLine,reset));
  const check=async()=>{ // throttled to one parse per 300 ms, trailing run via a single timer
   const wait=300-(Date.now()-t.last);
   if(wait>0){if(!t.timer){t.timer=setTimeout(()=>{t.timer=null;void check();},wait);t.timer.unref?.();}return;}
   t.last=Date.now();
   try{const {text}=await backend.sessions.screen(sid);
    const p=mapper.parsePrompt(text)||null,st=mapper.parseStatus?.(text)||null;
    const v=/Claude Code v(\d[\w.]*)/.exec(text)?.[1],e=/with (\w+) effort/.exec(text)?.[1];
    const sp=(f,...a)=>{try{return screenparts[f]?.(...a)||null;}catch{return null;}};
    const mode=sp('parseModeLine',text),draft=sp('parseInputDraft',text),bg=sp('parseBackgroundTasks',text);
    const sm={...t.screenMeta,...(v&&{version:v}),...(e&&{effort:e}),...(mode?.mode&&{mode:mode.mode}),
     queued:sp('parseQueued',text)?.messages||null,draft:draft?.text||null,backgroundTasks:bg?.count??null,contextWarning:sp('parseContextWarning',text),picker:p?null:sp('parsePicker',text)};
    const changed=JSON.stringify(p)!==JSON.stringify(t.prompt)||JSON.stringify(sm)!==JSON.stringify(t.screenMeta)||JSON.stringify(st)!==JSON.stringify(t.status);
    const rdy=!p&&!!(mode||draft||/^[\w ]{0,12}[❯›>]\s*$/m.test(text)); // main input box on screen: mode line, draft, or bare prompt marker
    const rc=rdy!==t.ready;t.prompt=p;t.status=st;t.screenMeta=sm;t.ready=rdy;if(changed||rc)soon();}catch{}
  };
  Promise.resolve(backend.sessions.stream(sid,()=>void check())).then(u=>{if(tracked.get(sid)===t)t.unsubs.push(u);else u();}).catch(()=>{});
  void check();soon();
 }
 const untrack=sid=>{const t=tracked.get(sid);if(!t)return;tracked.delete(sid);clearTimeout(t.timer);for(const u of t.unsubs)try{u();}catch{}};
 // Subagent feed: child transcripts live beside the parent transcript; attached once its path is known (list rows carry it lazily).
 const subTracker=createSubagentTracker({fs});
 const attachSubs=row=>{const t=tracked.get(row?.id);if(!t||t.kind!=='claude'||t.subs)return;
  const p=row.agent==='fakeclaude'?path.join(dataDir,'fakeclaude-transcript.jsonl'):row.transcriptPath;if(!p)return;
  t.subs=true;t.unsubs.push(subTracker.attach(p,list=>send({type:'slot',id:`session:${row.id}:subagents`,value:list})));};
 const trackAll=rows=>{for(const r of rows||[]){track(r);attachSubs(r);}return rows;};
 // Read-only view of the CLI's saved defaults. The app never writes this file.
 const defaultsOf=()=>{try{const s=JSON.parse(fs.readFileSync(path.join(historyHome||'','.claude','settings.json'),'utf8'));return {model:s.model??null,effortLevel:s.effortLevel??null,modelSettings:s.modelSettings??null};}catch{return null;}};
 // Resolves with pred(screenText) the first time it is truthy after a screen event, or null after ms.
 const waitScreen=(sid,pred,ms)=>new Promise(resolve=>{let done=false,unsub=null,timer=null;
  const fin=v=>{if(done)return;done=true;clearTimeout(timer);unsub?.();resolve(v||null);};
  const test=async()=>{if(done)return;try{const {text}=await backend.sessions.screen(sid);const v=pred(text);if(v)fin(v);}catch{}};
  timer=setTimeout(()=>fin(null),ms);
  Promise.resolve(backend.sessions.stream(sid,()=>void test())).then(u=>{if(done)u();else unsub=u;}).catch(()=>{});void test();});
 const KEYS={up:'\x1b[A',down:'\x1b[B',enter:'\r',esc:'\x1b'};
 // Runs a commands.mjs plan. Claude never gets `/model <alias>` (it saves a default); any failure presses Esc and throws.
 const runPlan=async(sid,t,plan)=>{
  const tx=s=>backend.sessions.send(sid,s,{enter:false});
  const bail=async msg=>{await tx(KEYS.esc).catch(()=>{});throw new Error(msg);};
  let pk=null,want=null;const ackRe=/Set model to .*/g,seen=new Set((await backend.sessions.screen(sid).catch(()=>({text:''}))).text.match(ackRe)||[]); // ignore acks already on screen
  for(const st of plan.steps){
   if(st.send!==undefined)await tx(st.send+(st.enter?'\r':''));
   else if(st.waitPicker){pk=await waitScreen(sid,x=>{const p=screenparts.parsePicker(x);return p&&/model/i.test(p.title||'')?p:null;},5000);if(!pk)await bail('Model picker did not open');}
   else if(st.selectLabelMatching){const n=commands.pressesToRow(pk.options,pk.selected,new RegExp(st.selectLabelMatching,'i'));
    if(n===null)await bail('That model is not in the picker');
    want=pk.options[pk.options.findIndex(o=>o.index===pk.selected)+n].index;
    if(n)await tx((n>0?KEYS.down:KEYS.up).repeat(Math.abs(n)));
    if(!await waitScreen(sid,x=>screenparts.parsePicker(x)?.selected===want,3000))await bail('Could not move to the model row');}
   else if(st.key){await tx(st.key);}
  }
  if(plan.agent!=='claude')return null;
  const line=await waitScreen(sid,x=>!screenparts.parsePicker(x)&&(x.match(ackRe)||[]).find(l=>!seen.has(l)),5000);
  if(!line)throw new Error('No confirmation from the terminal');
  if(/saved as your default/i.test(line))throw new Error('Default model was changed by the agent CLI');
  return line;
 };
 const control=async(sid,action,args={})=>{
  const t=tracked.get(sid);if(!t)throw new Error('Unknown session');
  const run=out=>(out instanceof Uint8Array?backend.sessions.sendBytes(sid,out):backend.sessions.send(sid,String(out),{enter:false})).catch(ended);
  if(action==='answerPrompt'){if(!t.prompt)throw new Error('No prompt open');const i=Number(args.index);
   return run(t.kind==='codex'?codexControls.answerPrompt(i):(t.mapper.controls.answerPrompt(t.prompt,i).bytes));}
  if(action==='answerMulti'){if(!t.prompt?.multiSelect||t.kind==='codex')throw new Error('No multi-select open');return run(t.mapper.controls.answerMulti(t.prompt,(Array.isArray(args.indices)?args.indices:[]).map(Number)).bytes);}
  if(action==='interrupt')return run(t.kind==='codex'?codexControls.interrupt():t.mapper.controls.interrupt().bytes);
  if(action==='slash'&&typeof args.command==='string')return run(t.kind==='codex'?codexControls.slash(args.command):t.mapper.controls.slash(args.command).bytes);
  const agent=t.kind;
  if(action==='setModel'&&str(args.id)){
   const plan=commands.modelControl(agent,args.id),before=agent==='claude'?defaultsOf():null;
   let confirmation=null,err=null;try{confirmation=await runPlan(sid,t,plan);}catch(e){err=e;}
   const after=agent==='claude'?defaultsOf():null,changed=!!before&&!!after&&JSON.stringify(before)!==JSON.stringify(after);
   if(changed){const it={id:`app:default-changed:${Date.now()}`,ts:Date.now(),kind:'notice',level:'error',code:'error',text:'Default model was changed by the agent CLI'};t.order.push(it.id);t.byId.set(it.id,it);t.dirty=false;send({type:'slot',id:slot(sid),value:{items:t.order.map(i=>t.byId.get(i)),prompt:t.prompt,status:t.status,meta:t.screenMeta}});}
   if(err)throw err;
   return {savesDefault:plan.savesDefault,confirmation,settings:{changed,before,after}};}
  // Typed `/effort <level>` and Enter in the slider both save effortLevel as the default (model-config.md); the session-only slider path is unprobed.
  if(action==='setEffort'&&agent==='claude')throw new Error('Effort changes save as your default: use the terminal');
  if(action==='setMode'){const o=commands.modeControl(agent,String(args.from),String(args.to));return o?run(o):undefined;}
  if(action==='compact')return run(agent==='codex'?codexControls.slash('/compact'):t.mapper.controls.compact().bytes);
  if(action==='keys'&&Array.isArray(args.keys)){const K={up:'\x1b[A',down:'\x1b[B',enter:'\r',esc:'\x1b'};return run(args.keys.map(k=>K[k]||'').join(''));}
  throw new Error('Unsupported control');
 };
 return {
  socket,
  async attach(sessionId){const rows=await call({type:'sessions.list'});const row=rows.find(r=>r.id===sessionId);if(!row)throw new Error('Unknown session');return {command:['tmux','-L',socket,'-f','/dev/null','set-option','-t','sfx-'+row.id,'mouse','on',';','attach','-t','sfx-'+row.id],cwd:row.cwd};},
  handlers:{
   ...flow.handlers,
   ...computer.handlers,
   'sessions-available':()=>{
    const caps=backend.capabilities().sessions;
    if(!caps?.ok)return {ok:false,reason:caps?.reason==='tmux not found'?'Needs tmux':caps?.reason||'Unavailable',agents:[]};
    return {ok:true,agents:['claude','codex',...Object.keys(sessionAgents)].map(a=>({id:a,label:LABELS[a]||a,missing:!(sessionAgents[a]||onPath(a))}))};
   },
   'sessions-catalog':p=>{const t=tracked.get(id(p));if(!t)throw new Error('Unknown session');const a=t.kind;
    let cmds=[];try{cmds=commands.slashCommands(a,{home:historyHome,cwd:t.state?.cwd});}catch{}
    return {agent:a,commands:cmds,savesDefault:{model:a==='codex',effort:a==='claude'},models:commands.models(a),modes:commands.modes(a),efforts:commands.efforts(a)};},
   'sessions-start':async p=>{await ready;const args=Array.isArray(p?.args)&&p.args.every(str)?p.args:undefined;const r=await call({type:'sessions.start',agent:agentName(p?.agent),cwd:folder(p?.cwd),...(args&&{args})});track(r);attachSubs(r);return r;},
   'sessions-list':async p=>{await ready;const rows=trackAll(await call({type:'sessions.list'}));if(p?.republish)for(const r of rows||[])tracked.get(r.id)?.soon?.();return rows;}, // a reloaded renderer has no cached slots; republish once so titles seed
   'sessions-control':p=>control(id(p?.id),String(p?.action),p?.args),
   'sessions-stop':p=>{untrack(id(p));return call({type:'sessions.stop',id:id(p)});},
   'sessions-send':p=>call({type:'sessions.send',id:id(p?.id),text:typeof p?.text==='string'?p.text:''}).catch(ended),
   'sessions-attach-command':p=>call({type:'sessions.attachCommand',id:id(p)}),
   // Opens the session's tmux attach in Terminal.app; hidden test runs only report the command.
   'sessions-attach-terminal':async p=>{const command=await call({type:'sessions.attachCommand',id:id(p)});if(process.env.SUFFICE_TEST_HIDE_WINDOW==='1')return {command,opened:false};await new Promise((ok,no)=>execFile('osascript',['-e','tell application "Terminal" to do script "'+command.replace(/[\\"]/g,'\\$&')+'"'],e=>e?no(e):ok()));return {command,opened:true};},
   'history-list':async p=>{await call({type:'history.scan'});return call({type:'history.list',opts:{limit:200,...(q(p?.query)&&{query:q(p.query)})}});},
   'history-search':async p=>{if(Date.now()-lastScan>30000){lastScan=Date.now();await call({type:'history.scan'});}return call({type:'history.find',query:q(p?.query),opts:{limit:50}});},
   'history-read':p=>call({type:'history.read',entry:{source:String(p?.source),path:String(p?.path)}}),
   'sessions-resume':async p=>{const agent=AGENT_BY_SOURCE[p?.source];if(!agent||!str(p?.sessionId)||!str(p?.cwd))throw new Error('Cannot resume this chat');await ready;const r=await call({type:'sessions.resume',agent,cwd:folder(p.cwd),sessionId:p.sessionId});track(r);attachSubs(r);return r;},
  },
  dispose:()=>{for(const k of [...tracked.keys()])untrack(k);return backend.dispose();},
 };
}
