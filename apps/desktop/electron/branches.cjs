const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const {mkdir}=require('node:fs/promises');
const {join}=require('node:path');
const {randomUUID}=require('node:crypto');
const exec=promisify(execFile);
const git=async(cwd,args)=>(await exec('git',['-c','core.fsmonitor=false','-c','core.hooksPath=/dev/null','-C',cwd,...args],{windowsHide:true,timeout:30000,maxBuffer:4*1024*1024})).stdout.trim();
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
 if(newWorktree){const id=randomUUID(),target=join(directory,id),name='suffice/session-'+id.slice(0,8);await mkdir(directory,{recursive:true});await git(cwd,['worktree','add','-b',name,target,entry.commit]);return {path:target,branch:name,newWorktree:true};}
 let name=entry.name;
 if(entry.remote){const tracked=state.branches.find(row=>!row.remote&&row.upstream===entry.name);if(tracked)name=tracked.name;else{const local=entry.name.slice(entry.name.indexOf('/')+1);if(state.branches.some(row=>!row.remote&&row.name===local))throw new Error('A different local branch has this name. Select it explicitly or use New worktree.');await git(cwd,['checkout','--track',entry.name,'--']);return {path:cwd,branch:local,newWorktree:false};}}
 await git(cwd,['checkout',name,'--']);return {path:cwd,branch:name,newWorktree:false};
}
module.exports={list,select};
