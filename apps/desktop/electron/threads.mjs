import {readdir,realpath,readFile,writeFile,open as openFile} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {resolve,sep,basename} from 'node:path';
import {createHash} from 'node:crypto';
import {SessionManager,buildSessionProjection} from '@earendil-works/pi-coding-agent';
import {savedUsage} from './usage.mjs';

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
const gitBranch=cwd=>new Promise(done=>execFile('git',['--no-optional-locks','-C',cwd,'rev-parse','--abbrev-ref','HEAD'],{timeout:5000,windowsHide:true},(error,out)=>done(error?null:out.trim()||null)));

export function createThreadStore(home){
 const root=resolve(home,'sessions'),metaPath=resolve(home,'thread-meta.json');let known=new Map();
 // Branch each thread started on; sessions don't record it, so the desktop app notes it at start.
 const readMeta=async()=>{try{return JSON.parse(await readFile(metaPath,'utf8'));}catch{return {};}};
 let writing=Promise.resolve();
 function noteStart(sessionPath,cwd){
  writing=writing.then(async()=>{const id=threadId(sessionPath),meta=await readMeta();if(meta[id])return;const branch=await gitBranch(cwd);if(!branch||branch==='HEAD')return;meta[id]={branch};await writeFile(metaPath,JSON.stringify(meta));}).catch(()=>{});
  return writing;
 }
 async function list(){
  let directories=[];try{directories=await readdir(root,{withFileTypes:true});}catch(error){if(error.code!=='ENOENT')throw error;}
  const groups=await Promise.all(directories.filter(entry=>entry.isDirectory()).map(entry=>SessionManager.listAll(resolve(root,entry.name))));
  const infos=groups.flat().filter(info=>info.messageCount>0).sort((a,b)=>+b.modified-+a.modified);
  known=new Map(infos.map(info=>[threadId(info.path),info]));
  const meta=await readMeta(),models=await Promise.all(infos.map(info=>lastModel(info.path)));
  return infos.map((info,i)=>{const id=threadId(info.path);return {id,title:info.name||info.firstMessage?.slice(0,90)||'Untitled thread',project:basename(info.cwd||'Project'),cwd:info.cwd||null,modified:+info.modified,branch:meta[id]?.branch||null,model:models[i]};});
 }
 async function open(id,resolveModel=()=>undefined){
  if(typeof id!=='string'||!known.has(id))throw new Error('Thread not found. Refresh the thread list.');
  const info=known.get(id),path=await realpath(info.path),base=await realpath(root);
  if(!path.startsWith(base+sep))throw new Error('Thread path is outside the session directory');
  const entries=(await readFile(path,'utf8')).split('\n').filter(Boolean).map(line=>JSON.parse(line));
  const messages=buildSessionProjection(entries.filter(entry=>entry.type!=='session')).messages;
  const lastAssistant=[...messages].reverse().find(message=>message.role==='assistant');
  const usage=savedUsage(entries,lastAssistant?resolveModel(lastAssistant.provider,lastAssistant.model):undefined);
  return {id,title:info.name||info.firstMessage?.slice(0,90)||'Untitled thread',cwd:info.cwd,path,usage,messages:messages.map(message=>({role:message.role,toolName:message.toolName,toolCallId:message.toolCallId,isError:message.isError,errorMessage:message.stopReason==='error'?message.errorMessage:undefined,content:typeof message.content==='string'?[{type:'text',text:message.content}]:(Array.isArray(message.content)?message.content:[{type:'text',text:message.output||JSON.stringify(message,null,2)}]).map(part=>part.type==='text'?{type:'text',text:part.text}:part.type==='thinking'?{type:'thinking',text:part.thinking}:part.type==='toolCall'?{type:'toolCall',id:part.id,name:part.name,text:JSON.stringify(part.arguments,null,2)}:{type:part.type,text:`[${part.type}]`})}))};
 }
 return {list,open,noteStart};
}
