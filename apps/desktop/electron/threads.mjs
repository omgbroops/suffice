import {readdir,realpath,readFile} from 'node:fs/promises';
import {resolve,sep,basename} from 'node:path';
import {createHash} from 'node:crypto';
import {SessionManager,buildSessionProjection} from '@earendil-works/pi-coding-agent';
import {savedUsage} from './usage.mjs';

export const threadId=path=>createHash('sha256').update(process.platform==='win32'?resolve(path).toLowerCase():resolve(path)).digest('hex').slice(0,32);
export function createThreadStore(home){
 const root=resolve(home,'sessions');let known=new Map();
 async function list(){
  let directories=[];try{directories=await readdir(root,{withFileTypes:true});}catch(error){if(error.code!=='ENOENT')throw error;}
  const groups=await Promise.all(directories.filter(entry=>entry.isDirectory()).map(entry=>SessionManager.listAll(resolve(root,entry.name))));
  const infos=groups.flat().filter(info=>info.messageCount>0).sort((a,b)=>+b.modified-+a.modified);
  known=new Map(infos.map(info=>[threadId(info.path),info]));
  return infos.map(info=>({id:threadId(info.path),title:info.name||info.firstMessage?.slice(0,90)||'Untitled thread',project:basename(info.cwd||'Project'),modified:+info.modified}));
 }
 async function open(id,resolveModel=()=>undefined){
  if(typeof id!=='string'||!known.has(id))throw new Error('Thread not found. Refresh the thread list.');
  const info=known.get(id),path=await realpath(info.path),base=await realpath(root);
  if(!path.startsWith(base+sep))throw new Error('Thread path is outside the session directory');
  const entries=(await readFile(path,'utf8')).split('\n').filter(Boolean).map(line=>JSON.parse(line));
  const messages=buildSessionProjection(entries.filter(entry=>entry.type!=='session')).messages;
  const lastAssistant=[...messages].reverse().find(message=>message.role==='assistant');
  const usage=savedUsage(entries,lastAssistant?resolveModel(lastAssistant.provider,lastAssistant.model):undefined);
  return {id,title:info.name||info.firstMessage?.slice(0,90)||'Untitled thread',cwd:info.cwd,path,usage,messages:messages.map(message=>({role:message.role,toolName:message.toolName,toolCallId:message.toolCallId,isError:message.isError,content:typeof message.content==='string'?[{type:'text',text:message.content}]:(Array.isArray(message.content)?message.content:[{type:'text',text:message.output||JSON.stringify(message,null,2)}]).map(part=>part.type==='text'?{type:'text',text:part.text}:part.type==='thinking'?{type:'thinking',text:part.thinking}:part.type==='toolCall'?{type:'toolCall',id:part.id,name:part.name,text:JSON.stringify(part.arguments,null,2)}:{type:part.type,text:`[${part.type}]`})}))};
 }
 return {list,open};
}
