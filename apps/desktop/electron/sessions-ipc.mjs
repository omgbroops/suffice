import fs from 'node:fs';
import path from 'node:path';
import {createBackend} from '../../../packages/backend/src/app/backend.mjs';
import {createIpcBridge} from '../../../packages/backend/src/app/ipc.mjs';

const LABELS={claude:'Claude Code',codex:'Codex',fake:'Fake agent'};
const AGENT_BY_SOURCE={'claude-code':'claude',codex:'codex'};
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
 const socket=env.SUFFICE_SESSIONS_SOCKET||'suffice';
 const backend=createBackend({dataDir,sessions:true,history:true,socketName:socket,home:env.SUFFICE_HISTORY_HOME||undefined,sessionAgents,...(testAgent&&{idleMs:400,settleMs:100})});
 const bridge=createIpcBridge(backend);
 bridge.subscribe(send);
 const call=async message=>{const r=await bridge.handle(message);if(!r.ok)throw new Error(r.error);return r.result;};
 const ready=call({type:'slots.subscribe',selector:'session:'}).catch(()=>{});
 const agentName=v=>{if(!str(v)||!/^[a-z]+$/.test(v))throw new Error('Invalid agent');return v;};
 const folder=v=>{if(!str(v)||!path.isAbsolute(v))throw new Error('Invalid folder');return v;};
 const id=v=>{if(!str(v)||!/^[A-Za-z0-9._-]+$/.test(v))throw new Error('Invalid session');return v;};
 return {
  socket,
  async attach(sessionId){const rows=await call({type:'sessions.list'});const row=rows.find(r=>r.id===sessionId);if(!row)throw new Error('Unknown session');return {command:['tmux','-L',socket,'-f','/dev/null','attach','-t','sfx-'+row.id],cwd:row.cwd};},
  handlers:{
   'sessions-available':()=>{
    const caps=backend.capabilities().sessions;
    if(!caps?.ok)return {ok:false,reason:caps?.reason==='tmux not found'?'Needs tmux':caps?.reason||'Unavailable',agents:[]};
    return {ok:true,agents:['claude','codex',...Object.keys(sessionAgents)].map(a=>({id:a,label:LABELS[a]||a,missing:!(sessionAgents[a]||onPath(a))}))};
   },
   'sessions-start':async p=>(await ready,call({type:'sessions.start',agent:agentName(p?.agent),cwd:folder(p?.cwd)})),
   'sessions-list':async()=>{await ready;return call({type:'sessions.list'});},
   'sessions-stop':p=>call({type:'sessions.stop',id:id(p)}),
   'sessions-send':p=>call({type:'sessions.send',id:id(p?.id),text:typeof p?.text==='string'?p.text:''}),
   'sessions-attach-command':p=>call({type:'sessions.attachCommand',id:id(p)}),
   'history-list':async p=>{await call({type:'history.scan'});return call({type:'history.list',opts:{limit:200,...(str(p?.query)&&{query:p.query})}});},
   'history-read':p=>call({type:'history.read',entry:{source:String(p?.source),path:String(p?.path)}}),
   'sessions-resume':async p=>{const agent=AGENT_BY_SOURCE[p?.source];if(!agent||!str(p?.sessionId)||!str(p?.cwd))throw new Error('Cannot resume this chat');await ready;return call({type:'sessions.resume',agent,cwd:folder(p.cwd),sessionId:p.sessionId});},
  },
  dispose:()=>backend.dispose(),
 };
}
