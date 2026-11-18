import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdir,rm,readFile,writeFile,symlink,stat} from 'node:fs/promises';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
const exec=promisify(execFile);
const git=(cwd,args)=>exec('git',['-c','core.fsmonitor=false','-c','core.hooksPath=/dev/null','-C',cwd,...args],{windowsHide:true,timeout:60000,maxBuffer:256*1024*1024}).then(result=>result.stdout);
const tail=text=>String(text||'').trim().split('\n').slice(-12).join('\n').slice(-1500);

// Best-of-N: one prompt, N isolated detached worktrees, one winner applied to the project.
// shortcut: the kept patch applies as uncommitted changes and fails if the project's files moved on; upgrade to a 3-way merge.
export function createBestOfN({directory,runCandidate,testTimeout=120000}){
 const sessions=new Map();
 async function testsFor(cwd,project){
  let script;try{script=JSON.parse(await readFile(join(cwd,'package.json'),'utf8')).scripts?.test;}catch{}
  if(typeof script!=='string'||!script.trim())return {tests:'none'};
  // Share installed dependencies so the script can run in the fresh checkout; the link is untracked and was excluded from the patch already.
  await stat(join(project,'node_modules')).then(()=>symlink(join(project,'node_modules'),join(cwd,'node_modules'),'dir')).catch(()=>{});
  try{await exec(script,{cwd,shell:true,timeout:testTimeout,windowsHide:true,maxBuffer:8*1024*1024});return {tests:'pass'};}
  catch(error){return {tests:'fail',testOutput:tail(error.stdout+'\n'+error.stderr)};}
 }
 async function candidate(session,item,index,prompt){
  const started=Date.now(),cwd=item.cwd,out={index,provider:item.provider,model:item.model,label:item.label||item.model};
  try{
   const result=await runCandidate({cwd,prompt,model:item.model,provider:item.provider,effort:item.effort,clientId:`${session.id}-${index}`});
   await git(cwd,['add','-A']);
   const patch=await git(cwd,['diff','--cached','--binary',session.base]),numstat=(await git(cwd,['diff','--cached','--numstat',session.base])).split('\n').filter(Boolean).map(line=>line.split('\t'));
   item.patch=patch;
   Object.assign(out,{status:'done',text:String(result?.text||''),files:numstat.length,added:numstat.reduce((sum,row)=>sum+(Number(row[0])||0),0),removed:numstat.reduce((sum,row)=>sum+(Number(row[1])||0),0),usd:result?.usage?.estimatedApiUsd??null,costUnknown:!!result?.usage?.costUnknown,threadId:result?.threadId||null,...await testsFor(cwd,session.project)});
  }catch(error){Object.assign(out,{status:'failed',error:String(error.stderr||'').trim().split('\n').pop()||error.message,files:0,added:0,removed:0,tests:'none',usd:null});}
  out.ms=Date.now()-started;return out;
 }
 async function run({project,prompt,candidates}){
  if(!project)throw new Error('Choose a project above the composer first');
  if(typeof prompt!=='string'||!prompt.trim())throw new Error('Write a prompt to compare');
  if(!Array.isArray(candidates)||candidates.length<2||candidates.length>3)throw new Error('Choose two or three models');
  const base=(await git(project,['rev-parse','HEAD'])).trim(),id=randomUUID().slice(0,8),root=join(directory,'compare-'+id);
  await mkdir(root,{recursive:true});
  const session={id,project,base,root,items:[]};sessions.set(id,session);
  try{for(const [index,c] of candidates.entries()){if(typeof c?.model!=='string'||typeof c.provider!=='string')throw new Error('Invalid model');const cwd=join(root,String(index+1));await git(project,['worktree','add','--detach',cwd,base]);session.items.push({...c,cwd});}}
  catch(error){await discard(id);throw error;}
  const results=await Promise.all(session.items.map((item,index)=>candidate(session,item,index,prompt)));
  return {id,results};
 }
 async function discard(id){
  const session=sessions.get(id);if(!session)return false;sessions.delete(id);
  for(const item of session.items)await git(session.project,['worktree','remove','--force',item.cwd]).catch(()=>{});
  await rm(session.root,{recursive:true,force:true});await git(session.project,['worktree','prune']).catch(()=>{});return true;
 }
 async function keep(id,index){
  const session=sessions.get(id),item=session?.items[index];if(!item)throw new Error('This comparison is no longer open');
  if(item.patch){const file=join(session.root,'keep.patch');await writeFile(file,item.patch);await git(session.project,['apply','--whitespace=nowarn',file]).catch(error=>{throw new Error('Could not apply these changes to the project: '+tail(error.stderr||error.message));});}
  await discard(id);return {applied:!!item.patch};
 }
 return {run,keep,discard};
}
