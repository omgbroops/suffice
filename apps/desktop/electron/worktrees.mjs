// Detached per-thread worktrees under the app data dir: create (deps symlinked, .worktreeinclude copied),
// list/pin/evict, snapshot-before-delete + restore, no-change cleanup, dev-server port ranges.
// Ideas: Cline Kanban symlinked deps (github.com/cline/kanban), Codex worktrees; code written in-repo.
// Turn checkpoints and rewind live in rewind.mjs (private refs, whole-tree capture), not here.
import {mkdir,readFile,writeFile,readdir,lstat,unlink,rm,copyFile,symlink,stat,access} from 'node:fs/promises';
import {join,dirname,resolve,relative,isAbsolute,sep} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {randomUUID} from 'node:crypto';
const run=promisify(execFile);
const DEP_DIRS=['node_modules','.venv'],KEEP=15,PORT_BASE=4100,PORT_SPAN=10;
const id8=id=>typeof id==='string'&&/^[a-f0-9]{8}$/.test(id);
const identity={GIT_AUTHOR_NAME:'Suffice',GIT_AUTHOR_EMAIL:'worktree@suffice.invalid',GIT_COMMITTER_NAME:'Suffice',GIT_COMMITTER_EMAIL:'worktree@suffice.invalid'};
const git=async(cwd,args)=>(await run('git',['-C',cwd,'-c','core.hooksPath=/dev/null',...args],{env:{...process.env,...identity},maxBuffer:64*1024*1024,timeout:120000,windowsHide:true})).stdout;
const exists=p=>access(p).then(()=>true,()=>false);
const inside=(root,p)=>{const r=relative(root,p);return r&&!isAbsolute(r)&&r!=='..'&&!r.startsWith('..'+sep);};

const metaPath=home=>join(home,'worktrees.json');
async function readMeta(home){try{return JSON.parse(await readFile(metaPath(home),'utf8'));}catch{return {items:{}};}}
async function writeMeta(home,meta){await mkdir(home,{recursive:true});await writeFile(metaPath(home),JSON.stringify(meta,null,1));}

// Files named in .worktreeinclude (one repo-relative path per line) are copied: gitignored .env and similar.
async function copyIncluded(repo,dest){
 let lines;try{lines=(await readFile(join(repo,'.worktreeinclude'),'utf8')).split('\n');}catch{return [];}
 const copied=[];
 for(const line of lines.map(l=>l.trim()).filter(l=>l&&!l.startsWith('#'))){
  const from=resolve(repo,line),to=resolve(dest,line);
  if(!inside(repo,from)||!inside(dest,to))continue;
  try{if(!(await lstat(from)).isFile())continue;await mkdir(dirname(to),{recursive:true});await copyFile(from,to);copied.push(line);}catch{}
 }
 return copied;
}
async function linkDeps(repo,dest){
 const linked=[];
 for(const name of DEP_DIRS){
  if(!await exists(join(repo,name))||await exists(join(dest,name)))continue;
  await symlink(join(repo,name),join(dest,name),'dir');linked.push(name);
 }
 return linked;
}
// Lowest free block of PORT_SPAN ports not held by another worktree.
export function allocatePorts(items){
 const used=new Set(Object.values(items).map(i=>i.portBase).filter(Number.isInteger));
 let base=PORT_BASE;while(used.has(base))base+=PORT_SPAN;
 return {portBase:base,portEnd:base+PORT_SPAN-1};
}

export async function create(home,repo,{threadId,pinned=false}={}){
 const top=(await git(repo,['rev-parse','--show-toplevel']).catch(()=>{throw new Error('Worktrees need a Git project');})).trim();
 const base=(await git(top,['rev-parse','HEAD']).catch(()=>{throw new Error('Make one commit before using a worktree');})).trim();
 const id=randomUUID().replace(/-/g,'').slice(0,8),path=join(home,'worktrees',id);
 await mkdir(join(home,'worktrees'),{recursive:true});
 await git(top,['worktree','add','--detach',path,base]);
 const linked=await linkDeps(top,path),included=await copyIncluded(top,path);
 const meta=await readMeta(home);
 meta.items[id]={id,repo:top,path,base,threadId:threadId||null,pinned,created:Date.now(),...allocatePorts(meta.items)};
 await writeMeta(home,meta);
 return {...meta.items[id],linked,included};
}

