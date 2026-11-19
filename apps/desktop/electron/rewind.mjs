import {mkdtemp,rm,rmdir,lstat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve,dirname,relative,isAbsolute,sep} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const run=promisify(execFile),KIND='Suffice-Kind',NS='refs/suffice/rewind/',maxList=60;
const idOk=id=>typeof id==='string'&&/^[a-f0-9]{32}$/.test(id);
const identity={GIT_AUTHOR_NAME:'Suffice',GIT_AUTHOR_EMAIL:'rewind@suffice.invalid',GIT_COMMITTER_NAME:'Suffice',GIT_COMMITTER_EMAIL:'rewind@suffice.invalid'};
async function git(root,args,{env,input}={}){
 const child=run('git',['-C',root,...args],{env:{...process.env,...identity,...env},maxBuffer:64*1024*1024,windowsHide:true,timeout:60000});
 if(input!==undefined)child.child.stdin.end(input);
 return (await child).stdout;
}
async function topLevel(cwd){try{return (await git(cwd,['rev-parse','--show-toplevel'])).trim()||null;}catch{return null;}}
// Snapshot of the working tree (tracked + untracked, minus ignored) written through a throwaway index:
// the real index, HEAD, stash and branches are never touched.
// shortcut: whole files are stored, so a huge untracked binary is copied once; add a size cap when it matters.
async function snapshotTree(root){
 const dir=await mkdtemp(resolve(tmpdir(),'suffice-rewind-')),env={GIT_INDEX_FILE:resolve(dir,'index')};
 try{await git(root,['add','-A','--','.'],{env});return (await git(root,['write-tree'],{env})).trim();}finally{await rm(dir,{recursive:true,force:true});}
}
async function save(root,threadId,tree,kind,label,turn){
 const refs=(await git(root,['for-each-ref','--format=%(refname)',NS+threadId+'/'])).split('\n').filter(Boolean);
 const next=refs.reduce((n,ref)=>Math.max(n,Number(ref.split('/').pop())||0),0)+1;
 const message=`${label.replace(/\s+/g,' ').trim().slice(0,200)||'Untitled'}\n\n${KIND}: ${kind}\nSuffice-Turn: ${turn||''}\n`;
 const commit=(await git(root,['commit-tree',tree,'-F','-'],{input:message})).trim();
 const ref=NS+threadId+'/'+String(next).padStart(5,'0');
 await git(root,['update-ref',ref,commit]);return ref;
}
// kind 'turn' = state before a turn starts; kind 'end' = state after it finished (same turn number).
export async function checkpoint(cwd,threadId,label,turn,kind='turn'){
 if(!idOk(threadId))throw new Error('Invalid thread');
 const root=await topLevel(cwd);if(!root)return null;
 turn??=(kind==='end'?0:1)+(await git(root,['for-each-ref','--format=%(trailers:key='+KIND+',valueonly,separator=)',NS+threadId+'/'])).split('\n').filter(l=>l.trim()==='turn').length;
 return save(root,threadId,await snapshotTree(root),kind,label,turn);
}
async function stat(root,from,to){
 const files=new Map();
 for(const line of (await git(root,['diff-tree','-r','--numstat','--no-renames','-z',from,to])).split('\0')){const m=/^(\d+|-)\t(\d+|-)\t(.+)$/.exec(line);if(m)files.set(m[3],{added:m[1]==='-'?0:+m[1],removed:m[2]==='-'?0:+m[2]});}
 let added=0,removed=0;for(const f of files.values()){added+=f.added;removed+=f.removed;}
 return {files:files.size,added,removed,names:[...files.keys()].sort().slice(0,50)};
}
export async function list(cwd,threadId){
 if(!idOk(threadId))throw new Error('Invalid thread');
 const root=await topLevel(cwd);if(!root)return {git:false,checkpoints:[]};
 const out=await git(root,['for-each-ref','--sort=refname','--format=%(refname)%00%(objectname)%00%(tree)%00%(creatordate:unix)%00%(subject)%00%(trailers:key='+KIND+',valueonly)%00%(trailers:key=Suffice-Turn,valueonly)%01',NS+threadId+'/']);
 const rows=out.split('\x01').map(row=>row.replace(/^\n/,'')).filter(Boolean).map(row=>{const [ref,id,tree,time,subject,kind,turn]=row.split('\0');return {ref,id,tree,time:Number(time)*1000,label:subject,kind:kind.trim()||'turn',turn:Number(turn)||null};}).slice(-maxList);
 const now=await snapshotTree(root);
 const checkpoints=await Promise.all(rows.map(async row=>({id:row.id,ref:row.ref,time:row.time,label:row.label,kind:row.kind,turn:row.turn,vsNow:await stat(root,row.tree,now)})));
 return {git:true,checkpoints};
}
const inside=(root,path)=>{const rel=relative(root,path);return rel&&!isAbsolute(rel)&&rel!=='..'&&!rel.startsWith('..'+sep);};
export async function restore(cwd,threadId,id){
 if(!idOk(threadId)||typeof id!=='string'||!/^[a-f0-9]{40,64}$/.test(id))throw new Error('Invalid checkpoint');
 const root=await topLevel(cwd);if(!root)throw new Error('This project is not a Git repository');
 const {checkpoints}=await list(cwd,threadId),target=checkpoints.find(c=>c.id===id);if(!target)throw new Error('Checkpoint not found');
 const tree=(await git(root,['rev-parse',id+'^{tree}'])).trim(),now=await snapshotTree(root);
 // Safety net first: rewinding is itself undoable from the timeline.
 const safety=await save(root,threadId,now,'rewind',`Before rewinding to ${target.turn?'turn '+target.turn:'a checkpoint'}`,target.turn);
 const changes=(await git(root,['diff-tree','-r','--name-status','--no-renames','-z',now,tree])).split('\0').filter(Boolean);
 const write=[],remove=[];
 for(let i=0;i+1<changes.length;i+=2)(changes[i]==='D'?remove:write).push(changes[i+1]);
 for(const name of remove){const path=resolve(root,name);if(!inside(root,path))continue;await rm(path,{force:true});
  for(let dir=dirname(path);inside(root,dir);dir=dirname(dir)){try{await rmdir(dir);}catch{break;}}}
 if(write.length){
  const dir=await mkdtemp(resolve(tmpdir(),'suffice-rewind-')),env={GIT_INDEX_FILE:resolve(dir,'index')};
  try{await git(root,['read-tree',tree],{env});
   for(const name of write){const path=resolve(root,name);if(!inside(root,path))throw new Error('Unsafe path in checkpoint');try{if((await lstat(path)).isDirectory())await rm(path,{recursive:true,force:true});}catch{}}
   await git(root,['checkout-index','-f','-z','--stdin'],{env,input:write.join('\0')+'\0'});
  }finally{await rm(dir,{recursive:true,force:true});}
 }
 return {restored:target.turn,kind:target.kind,files:remove.length+write.length,safety};
}
