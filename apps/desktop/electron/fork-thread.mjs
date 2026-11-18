import {SessionManager} from '@earendil-works/pi-coding-agent';
import {realpath,mkdir,stat} from 'node:fs/promises';
import {resolve,sep,relative} from 'node:path';
import {createHash} from 'node:crypto';
import {threadId} from './threads.mjs';
const hasCalls=message=>message.role==='assistant'&&Array.isArray(message.content)&&message.content.some(part=>part.type==='toolCall');
// A fork must end after a tool call's results, never between a call and its result.
function forkLeaf(manager,entryId,before){
 const entry=manager.getEntry(entryId);if(!entry)throw new Error('Message not found');
 let leaf=before?entry.parentId:entryId;if(!leaf)throw new Error('There is nothing before the first message');
 for(let node=manager.getEntry(leaf);node?.type==='message'&&(node.message.role==='toolResult'||hasCalls(node.message));){
  const next=manager.getChildren(node.id).find(child=>child.type==='message'&&child.message.role==='toolResult');if(!next)break;node=next;leaf=next.id;
 }
 return leaf;
}
// area 'sessions' = a listed thread; any other area is a private snapshot (side chats) the thread list never scans.
export async function forkSavedThread({sourcePath,cwd,home,title,entryId,before=false,area='sessions',label='Fork of '}){
 const source=await realpath(sourcePath),root=await realpath(resolve(home,'sessions')),target=await realpath(cwd);
 if(!source.startsWith(root+sep))throw new Error('Thread path is outside the session directory');
 if(!(await stat(target)).isDirectory())throw new Error('Choose a project directory');
 await mkdir(resolve(home,area),{recursive:true});const out=await realpath(resolve(home,area));
 const directory=resolve(out,createHash('sha256').update(target).digest('hex').slice(0,20));await mkdir(directory,{recursive:true});
 if(!(await realpath(directory)).startsWith(out+sep))throw new Error('Fork directory is outside the session directory');
  if(before==='last-user'){
   // Edit-and-resend: branch to the entry before the last user turn (and its turn-start marker); the source file is never written.
   const manager=SessionManager.open(source,directory,target),path=manager.getBranch(),at=path.findLastIndex(entry=>entry.type==='message'&&entry.message?.role==='user');
   if(at<0)throw new Error('This thread has no user message to edit');
   let from=at;while(from>0&&path[from-1].type==='custom'&&path[from-1].customType==='suffice:turn-start')from--;
   if(from===0)return {id:null,cwd:target};
   manager.createBranchedSession(path[from-1].id);manager.appendSessionInfo(('Edit of '+(title||'conversation')).slice(0,90));
   return {id:threadId(resolve(home,area,relative(out,manager.getSessionFile()))),path:manager.getSessionFile(),cwd:target};
  }
 let session;
 if(entryId){session=SessionManager.open(source,directory,target);session.createBranchedSession(forkLeaf(session,entryId,before));}
 else session=SessionManager.forkFrom(source,target,directory);
 session.appendSessionInfo((label+(title||'conversation')).slice(0,90));
 return {id:threadId(resolve(home,area,relative(out,session.getSessionFile()))),path:session.getSessionFile(),cwd:target};
}