// Register a worktree made elsewhere (thread-worktree.cjs) so the list, cap and ports cover it too.
export async function adopt(home,repo,path,threadId){
 const top=(await git(repo,['rev-parse','--show-toplevel'])).trim(),base=(await git(path,['rev-parse','HEAD'])).trim(),id=randomUUID().replace(/-/g,'').slice(0,8);
 await linkDeps(top,path);await copyIncluded(top,path);
 const meta=await readMeta(home);
 meta.items[id]={id,repo:top,path,base,threadId:threadId||null,pinned:false,created:Date.now(),...allocatePorts(meta.items)};
 await writeMeta(home,meta);return meta.items[id];
}
async function sizeOf(dir,skipLinks=true){
 let total=0;
 for(const e of await readdir(dir,{withFileTypes:true}).catch(()=>[])){
  if(e.name==='.git')continue;
  const p=join(dir,e.name);
  if(e.isSymbolicLink())continue;
  if(e.isDirectory())total+=await sizeOf(p);
  else total+=(await lstat(p).catch(()=>({size:0}))).size;
 }
 return total;
}
export async function status(item){
 const out=await git(item.path,['status','--porcelain']).catch(()=>null);
 if(out===null)return {missing:true};
 const head=(await git(item.path,['rev-parse','HEAD'])).trim();
 return {missing:false,dirty:out.split('\n').filter(Boolean).length,headMoved:head!==item.base};
}
export async function list(home){
 const meta=await readMeta(home),rows=[];
 for(const item of Object.values(meta.items)){
  const s=await status(item);
  rows.push({...item,size:s.missing?0:await sizeOf(item.path),ageMs:Date.now()-item.created,changed:!s.missing&&(s.dirty>0||s.headMoved),missing:s.missing});
 }
 return rows.sort((a,b)=>b.created-a.created);
}
export async function pin(home,id,pinned){
 const meta=await readMeta(home);if(!meta.items[id])throw new Error('Worktree not found');
 meta.items[id].pinned=!!pinned;await writeMeta(home,meta);
}

// Unlink symlinked dependency dirs first so removal can never reach the main checkout.
async function removeTree(item){
 for(const name of DEP_DIRS){const p=join(item.path,name);if((await lstat(p).catch(()=>null))?.isSymbolicLink())await unlink(p);}
 await git(item.repo,['worktree','remove','--force',item.path]).catch(async()=>{
  // shortcut: manual fallback when git no longer knows the worktree; prune stale entries after.
  if(await exists(item.path)&&inside(dirname(item.path),item.path))await rm(item.path,{recursive:true,force:true});
  await git(item.repo,['worktree','prune']).catch(()=>{});
 });
}
// Snapshot (all files incl. untracked, minus ignored) to refs/suffice/worktree/<id>, then remove.
// shortcut: lives in the main repo's refs, so it survives only while that repo exists; write a bundle if that matters.
export async function remove(home,id,{snapshot=true}={}){
 if(!id8(id))throw new Error('Invalid worktree');
 const meta=await readMeta(home),item=meta.items[id];if(!item)throw new Error('Worktree not found');
 if(snapshot&&await exists(item.path)){
  const tmp=join(home,'tmp-index-'+id);
  try{
   const env={...process.env,...identity,GIT_INDEX_FILE:tmp};
   await run('git',['-C',item.path,'add','-A','--','.'],{env});
   const tree=(await run('git',['-C',item.path,'write-tree'],{env})).stdout.trim();
   const commit=(await git(item.repo,['commit-tree',tree,'-p',item.base,'-m','worktree '+id])).trim();
   await git(item.repo,['update-ref','refs/suffice/worktree/'+id,commit]);
   item.snapshot=commit;
  }finally{await rm(tmp,{force:true});}
 }
 await removeTree(item);
 item.removed=Date.now();
 meta.items[id]=item;meta.items[id].gone=true;
 await writeMeta(home,meta);
 return {id,snapshot:item.snapshot||null};
}
export async function restore(home,id){
 if(!id8(id))throw new Error('Invalid worktree');
 const meta=await readMeta(home),item=meta.items[id];
 if(!item?.gone||!item.snapshot)throw new Error('No snapshot to restore');
 await git(item.repo,['worktree','add','--detach',item.path,item.snapshot]);
 await linkDeps(item.repo,item.path);
 delete item.gone;delete item.removed;await writeMeta(home,meta);
 return item;
}
// Keep newest N live worktrees; evict the oldest unpinned (with snapshot) beyond that.
export async function evict(home,keep=KEEP){
 const meta=await readMeta(home),live=Object.values(meta.items).filter(i=>!i.gone).sort((a,b)=>b.created-a.created);
 const over=live.slice(keep).filter(i=>!i.pinned).reverse(),gone=[];
 for(const i of over){await remove(home,i.id);gone.push(i.id);}
 return gone;
}
// Thread closed: an unchanged worktree is deleted outright (no snapshot needed), a changed one stays.
export async function closeThread(home,threadId){
 const meta=await readMeta(home),done=[];
 for(const item of Object.values(meta.items).filter(i=>i.threadId===threadId&&!i.gone)){
  const s=await status(item);
  if(!s.missing&&(s.dirty>0||s.headMoved))continue;
  if(!s.missing)await removeTree(item);
  delete meta.items[item.id];done.push(item.id);
 }
 await writeMeta(home,meta);
 return done;
}
