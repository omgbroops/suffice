// Trusted host adapter for the opt-in experimental saved-session backend.
import {basename,dirname,isAbsolute,resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {sidebarFromSessionTail} from '../desktop/electron/sidebar-metadata.mjs';
import {loadDesktopBinding} from './native-binding.mjs';

const idFor=path=>createHash('sha256').update(process.platform==='win32'?resolve(path).toLowerCase():resolve(path)).digest('hex').slice(0,32);
const decode=value=>{if(typeof value!=='string')throw Error('Invalid native session response');const response=JSON.parse(value);if(!response||typeof response!=='object'||Array.isArray(response))throw Error('Invalid native session response');return response;};
function locationReceipt(raw) {
 const receipt=decode(raw);
 if(typeof receipt.absolutePath!=='string'||!isAbsolute(receipt.absolutePath)||typeof receipt.identityToken!=='string'||typeof receipt.version!=='string')throw Error('Invalid native location receipt');
 return receipt;
}
function withWindowPercent(view,usageModel,resolveModel) {
 const model=usageModel?resolveModel(usageModel.provider,usageModel.model):undefined;
 const percent=view.usage.windowTokens!=null && model?.contextWindow>0 ? view.usage.windowTokens/model.contextWindow*100 : null;
 const windowPercent=Number.isFinite(percent)?percent:null;
 return view.usage.windowPercent===windowPercent?view:{...view,usage:{...view.usage,windowPercent}};
}
const maximums=Object.freeze({catalogBytes:256*1024*1024,journalBytes:256*1024*1024,recordBytes:64*1024*1024,records:250_000});
function readLimits(requested={}){
 const limits={...maximums,...requested};
 for(const [key,value] of Object.entries(limits)){
  if(!Object.hasOwn(maximums,key)||!Number.isSafeInteger(value)||value<1||value>maximums[key])throw Error('Invalid saved-history limit: '+key);
 }
 return limits;
}
class HistoryLimit extends Error {}
const oversized=limit=>new HistoryLimit('Saved journal exceeds the '+limit+'-byte compatibility limit.');

// Count bytes before retaining any part of a physical record and before UTF-8
// decoding. This counts blank and corrupt records too. A 1 MiB borrowed native
// page may be retained for each fragment of the current bounded record.
function recordScanner(limits,catalog,consume){
 let parts=[],size=0,count=0,afterCR=false;
 function append(fragment){
  if(fragment.length&&count===limits.records)throw new HistoryLimit('Saved journal exceeds the '+limits.records+'-record compatibility limit.');
  if(fragment.length>limits.recordBytes-size)throw new HistoryLimit('Saved record exceeds the '+limits.recordBytes+'-byte compatibility limit.');
  size+=fragment.length;
  if(fragment.length)parts.push(fragment);
 }
 function emit(terminated){
  if(++count>limits.records)throw new HistoryLimit('Saved journal exceeds the '+limits.records+'-record compatibility limit.');
  const bytes=parts.length===1?parts[0]:Buffer.concat(parts,size);
  parts=[];size=0;consume(bytes.toString('utf8'),count,terminated);
 }
 return {
  feed(page){
   let start=0;
   for(let end=0;end<page.length;end++){
    const byte=page[end];
    if(afterCR){afterCR=false;if(byte===10){start=end+1;continue;}}
    if(byte!==10&&!(catalog&&byte===13))continue;
    append(page.subarray(start,end));emit(true);start=end+1;afterCR=catalog&&byte===13;
   }
   append(page.subarray(start));
  },
  finish(){if(size)emit(false);},
 };
}

// Pi 1.5.2's private buildSessionInfo uses readline delimiters and V8 JSON/Date
// semantics. Retain the desktop fields only. Journal projection has LF-only
// record semantics and recovers an interrupted, unterminated final record.
function summaryBuilder(entry){
 let header,firstMessage='',name,messageCount=0,activity,invalid=false;
 return {
  line(text){
   if(invalid)return;
   let row;try{row=JSON.parse(text);}catch{return;}
   if(!row)return;
   if(!header){if(row.type==='session')header=row;else invalid=true;return;}
   try{
    if(row.type==='session_info')name=row.name?.trim()||undefined;
    if(row.type!=='message')return;
    messageCount++;
    const m=row.message;
    if(typeof m.role!=='string'||!('content' in m)||!['user','assistant'].includes(m.role))return;
    const value=typeof m.timestamp==='number'?m.timestamp:new Date(row.timestamp).getTime();
    if(!Number.isNaN(value))activity=Math.max(activity??0,value);
    const text=typeof m.content==='string'?m.content:m.content.filter(block=>block.type==='text').map(block=>block.text).join(' ');
    if(!firstMessage&&text&&m.role==='user')firstMessage=text.slice(0,90);
   }catch{invalid=true;}
  },
  finish(){
   if(invalid||!header)return null;
   const headerTime=typeof header.timestamp==='string'?new Date(header.timestamp).getTime():NaN;
   const modified=activity>0?new Date(activity).getTime():!Number.isNaN(headerTime)?headerTime:entry.mtime;
   return {path:entry.summary.path,cwd:typeof header.cwd==='string'?header.cwd:'',name,messageCount,firstMessage:firstMessage||'(no messages)',modified};
  },
 };
}
async function scanCompatibility(reader,request,snapshot,entry,limits,{summary=false,journal=false,batch}){
 const length=snapshot.byteLength;
 if(!Number.isSafeInteger(length)||length<0||typeof snapshot.version!=='string')throw Error('Invalid compatibility source receipt');
 if(length>limits.journalBytes)throw oversized(limits.journalBytes);
 const builder=summary?summaryBuilder(entry):null,entries=journal?[]:null;
 const catalogLines=builder&&recordScanner(limits,true,builder.line);
 const journalLines=entries&&recordScanner(limits,false,(text,index,terminated)=>{
  if(!text.trim())return;
  try{entries.push(JSON.parse(text));}catch{if(terminated)throw Error('Saved transcript contains invalid JSON at line '+index);}
 });
 const tail=summary?Buffer.allocUnsafe(Math.min(length,512*1024)):null;
 const cutoff=tail?length-tail.length:length;
 let offset=0;
 while(offset<length){
  const size=Math.min(1024*1024,length-offset);
  if(batch){
   if(size>limits.catalogBytes-batch.read)throw Error('Catalog byte allowance exhausted');
   // Charge before requesting a page, including a later parse/limit failure.
   batch.read+=size;
  }
  const bytes=await reader.sourceChunk(JSON.stringify({...request,version:snapshot.version,offset,purpose:batch?'catalog':'selection'}));
  if(!Buffer.isBuffer(bytes)||bytes.length!==size)throw Error('Invalid session source page');
  if(tail&&offset+size>cutoff){
   const start=Math.max(offset,cutoff);
   bytes.copy(tail,start-cutoff,start-offset);
  }
  catalogLines?.feed(bytes);journalLines?.feed(bytes);
  offset+=size;
 }
 catalogLines?.finish();journalLines?.finish();
 const current=decode(await reader.sourceInfo(JSON.stringify(request)));
 if(current.version!==snapshot.version||current.byteLength!==length)throw Error('Session changed during compatibility read');
 let sidebar;
 if(tail){
  let text=tail.toString('utf8');
  if(cutoff)text=text.slice(text.indexOf('\n')+1);
  sidebar=sidebarFromSessionTail(text);
 }
 return {summary:builder?.finish(),sidebar,entries};
}

async function selectSource(reader,request,snapshot,entry,limits,journal){
 const pending=Boolean(entry.deferred||entry.limitReason);
 if(entry.limitReason&&entry.detailsVersion===snapshot.version)throw new HistoryLimit(entry.limitReason);
 try{
  const details=await scanCompatibility(reader,request,snapshot,entry,limits,{summary:pending,journal});
  if(pending){
   if(!(details.summary?.messageCount>0))throw Error('This file has no saved Pi thread.');
   entry.summary=details.summary;entry.sidebar=details.sidebar;entry.detailsVersion=snapshot.version;
   entry.deferred=false;delete entry.limitReason;
  }
  return details.entries;
 }catch(error){
  if(error instanceof HistoryLimit){
   entry.limitReason=error.message;entry.detailsVersion=snapshot.version;entry.deferred=false;
  }
  throw error;
 }
}

// Pi assumes a parent chain terminates. Native projection already diagnoses
// cycles; preserve that bound before invoking the original compatibility code.
function checkParentChain(entries){
 const records=entries.filter(entry=>entry?.type!=='session');
 const byId=new Map(records.map(entry=>[entry?.id,entry]));
 const visited=new Set();
 for(let entry=records.at(-1);entry;entry=entry.parentId?byId.get(entry.parentId):undefined){
  if(visited.has(entry))throw Error('Saved transcript contains a parent cycle');
  visited.add(entry);
 }
}

export async function createNativeSessionCatalog(root,{load=loadDesktopBinding,resolveModel=()=>undefined,limits:requestedLimits}={}){
 if(typeof root!=='string'||!isAbsolute(root))throw Error('An explicit absolute session root is required');
 const {PersistentSessionReader}=await load();if(typeof PersistentSessionReader!=='function')throw Error('Native session reader export is missing');
 const limits=readLimits(requestedLimits);
 const reader=new PersistentSessionReader(root,limits.catalogBytes);
 let known=new Map(),revision=null,closed=false,tail=Promise.resolve(),closePromise,controlGeneration=0;
 const cache=new Map();
 const enqueue=action=>{const result=tail.catch(()=>{}).then(()=>{if(closed)throw Error('Session catalog closed');return action();});tail=result.catch(()=>{});return result;};
 const find=id=>{if(typeof id!=='string'||!known.has(id))throw Error('Thread not found. Refresh the thread list.');return known.get(id);};
 return {
  list:()=>enqueue(async()=>{
   const result=decode(await reader.list());
   if(typeof result.revision!=='string'||!Array.isArray(result.sessions)||!Array.isArray(result.skipped))throw Error('Invalid native catalog');
   const next=new Map(),sessions=[];
   if(!Number.isSafeInteger(result.bytesRead)||result.bytesRead<0||result.bytesRead>limits.catalogBytes)throw Error('Invalid native catalog byte receipt');
   const batch={read:result.bytesRead},skipped=[...result.skipped];
   let deferred=0,limited=0;
   for(const entry of result.sessions){
    let summary=entry?.summary;
    if(typeof entry.token!=='string'||typeof entry.version!=='string'||!summary||typeof summary.path!=='string'||typeof entry.nativeEligible!=='boolean'||typeof entry.identityToken!=='string'||(entry.nativeEligible&&(!entry.sidebar||typeof entry.sidebar!=='object'||Array.isArray(entry.sidebar))))throw Error('Invalid native catalog entry');
    const id=idFor(summary.path);
    if(next.has(id))throw Error('Native catalog path identity collision');
    if(!entry.nativeEligible){
     const previous=known.get(id);
     if(previous?.detailsVersion===entry.version&&previous.identityToken===entry.identityToken){
      summary=previous.summary;entry.sidebar=previous.sidebar;
      entry.detailsVersion=entry.version;entry.limitReason=previous.limitReason;
     }else if(entry.byteLength>limits.journalBytes){
      entry.limitReason=oversized(limits.journalBytes).message;
      entry.detailsVersion=entry.version;
     }else if(entry.byteLength>limits.catalogBytes-batch.read){
      entry.deferred=true;
     }else{
      const request={revision:result.revision,token:entry.token};
      try{
       const details=await scanCompatibility(reader,request,entry,entry,limits,{summary:true,batch});
       summary=details.summary;entry.sidebar=details.sidebar;
      }catch(error){
       if(!(error instanceof HistoryLimit))throw error;
       entry.limitReason=error.message;
      }
      entry.detailsVersion=entry.version;
     }
     if(entry.deferred||entry.limitReason){
      const label=entry.limitReason?'inspection limit reached':'open to load history';
      summary={path:entry.summary.path,name:basename(entry.relativePath)+' ('+label+')',cwd:'',modified:entry.mtime,messageCount:null};
      entry.sidebar={};
      if(entry.limitReason)limited++;else deferred++;
     }else if(!summary){skipped.push(entry.relativePath+': invalid Pi session summary');continue;}
     entry.summary=summary;
    }
    if(!entry.deferred&&!entry.limitReason&&!(summary.messageCount>0))continue;
    next.set(id,entry);
    sessions.push({id,identityToken:entry.identityToken,sidebar:entry.sidebar,title:summary.name||summary.firstMessage?.slice(0,90)||'Untitled thread',cwd:summary.cwd,modified:summary.modified,messageCount:summary.messageCount,nativeEligible:entry.nativeEligible,projectionBackend:entry.nativeEligible?'rust':'pi-compatibility',...(entry.deferred?{catalogState:'deferred'}:entry.limitReason?{catalogState:'limited',limitReason:entry.limitReason}:{})});
   }
   // Desktop groups follow Node readdir order. Pi orders each group's names
   // by descending localeCompare, then stably orders rows by activity time.
   const orderKeys=new Map();
   for(const [id,entry] of next){
    orderKeys.set(id,{group:Buffer.from(dirname(entry.relativePath)),name:basename(entry.relativePath)});
   }
   sessions.sort((a,b)=>{
    const first=orderKeys.get(a.id),second=orderKeys.get(b.id);
    return Buffer.compare(first.group,second.group) || second.name.localeCompare(first.name) || Buffer.compare(Buffer.from(first.name),Buffer.from(second.name));
   });
   // Pi sorts each group first and the desktop then performs its own stable
   // sort. Both passes matter when V8 produces an invalid Date (NaN).
   const groups=Map.groupBy(sessions,row=>dirname(next.get(row.id).relativePath));
   sessions.length=0;
   for(const group of groups.values()){
    group.sort((a,b)=>b.modified-a.modified);
    for(const row of group)sessions.push(row);
   }
   sessions.sort((a,b)=>b.modified-a.modified);
   revision=result.revision;known=next;
   for(const id of cache.keys())if(!known.has(id))cache.delete(id);
   return {sessions,skipped,bytesRead:batch.read,nativeBytesRead:result.bytesRead,deferred,limited};
  }),
  open:id=>enqueue(async()=>{
   const entry=find(id),cached=cache.get(id);
   const request={revision,token:entry.token};
   let result=entry.nativeEligible?decode(await reader.readView(JSON.stringify({...request,...(cached?{ifVersion:cached.version}:{})}))):null;
   if(!result||result.compatibility===true){
    const snapshot=result??decode(await reader.sourceInfo(JSON.stringify(request)));
    if(typeof snapshot.version!=='string'||!Number.isSafeInteger(snapshot.byteLength)||snapshot.byteLength<0)throw Error('Invalid compatibility source receipt');
    if(entry.limitReason&&entry.detailsVersion===snapshot.version)throw new HistoryLimit(entry.limitReason);
    if(!entry.deferred&&cached?.version===snapshot.version){
     result={...snapshot,notModified:true};
    }else{
     const entries=await selectSource(reader,request,snapshot,entry,limits,true);
     checkParentChain(entries);
     const {projectSavedJournal}=await import('../desktop/electron/threads.mjs');
     const {messages,usage,usageModel}=projectSavedJournal(entries);
     result={...snapshot,notModified:false,messages,usage,usageModel};
    }
    await reader.acceptView(JSON.stringify({...request,version:snapshot.version}));
    entry.nativeEligible=false;
   }
   if(typeof result.version!=='string'||!Number.isSafeInteger(result.byteLength)||result.byteLength<0)throw Error('Invalid native view receipt');
   if(result.notModified===true){if(!cached||cached.version!==result.version)throw Error('Native cache validation has no matching view');cached.view=withWindowPercent(cached.view,cached.usageModel,resolveModel);return cached.view;}
   if(result.notModified!==false||!Array.isArray(result.messages)||!result.usage||typeof result.usage!=='object')throw Error('Invalid native saved view');
   const view=withWindowPercent({id,title:entry.summary.name||entry.summary.firstMessage?.slice(0,90)||'Untitled thread',cwd:entry.summary.cwd,messages:result.messages,usage:result.usage},result.usageModel,resolveModel);
   cache.delete(id);if(result.byteLength<=4*1024*1024)cache.set(id,{version:result.version,view,usageModel:result.usageModel});
   while(cache.size>12)cache.delete(cache.keys().next().value);
   return view;
  }),
  location:id=>enqueue(async()=>{
   const entry=find(id);
   const request={revision,token:entry.token};
   if(entry.deferred||entry.limitReason){
    const snapshot=decode(await reader.sourceInfo(JSON.stringify(request)));
    await selectSource(reader,request,snapshot,entry,limits,false);
    const receipt=locationReceipt(await reader.location(JSON.stringify(request)));
    if(receipt.version!==snapshot.version)throw Error('Session changed before location handoff');
    return receipt;
   }
   return locationReceipt(await reader.location(JSON.stringify(request)));
  }),
  prepareResume:id=>enqueue(async()=>{
   const entry=find(id);
   try{
    return locationReceipt(await reader.prepareResume(JSON.stringify({revision,token:entry.token})));
   }finally{closed=true;known.clear();cache.clear();revision=null;await reader.close();}
  }),
  close(){
   closed=true;controlGeneration++;
   if(closePromise)return closePromise;
   // Revoke immediately, before waiting on queued JS/native operations.
   let nativeClose;
   try{nativeClose=Promise.resolve(reader.close());}catch(error){nativeClose=Promise.reject(error);}
   closePromise=Promise.all([tail.catch(()=>{}),nativeClose]).then(()=>{known.clear();cache.clear();revision=null;});
   return closePromise;
  },
  reopen({allowRootRebind=false}={}){
   closed=true;
   const generation=++controlGeneration,priorClose=closePromise;
   closePromise=null;
   const opening=Promise.all([priorClose,tail.catch(()=>{})]).then(async()=>{
    if(generation!==controlGeneration)throw Error('Session catalog closed during reopen');
    if(allowRootRebind===true)await reader.reopen();
    else await reader.reopenValidated();
    if(generation!==controlGeneration){await reader.close();throw Error('Session catalog closed during reopen');}
    known.clear();cache.clear();revision=null;closed=false;
   });
   tail=opening.catch(()=>{});
   return opening;
  },
 };
}
