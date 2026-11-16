import {hostname} from 'node:os';
import {basename,resolve} from 'node:path';
import {createNativeSessionCatalog} from '../../desktop-bridge/session-catalog.mjs';
import {readChatChanges} from './chat-changes.mjs';
import {readChatGit,chatGitProjection} from './chat-git.mjs';
import {projectMetadata} from './sidebar-metadata.mjs';

export function createNativeThreadStore(home,{resolveModel,createCatalog=createNativeSessionCatalog}={}){
 const root=resolve(home,'sessions');
 let opening,tail=Promise.resolve(),generation=0,stopped=false,released=false;
 let authorized=new Map(),current=new Map(),failedResume=null;

 // Include the close/reopen transitions in the same ordering as normal requests.
 // An explicit reset or shutdown also revokes in-flight requests immediately.
 function request(action){
  const revision=generation;
  const check=()=>{if(stopped||generation!==revision)throw new Error('Session catalog closed');};
  const result=tail.then(async()=>{
   check();
   opening??=createCatalog(root,{resolveModel});
   const catalog=await opening;
   check();
   const value=await action(catalog);
   check();
   return value;
  });
  tail=result.catch(()=>{});
  return result;
 }
 function close(permanent){
  generation++;
  if(permanent){stopped=true;authorized.clear();current.clear();}
  released=!!opening;
  const drain=Promise.all([tail,opening?.then(catalog=>catalog.close())]);
  tail=drain.catch(()=>{});
  return drain;
 }
 function identities(rows){
  return new Map(rows.map(({id,identityToken})=>{
   if(typeof identityToken!=='string')throw new Error('Missing native thread identity');
   return [id,identityToken];
  }));
 }
 async function reopenIfReleased(catalog){
  if(!released)return false;
  released=false;
  await catalog.reopen();
  return true;
 }
 async function lookup(catalog,id){
  if(failedResume)throw new Error('Resume validation failed. Refresh the thread list.');
  if(typeof id!=='string'||!authorized.has(id))throw new Error('Thread not found. Refresh the thread list.');
  if(await reopenIfReleased(catalog)){
   // Rebuild native tokens only after a deliberate release, on the same root.
   // An internal refresh cannot grant access to an unseen or substituted file.
   current=identities((await catalog.list()).sessions);
  }
  if(!current.has(id))throw new Error('Thread not found. Refresh the thread list.');
  if(current.get(id)!==authorized.get(id)){
   await catalog.close();
   throw new Error('Thread file identity changed');
  }
 }
 return {
  list:()=>request(async catalog=>{
   // A rejected handoff consumes its native reader too. A subsequent list may
   // recover from an ordinary append only while the original file is present.
   if(failedResume){released=false;await catalog.reopen();}else await reopenIfReleased(catalog);
   const {sessions}=await catalog.list();
   current=identities(sessions);
   if(failedResume&&current.get(failedResume.id)!==failedResume.identity){
    await catalog.close();
    throw new Error('Thread file identity changed');
   }
   failedResume=null;
   authorized=current;
   return Promise.all(sessions.map(async({id,title,cwd,modified,sidebar,nativeEligible,projectionBackend,catalogState,limitReason})=>{
    const [project,git,diff]=await Promise.all([projectMetadata(cwd),readChatGit(home,id,cwd),readChatChanges(home,id)]);
    return {id,title,cwd,modified,project:cwd?basename(cwd):null,machine:hostname(),
     ...chatGitProjection(project,git),...sidebar,diff,
     ...(!nativeEligible?{nativeEligible,projectionBackend}:{}),...(catalogState?{catalogState,limitReason}:{})};
   }));
  }),
  open:id=>request(async catalog=>{await lookup(catalog,id);return catalog.open(id);}),
  location:id=>request(async catalog=>{await lookup(catalog,id);return (await catalog.location(id)).absolutePath;}),
  releaseLocation:id=>request(async catalog=>{
   await lookup(catalog,id);
   const {absolutePath}=await catalog.location(id);
   await catalog.close();
   authorized.delete(id);
   released=true;
   return absolutePath;
  }),
  prepareResume:id=>request(async catalog=>{
   await lookup(catalog,id);
   try{
    const receipt=await catalog.prepareResume(id);
    released=true;
    return receipt;
   }catch(error){
    failedResume={id,identity:authorized.get(id)};
    throw error;
   }
  }),
  reset:()=>close(false),
  close:()=>close(true),
 };
}

// This host has no engine, credentials or Pi imports. Status/models and Send are
// routed separately, so an isolated saved-history request can stay read-only.
export function createSavedCatalogHost(store,send){
 let usage=null,revision=0;
 return {async request(action,payload={}){
  switch(action){
   case 'threads':return store.list();
   case 'thread':{
    const current=++revision;
    const view=await store.open(payload.id);
    if(current===revision){usage=view.usage;send({event:'usage',usage});}
    return view;
   }
   case 'usage':return usage;
   case 'thread-location':return store.location(payload.id);
   case 'release-location':return store.releaseLocation(payload.id);
   case 'shutdown':revision++;usage=null;return store.close();
   case 'reset':revision++;usage=null;await store.reset();return;
   case 'clear-view':revision++;usage=null;return;
   default:throw new Error('Unknown saved catalog request');
  }
 }};
}
