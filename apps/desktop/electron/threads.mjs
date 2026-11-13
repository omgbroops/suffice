import {readdir,realpath,readFile,open as openFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {resolve,sep,basename} from 'node:path';
import {createHash} from 'node:crypto';
import {SessionManager,buildSessionProjection} from '@earendil-works/pi-coding-agent';
import {savedUsage} from './usage.mjs';

const require=createRequire(import.meta.url);
const {git}=require('./git.cjs'),store=require('./json-store.cjs');

export const threadId=path=>createHash('sha256').update(process.platform==='win32'?resolve(path).toLowerCase():resolve(path)).digest('hex').slice(0,32);
// Last model a thread used, from the end of its session file.
// shortcut: reads the last 64 KB only; a thread whose last model entry is further back shows no model.
async function lastModel(path){
 let file;try{file=await openFile(path,'r');const {size}=await file.stat(),length=Math.min(size,65536),buffer=Buffer.alloc(length);await file.read(buffer,0,length,size-length);
  for(const line of buffer.toString('utf8').split('\n').reverse()){let entry;try{entry=JSON.parse(line);}catch{continue;}
   if(entry.type==='message'&&entry.message?.role==='assistant'&&entry.message.model)return entry.message.model;
   if(entry.type==='model_change'&&entry.modelId)return entry.modelId;}
 }catch{}finally{await file?.close();}
 return null;
}
const gitBranch=cwd=>git(cwd,['rev-parse','--abbrev-ref','HEAD'],{timeout:5000}).then(out=>out||null,()=>null);

const part=p=>p.type==='text'?{type:'text',text:p.text}:p.type==='thinking'?{type:'thinking',text:p.thinking}:p.type==='toolCall'?{type:'toolCall',id:p.id,name:p.name,text:JSON.stringify(p.arguments,null,2)}:{type:p.type,text:`[${p.type}]`};
const content=message=>typeof message.content==='string'?[{type:'text',text:message.content}]:(Array.isArray(message.content)?message.content:[{type:'text',text:message.output||JSON.stringify(message,null,2)}]).map(part);
const projectMessage=message=>({role:message.role,toolName:message.toolName,toolCallId:message.toolCallId,isError:message.isError,errorMessage:message.stopReason==='error'?message.errorMessage:undefined,content:content(message)});
const title=info=>info.name||info.firstMessage?.slice(0,90)||'Untitled thread';

export function createThreadStore(home){
 const root=resolve(home,'sessions'),metaPath=resolve(home,'thread-meta.json');let known=new Map();
 // Branch each thread started on; sessions don't record it, so the desktop app notes it at start.
 // A corrupt file is moved to .bad by the store, so a later write cannot destroy it.
 const readMeta=()=>store.read(metaPath,{});
 let writing=Promise.resolve();
 // Callers do not await this: thread_started must not wait for git.
 function noteStart(sessionPath,cwd){
  writing=writing.then(async()=>{const id=threadId(sessionPath);if(readMeta()[id])return;const branch=await gitBranch(cwd);if(!branch||branch==='HEAD')return;const meta=readMeta();if(meta[id])return;meta[id]={branch};store.write(metaPath,meta);}).catch(()=>{});
  return writing;
 }
 // Re-read a session's tail only when the file changed.
 const models=new Map();
 const modelOf=async info=>{const hit=models.get(info.path);if(hit&&hit.modified===+info.modified)return hit.model;const model=await lastModel(info.path);models.set(info.path,{modified:+info.modified,model});return model;};
 async function list(){
  let directories=[];try{directories=await readdir(root,{withFileTypes:true});}catch(error){if(error.code!=='ENOENT')throw error;}
  const groups=await Promise.all(directories.filter(entry=>entry.isDirectory()).map(entry=>SessionManager.listAll(resolve(root,entry.name))));
  const infos=groups.flat().filter(info=>info.messageCount>0).sort((a,b)=>+b.modified-+a.modified);
  known=new Map(infos.map(info=>[threadId(info.path),info]));
  const meta=readMeta(),lastModels=await Promise.all(infos.map(modelOf));
  return infos.map((info,i)=>{const id=threadId(info.path);return {id,title:title(info),project:basename(info.cwd||'Project'),cwd:info.cwd||null,modified:+info.modified,branch:meta[id]?.branch||null,model:lastModels[i]};});
 }
 async function open(id,resolveModel=()=>undefined){
  if(typeof id!=='string'||!known.has(id))throw new Error('Thread not found. Refresh the thread list.');
  const info=known.get(id),path=await realpath(info.path),base=await realpath(root);
  if(!path.startsWith(base+sep))throw new Error('Thread path is outside the session directory');
  const entries=(await readFile(path,'utf8')).split('\n').filter(Boolean).map(line=>JSON.parse(line));
  const messages=buildSessionProjection(entries.filter(entry=>entry.type!=='session')).messages;
  const lastAssistant=[...messages].reverse().find(message=>message.role==='assistant');
  const usage=savedUsage(entries,lastAssistant?resolveModel(lastAssistant.provider,lastAssistant.model):undefined);
  return {id,title:title(info),cwd:info.cwd,path,usage,messages:messages.map(projectMessage)};
 }
 return {list,open,noteStart};
}
