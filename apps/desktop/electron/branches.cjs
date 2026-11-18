const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const {mkdir}=require('node:fs/promises');
const {join}=require('node:path');
const {randomUUID}=require('node:crypto');
// Shared git runner (chat-git.mjs imports it). Project folders can be hostile repos: no fsmonitor, hooks or
// attribute-selected filters, no GIT_DIR/GIT_CONFIG_* from the parent env, and git older than 2.42 is refused
// because it ignores GIT_ATTR_SOURCE.
const EMPTY_TREE='4b825dc642cb6eb9a060e54bf8d69288fbee4904';
const HARDEN=['--no-optional-locks','-c','core.fsmonitor=false','-c','core.hooksPath=/dev/null'];
// Every inherited GIT_* goes (DIR, WORK_TREE, COMMON_DIR, INDEX_FILE, OBJECT_DIRECTORY, EXEC_PATH, CONFIG_*...); match is case-insensitive for Windows.
function cleanEnv(env){
 const out={};
 for(const [key,value] of Object.entries(env))if(!key.toUpperCase().startsWith('GIT_'))out[key]=value;
 return {...out,GIT_TERMINAL_PROMPT:'0',GIT_ATTR_SOURCE:EMPTY_TREE};
}
function gitVersionOk(text){const m=/git version (\d+)\.(\d+)/.exec(String(text));return !!m&&(+m[1]>2||(+m[1]===2&&+m[2]>=42));}
function createRunner(exec=promisify(execFile)){
 const run=(args,cwd,{timeout=30000}={})=>exec('git',args,{cwd,windowsHide:true,timeout,maxBuffer:4*1024*1024,env:cleanEnv(process.env)}).then(r=>r.stdout.trim());
 let checked;
 // Only a pass is cached, so upgrading git is picked up without a restart.
 const ensure=()=>checked??=run(['--version']).then(v=>{if(!gitVersionOk(v))throw new Error(`Git 2.42 or newer is required (found: ${v||'unknown'})`);}).catch(e=>{checked=undefined;throw e;});
 const git=async(cwd,args,options)=>{if(typeof cwd!=='string'||!cwd)throw new Error('No project selected');await ensure();return run([...HARDEN,'-C',cwd,...args],cwd,options);};
 return {git};
}
const {git}=createRunner();
async function list(cwd){
 if(!cwd)return {branches:[],current:null};
 try{await git(cwd,['rev-parse','--show-toplevel']);}catch{return {branches:[],current:null};}
 const text=await git(cwd,['for-each-ref','--format=%(refname)%09%(refname:short)%09%(objectname)%09%(upstream:short)','refs/heads','refs/remotes']);
 let current=null;try{current=await git(cwd,['symbolic-ref','--short','HEAD']);}catch{}
 return {current,branches:text.split('\n').filter(Boolean).map(line=>{const [ref,name,commit,upstream]=line.split('\t');return {ref,name,commit,upstream,remote:ref.startsWith('refs/remotes/')};}).filter(row=>!row.ref.endsWith('/HEAD'))};
}
async function select(cwd,{ref,newWorktree},directory){
 if(typeof ref!=='string'||typeof newWorktree!=='boolean')throw new Error('Invalid branch selection');
 const state=await list(cwd),entry=state.branches.find(row=>row.ref===ref);if(!entry)throw new Error('Branch no longer exists. Reopen the picker.');
 if(newWorktree){const id=randomUUID(),target=join(directory,id),name='suffice/session-'+id.slice(0,8);await mkdir(directory,{recursive:true});await git(cwd,['worktree','add','-b',name,'--',target,entry.commit]);return {path:target,branch:name,newWorktree:true};}
 let name=entry.name;
 if(entry.remote){const tracked=state.branches.find(row=>!row.remote&&row.upstream===entry.name);if(tracked)name=tracked.name;else{const local=entry.name.slice(entry.name.indexOf('/')+1);if(state.branches.some(row=>!row.remote&&row.name===local))throw new Error('A different local branch has this name. Select it explicitly or use New worktree.');await git(cwd,['checkout','--track','--end-of-options',entry.name,'--']);return {path:cwd,branch:local,newWorktree:false};}}
 await git(cwd,['checkout','--end-of-options',name,'--']);return {path:cwd,branch:name,newWorktree:false};
}
module.exports={list,select,createRunner,gitVersionOk,cleanEnv,git,HARDEN};
