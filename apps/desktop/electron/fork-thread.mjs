import {SessionManager} from '@earendil-works/pi-coding-agent';
import {realpath,mkdir,stat} from 'node:fs/promises';
import {resolve,sep} from 'node:path';
import {createHash} from 'node:crypto';
import {threadId} from './threads.mjs';
export async function forkSavedThread({sourcePath,cwd,home,title}){
 const source=await realpath(sourcePath),root=await realpath(resolve(home,'sessions')),target=await realpath(cwd);
 if(!source.startsWith(root+sep))throw new Error('Thread path is outside the session directory');
 if(!(await stat(target)).isDirectory())throw new Error('Choose a project directory');
 const directory=resolve(root,createHash('sha256').update(target).digest('hex').slice(0,20));await mkdir(directory,{recursive:true});
 const session=SessionManager.forkFrom(source,target,directory);
 session.appendSessionInfo(('Fork of '+(title||'conversation')).slice(0,90));
 return {id:threadId(session.getSessionFile()),path:session.getSessionFile(),cwd:target};
}
