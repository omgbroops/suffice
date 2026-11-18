import {SessionManager} from '@earendil-works/pi-coding-agent';
import {realpath,mkdir,stat} from 'node:fs/promises';
import {resolve,sep,relative} from 'node:path';
import {createHash} from 'node:crypto';
import {threadId} from './threads.mjs';
export async function forkSavedThread({sourcePath,cwd,home,title,before}){
 const source=await realpath(sourcePath),root=await realpath(resolve(home,'sessions')),target=await realpath(cwd);
 if(!source.startsWith(root+sep))throw new Error('Thread path is outside the session directory');
 if(!(await stat(target)).isDirectory())throw new Error('Choose a project directory');
 const directory=resolve(root,createHash('sha256').update(target).digest('hex').slice(0,20));await mkdir(directory,{recursive:true});
 if(!(await realpath(directory)).startsWith(root+sep))throw new Error('Fork directory is outside the session directory');
 if(before==='last-user'){
  // Edit-and-resend: branch to the entry before the last user turn (and its turn-start marker); the source file is never written.
  const manager=SessionManager.open(source,directory,target),path=manager.getBranch(),at=path.findLastIndex(entry=>entry.type==='message'&&entry.message?.role==='user');
  if(at<0)throw new Error('This thread has no user message to edit');
  let from=at;while(from>0&&path[from-1].type==='custom'&&path[from-1].customType==='suffice:turn-start')from--;
  if(from===0)return {id:null,cwd:target};
  manager.createBranchedSession(path[from-1].id);manager.appendSessionInfo(('Edit of '+(title||'conversation')).slice(0,90));
  return {id:threadId(resolve(home,'sessions',relative(root,manager.getSessionFile()))),path:manager.getSessionFile(),cwd:target};
 }
 const session=SessionManager.forkFrom(source,target,directory);
 session.appendSessionInfo(('Fork of '+(title||'conversation')).slice(0,90));
 return {id:threadId(resolve(home,'sessions',relative(root,session.getSessionFile()))),path:session.getSessionFile(),cwd:target};
}
