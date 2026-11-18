// Isolated git worktree per thread. State lives in git itself: a linked worktree whose branch carries branch.<name>.sufficebase.
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const {mkdir}=require('node:fs/promises');
const {join,resolve}=require('node:path');
const {randomUUID}=require('node:crypto');
const exec=promisify(execFile);
const run=async(file,cwd,args,timeout=30000)=>(await exec(file,args,{cwd,windowsHide:true,timeout,maxBuffer:8*1024*1024})).stdout.trim();
const git=(cwd,args)=>run('git',cwd,['-c','core.fsmonitor=false','-c','core.hooksPath=/dev/null',...args]);
const PATCH_LIMIT=400000;

async function create(repo,directory){
 const top=await git(repo,['rev-parse','--show-toplevel']).catch(()=>{throw new Error('Worktrees need a Git project');});
 const base=await git(top,['rev-parse','HEAD']).catch(()=>{throw new Error('Make one commit before using a worktree');});
 const id=randomUUID().slice(0,8),branch='agent/'+id,path=join(directory,id);
 await mkdir(directory,{recursive:true});
 await git(top,['worktree','add','-b',branch,path,base]);
 await git(top,['config','branch.'+branch+'.sufficebase',base]);
 return {path,branch};
}

// null unless cwd is a worktree made by create().
async function info(cwd){
 if(!cwd)return null;
 let dirs;try{dirs=(await git(cwd,['rev-parse','--path-format=absolute','--git-dir','--git-common-dir','--show-toplevel'])).split('\n');}catch{return null;}
 const [dir,common,top]=dirs;if(dir===common)return null;
 let branch;try{branch=await git(top,['symbolic-ref','--short','HEAD']);}catch{return null;}
 let base;try{base=await git(top,['config','--get','branch.'+branch+'.sufficebase']);}catch{return null;}
 const repo=resolve(common,'..');let target=null;try{target=await git(repo,['symbolic-ref','--short','HEAD']);}catch{}
 return {top,branch,base,repo,target};
}
async function status(cwd){
 const i=await info(cwd);if(!i)return null;
 const files=(await git(i.top,['status','--porcelain'])).split('\n').filter(Boolean).length;
 const commits=Number(await git(i.top,['rev-list','--count',i.base+'..HEAD']));
 return {branch:i.branch,path:i.top,target:i.target,files,commits};
}
async function need(cwd){const i=await info(cwd);if(!i)throw new Error('This thread has no worktree');return i;}
async function commitAll(i,message){
 await git(i.top,['add','-A']);
 if(!(await git(i.top,['status','--porcelain'])))return;
 const named=await git(i.top,['config','user.email']).catch(()=>'');
 await git(i.top,[...(named?[]:['-c','user.name=Suffice','-c','user.email=suffice@localhost']),'commit','-m',message]);
}
async function diff(cwd){
 const i=await need(cwd);await git(i.top,['add','-A']);
 const stat=await git(i.top,['diff','--cached','--stat',i.base]),patch=await git(i.top,['diff','--cached',i.base]);
 return {branch:i.branch,stat,patch:patch.slice(0,PATCH_LIMIT),truncated:patch.length>PATCH_LIMIT};
}
async function merge(cwd){
 const i=await need(cwd);if(!i.target)throw new Error('The main checkout is on a detached HEAD; check out a branch first');
 await commitAll(i,'Work from '+i.branch);
 try{await git(i.repo,['merge','--no-ff','-m','Merge '+i.branch,i.branch]);}
 catch(error){await git(i.repo,['merge','--abort']).catch(()=>{});throw new Error('Merge into '+i.target+' failed: '+String(error.stderr||error.message).split('\n').find(Boolean));}
 await git(i.top,['config','branch.'+i.branch+'.sufficebase',await git(i.top,['rev-parse','HEAD'])]);
 return {target:i.target};
}
async function pr(cwd,{dryRun}={}){
 const i=await need(cwd);await commitAll(i,'Work from '+i.branch);
 const commands=[['git','push','-u','origin',i.branch],['gh','pr','create','--fill','--head',i.branch,...(i.target?['--base',i.target]:[])]];
 if(dryRun)return {dryRun:true,commands:commands.map(c=>c.join(' '))};
 await git(i.top,['push','-u','origin',i.branch]);
 return {url:await run('gh',i.top,commands[1].slice(1),60000)};
}
async function discard(cwd){
 const i=await need(cwd);
 await git(i.repo,['worktree','remove','--force',i.top]);await git(i.repo,['branch','-D',i.branch]);
 return {repo:i.repo};
}
module.exports={create,status,diff,merge,pr,discard};
