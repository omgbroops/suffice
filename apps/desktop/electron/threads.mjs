import {transcriptMessages} from './transcript-messages.mjs';
import {readChatChanges} from './chat-changes.mjs';
import {readTranscriptJournal} from './transcript-journal.mjs';
import {hostname} from 'node:os';
import {projectMetadata,sessionMetadata} from './sidebar-metadata.mjs';
import {readdir,realpath,readFile,stat} from 'node:fs/promises';
import {resolve,sep,basename} from 'node:path';
import {createHash} from 'node:crypto';
import {SessionManager,buildSessionProjection} from '@earendil-works/pi-coding-agent';
import {savedUsage} from './usage.mjs';

export const threadId=path=>createHash('sha256').update(process.platform==='win32'?resolve(path).toLowerCase():resolve(path)).digest('hex').slice(0,32);
export function createThreadStore(home){
 const root=resolve(home,'sessions');let known=new Map();const transcripts=new Map();
 async function list(){
  let directories=[];try{directories=await readdir(root,{withFileTypes:true});}catch(error){if(error.code!=='ENOENT')throw error;}
  const groups=await Promise.all(directories.filter(entry=>entry.isDirectory()).map(entry=>SessionManager.listAll(resolve(root,entry.name))));
  const infos=groups.flat().filter(info=>info.messageCount>0).sort((a,b)=>+b.modified-+a.modified);
  known=new Map(infos.map(info=>[threadId(info.path),info]));
  return Promise.all(infos.map(async info=>({id:threadId(info.path),title:info.name||info.firstMessage?.slice(0,90)||'Untitled thread',project:info.cwd?basename(info.cwd):null,cwd:info.cwd,machine:hostname(),modified:+info.modified,...await projectMetadata(info.cwd),...await sessionMetadata(info.path),diff:await readChatChanges(home,threadId(info.path))})));
 }
 async function open(id,resolveModel=()=>undefined){
  if(typeof id!=='string'||!known.has(id))throw new Error('Thread not found. Refresh the thread list.');
  const info=known.get(id),path=await realpath(info.path),base=await realpath(root);
  if(!path.startsWith(base+sep))throw new Error('Thread path is outside the session directory');
  const infoStat=await stat(path),version=`${infoStat.mtimeMs}:${infoStat.size}`,cached=transcripts.get(path);if(cached?.version===version)return cached.value;
  const entries=readTranscriptJournal(await readFile(path,'utf8'));
  const messages=transcriptMessages(buildSessionProjection(entries.filter(entry=>entry.type!=='session')),entries);
  const lastAssistant=[...messages].reverse().find(message=>message.role==='assistant');
  const usage=savedUsage(entries,lastAssistant?resolveModel(lastAssistant.provider,lastAssistant.model):undefined);
  const value={id,title:info.name||info.firstMessage?.slice(0,90)||'Untitled thread',cwd:info.cwd,path,usage,messages:messages.map(message=>({role:message.role,timestamp:message.timestamp,provider:message.provider,model:message.model,turn:message.turn,displayText:message.displayText,attachments:message.attachments,kind:message.kind,automatic:message.automatic,toolName:message.toolName,toolCallId:message.toolCallId,isError:message.isError,content:typeof message.content==='string'?[{type:'text',text:message.content}]:(Array.isArray(message.content)?message.content:[{type:'text',text:message.output||JSON.stringify(message,null,2)}]).map(part=>part.type==='text'?{type:'text',text:part.text}:part.type==='thinking'?{type:'thinking',text:part.thinking}:part.type==='toolCall'?{type:'toolCall',id:part.id,name:part.name,text:JSON.stringify(part.arguments,null,2)}:part.type==='image'?{type:'image',data:part.data,mimeType:part.mimeType}:{type:part.type,text:`[${part.type}]`})}))};
  if(infoStat.size<=4*1024*1024){transcripts.delete(path);transcripts.set(path,{version,value});while(transcripts.size>12)transcripts.delete(transcripts.keys().next().value);}return value;
 }
 async function location(id){if(typeof id!=='string'||!known.has(id))throw new Error('Thread not found');const file=await realpath(known.get(id).path),base=await realpath(root);if(!file.startsWith(base+sep))throw new Error('Thread path is outside the session directory');return file;}
 return {list,open,location};
}
