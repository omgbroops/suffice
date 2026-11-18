import {readdir,readFile,stat} from 'node:fs/promises';
import {resolve} from 'node:path';
import {readTranscriptJournal} from './transcript-journal.mjs';
import {threadId} from './threads.mjs';

const num=value=>Number.isFinite(value)?value:0;
const empty=()=>({input:0,output:0,cacheRead:0,cacheWrite:0,cost:0,turns:0});
const add=(bucket,usage)=>{bucket.input+=num(usage.input);bucket.output+=num(usage.output);bucket.cacheRead+=num(usage.cacheRead);bucket.cacheWrite+=num(usage.cacheWrite);bucket.cost+=num(usage.cost?.total);};
// Share of prompt-side tokens served from cache; null when nothing was sent.
const finish=bucket=>{const prompt=bucket.input+bucket.cacheRead+bucket.cacheWrite;return {...bucket,tokens:prompt+bucket.output,cacheHit:prompt?bucket.cacheRead/prompt:null};};
const dayOf=time=>{const d=new Date(time);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;};
const text=content=>typeof content==='string'?content:Array.isArray(content)?content.filter(part=>part?.type==='text').map(part=>part.text).join(' '):'';

// sessions: [{id,entries}] of saved Pi transcript entries. Pure: no I/O, no clock.
export function buildUsageReport(sessions){
 const days=new Map(),total=empty(),threads=[];
 for(const {id,entries} of sessions){
  const thread=empty();let title='',model=null,last=0;
  for(const entry of entries){
   const message=entry.type==='message'?entry.message:null;
   if(!title&&message?.role==='user')title=text(message.content).trim().slice(0,90);
   if(entry.type==='session_info'&&entry.name)title=entry.name;
   const usage=message?.usage??(['compaction','branch_summary'].includes(entry.type)?entry.usage:null);
   if(!usage)continue;
   const time=Date.parse(entry.timestamp)||num(message?.timestamp);if(!time)continue;
   const day=days.get(dayOf(time))??days.set(dayOf(time),empty()).get(dayOf(time));
   for(const bucket of [thread,day,total])add(bucket,usage);
   if(message?.role==='assistant'){for(const bucket of [thread,day,total])bucket.turns++;model=message.model??model;}
   last=Math.max(last,time);
  }
  if(thread.turns||thread.cost||thread.input)threads.push({id,title:title||'Untitled thread',model,lastAt:last,...finish(thread)});
 }
 return {
  total:finish(total),
  days:[...days].sort(([a],[b])=>a<b?-1:1).map(([day,bucket])=>({day,...finish(bucket)})),
  threads:threads.sort((a,b)=>b.cost-a.cost||b.tokens-a.tokens),
 };
}

const cache=new Map();
export async function readUsageReport(home){
 const root=resolve(home,'sessions'),sessions=[];let groups=[];
 try{groups=await readdir(root,{withFileTypes:true});}catch(error){if(error.code!=='ENOENT')throw error;}
 for(const group of groups.filter(entry=>entry.isDirectory()))for(const name of await readdir(resolve(root,group.name))){
  if(!name.endsWith('.jsonl'))continue;
  const path=resolve(root,group.name,name),info=await stat(path),version=`${info.mtimeMs}:${info.size}`;let hit=cache.get(path);
  if(hit?.version!==version){hit={version,entries:readTranscriptJournal(await readFile(path,'utf8'))};cache.set(path,hit);}
  sessions.push({id:threadId(path),entries:hit.entries});
 }
 return buildUsageReport(sessions);
}
