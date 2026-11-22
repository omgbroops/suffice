import {cp,rm,readdir,readFile,writeFile,mkdir,lstat,realpath,rename} from 'node:fs/promises';
import {join,relative,dirname} from 'node:path';

// Shared workspace-copy machinery for the mode commands — snapshot diffs,
// patch application, the prefill manifest, and the 3-attempt race spec used by
// /efficient's seeded escalation. (The standalone /fast race command was cut:
// racing first-line lost on both speed and accuracy in the mid benchmark —
// the engine survives as /efficient's escalation shape.)
export const RACE_ATTEMPTS=[
  {hint:''},
  {hint:'Prefer the smallest correct change. Do not refactor or reformat unrelated code.'},
  {hint:'Check edge cases and the full contract before finishing.'},
];
const SKIP_DIFF=new Set(['.git','node_modules','.suffice','.pi']);

export async function listFiles(dir,base=dir,out=[]){
  for(const e of await readdir(dir,{withFileTypes:true})){
    if(SKIP_DIFF.has(e.name)) continue;
    const p=join(dir,e.name);
    if(e.isDirectory()) await listFiles(p,base,out);
    else out.push(relative(base,p));
  }
  return out;
}

// Files that differ between `from` and `to`: changed = created or edited in `to`,
// deleted = present in `from` but gone in `to`.
export async function diffFiles(from,to){
  const fromFiles=new Set(await listFiles(from)),toFiles=await listFiles(to);
  const toSet=new Set(toFiles),changed=[],deleted=[];
  for(const rel of toFiles){
    if(!fromFiles.has(rel)){changed.push(rel);continue;}
    const next=await readFile(join(to,rel)),prior=await readFile(join(from,rel)).catch(()=>null);
    if(!prior||!next.equals(prior)) changed.push(rel);
  }
  for(const rel of fromFiles) if(!toSet.has(rel)) deleted.push(rel);
  return {changed,deleted};
}

// Deepest ancestor of `rel` inside `base` that is itself a symlink, or null.
// Path ops must not traverse it: deleting children through a linked dir would
// destroy the link's real target outside (or shared with) the worktree.
async function linkedAncestor(base,rel){
  let cur=base;
  for(const part of rel.split('/').slice(0,-1)){
    cur=join(cur,part);
    const st=await lstat(cur).catch(()=>null);
    if(!st) return null;
    if(st.isSymbolicLink()) return relative(base,cur);
  }
  return null;
}

// Replace a linked dir in `base` with a real directory holding the target's
// CURRENT contents (live sibling edits, nested .git/node_modules included),
// then file writes land on the worktree itself instead of through the link.
async function materializeLink(base,anc){
  const linkPath=join(base,anc);
  const target=await realpath(linkPath).catch(()=>null);
  if(target){
    const staged=`${linkPath}.materialize-${process.pid}`;
    try{
      // dereference:false keeps the target's nested links as links —
      // dereferencing would throw on dangling dependency symlinks. A
      // failed copy must propagate: an empty stand-in dir would silently
      // drop every unchanged sibling the link provided.
      await cp(target,staged,{recursive:true,dereference:false});
    }catch(err){await rm(staged,{recursive:true,force:true});throw err;}
    await rm(linkPath,{force:true});
    await rename(staged,linkPath);
    return;
  }
  // Link is already dangling — nothing to preserve, an empty dir suffices.
  await rm(linkPath,{force:true});
  await mkdir(linkPath,{recursive:true});
}

// Applies what the winning attempt changed relative to the pre-race snapshot onto
// the live worktree, so edits the user made during the race on other files survive.
export async function applyPatch(base,snapshot,attempt){
  const {changed,deleted}=await diffFiles(snapshot,attempt);
  for(const rel of changed){
    // Materialize every link on the write path: the target's own nested
    // links survive the staged copy, so a deeper link may still redirect
    // the write into a shared file — keep checking until the path is real.
    let anc;while((anc=await linkedAncestor(base,rel))) await materializeLink(base,anc);
    const to=join(base,rel);
    // A file-level link at the write target redirects the write too.
    if((await lstat(to).catch(()=>null))?.isSymbolicLink()) await rm(to,{force:true});
    await mkdir(dirname(to),{recursive:true});await writeFile(to,await readFile(join(attempt,rel)));
  }
  const pending=new Set(deleted);
  const byLink=new Map();
  for(const rel of deleted){
    const anc=await linkedAncestor(base,rel);
    if(anc) byLink.set(anc,[...(byLink.get(anc)??[]),rel]);
  }
  for(const [anc,rels] of byLink){
    const underLink=(await listFiles(join(snapshot,anc))).map(p=>join(anc,p));
    // Whole linked dir gone in the winner: remove only the link, never its target.
    if(underLink.every(p=>pending.has(p))){
      await rm(join(base,anc),{recursive:true,force:true});
      for(const p of rels) pending.delete(p);
    }
  }
  for(const rel of pending){
    // Partial deletions under a linked dir must materialize it first —
    // rm would otherwise traverse the link and destroy files in the target.
    let anc;while((anc=await linkedAncestor(base,rel))) await materializeLink(base,anc);
    await rm(join(base,rel),{force:true});
  }
  return changed.length+deleted.length;
}

export async function workspacePrefill(dir){
  const files=(await listFiles(dir)).sort(),cap=200;
  const shown=files.slice(0,cap);
  return 'Workspace layout ('+files.length+' files'+(files.length>cap?', first '+cap+' shown':'')+'):\n'+shown.join('\n')+'\n\nPrefer the smallest correct diff — targeted edits over full-file rewrites.';
}


