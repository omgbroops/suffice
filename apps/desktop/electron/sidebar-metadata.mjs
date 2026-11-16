import {readFile,realpath,stat} from 'node:fs/promises';
import {resolve,relative,sep,extname} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const exec=promisify(execFile),cache=new Map(),sessionCache=new Map();
const candidates=['favicon.svg','favicon.ico','favicon.png','public/favicon.svg','public/favicon.ico','public/favicon.png','app/favicon.ico','app/favicon.png','app/icon.svg','app/icon.png','app/icon.ico','src/favicon.ico','src/favicon.svg','src/app/favicon.ico','src/app/icon.svg','src/app/icon.png','assets/icon.svg','assets/icon.png','assets/logo.svg','assets/logo.png','.idea/icon.svg'];
async function image(root,name){try{const base=await realpath(root),file=await realpath(resolve(base,name));const rel=relative(base,file);if(rel==='..'||rel.startsWith('..'+sep))return null;const type={'.svg':'image/svg+xml','.png':'image/png','.ico':'image/x-icon','.jpg':'image/jpeg','.webp':'image/webp'}[extname(file).toLowerCase()];if(!type||(await stat(file)).size>256*1024)return null;return `data:${type};base64,${(await readFile(file)).toString('base64')}`;}catch{return null;}}
async function discoverIcon(cwd){
 let config={};try{config=JSON.parse(await readFile(resolve(cwd,'t3.json'),'utf8'));}catch{}
 const override=config.projectIcon;
 if(override&&['monogram','emoji','lucide'].includes(override.kind))return {projectIcon:override};
 for(const name of [config.iconPath,...candidates].filter(n=>typeof n==='string')){const url=await image(cwd,name);if(url)return {projectImage:url};}
 for(const name of ['index.html','public/index.html','app/routes/__root.tsx','src/routes/__root.tsx','app/root.tsx','src/root.tsx','src/index.html']){try{const source=(await readFile(resolve(cwd,name),'utf8')).slice(0,100000);const href=source.match(/<link\b(?=[^>]*\brel=["'](?:icon|shortcut icon)["'])(?=[^>]*\bhref=["']([^"'?]+))[^>]*>/i)?.[1];if(href&&!/^(?:[a-z]+:|\/\/)/i.test(href)){for(const local of [href.replace(/^\//,''),'public/'+href.replace(/^\//,'')]){const url=await image(cwd,local);if(url)return {projectImage:url};}}}catch{}}
 return {};
}
export async function projectMetadata(cwd){
 if(!cwd)return {};
 if(cache.get(cwd)?.until>Date.now())return cache.get(cwd).value;
 const value=(async()=>{
 const git=async args=>{try{return (await exec('git',['-C',cwd,...args],{windowsHide:true,timeout:2500,maxBuffer:1024*1024})).stdout.trim();}catch{return null;}};
 const [branch,dir,common,stats,identity]=await Promise.all([git(['symbolic-ref','--short','HEAD']),git(['rev-parse','--git-dir']),git(['rev-parse','--git-common-dir']),git(['diff','HEAD','--numstat']),discoverIcon(cwd)]);
 const diff=stats?stats.split('\n').reduce((v,line)=>{const [a,d]=line.split('\t');v.added+=Number(a)||0;v.removed+=Number(d)||0;return v;},{added:0,removed:0}):null;
 let pr=null;if(branch){try{const {stdout}=await exec('gh',['pr','view','--json','number,url,state,isDraft,statusCheckRollup,baseRefName'],{cwd,windowsHide:true,timeout:4000,maxBuffer:256*1024});const info=JSON.parse(stdout);pr={base:info.baseRefName,number:info.number,url:info.url,state:info.state,draft:info.isDraft,checks:info.statusCheckRollup?.some(c=>c.conclusion==='FAILURE')?'failed':info.statusCheckRollup?.some(c=>c.status!=='COMPLETED')?'pending':'passed'};}catch{}}
 let base=null;const candidates=[...(pr?.base?['refs/remotes/origin/'+pr.base,'refs/heads/'+pr.base]:[]),await git(['symbolic-ref','refs/remotes/origin/HEAD']),'refs/remotes/origin/main','refs/remotes/origin/master','refs/heads/main','refs/heads/master'].filter(Boolean);
 for(const ref of candidates){if(await git(['rev-parse','--verify',ref+'^{commit}'])){base=await git(['merge-base','HEAD',ref]);if(base)break;}}
 const branchStats=base?await git(['diff',base,'--numstat']):stats;
 const projectDiff=branchStats!==null?{...branchStats.split('\n').reduce((v,line)=>{const [a,d]=line.split('\t');v.added+=Number(a)||0;v.removed+=Number(d)||0;return v;},{added:0,removed:0}),scope:base?'branch':'working-tree',base:base||'HEAD'}:null;
 return {projectDiff,branch,worktree:!!(dir&&common&&resolve(cwd,dir)!==resolve(cwd,common)),diff,pr,...identity};
 })();cache.set(cwd,{until:Date.now()+30000,value});return value;
}
export function sidebarFromSessionTail(source){try{
 const entries=source.split('\n').filter(Boolean).flatMap(line=>{try{return [JSON.parse(line)];}catch{return [];}}),messages=entries.filter(e=>e.type==='message').map(e=>e.message),last=[...messages].reverse().find(m=>m.role==='assistant');
 const value={provider:last?.provider,model:last?.model,providerHistory:[...new Set(messages.filter(m=>m.role==='assistant'&&m.provider).map(m=>m.provider))],status:['error','aborted','length'].includes(last?.stopReason)?'failed':last?'done':'idle',error:last?.errorMessage};
 return value;
 }catch{return {};}}

export async function sessionMetadata(path){try{
 const info=await stat(path),key=`${info.mtimeMs}:${info.size}`;if(sessionCache.get(path)?.key===key)return sessionCache.get(path).value;
 const {open}=await import('node:fs/promises');const file=await open(path,'r');let source;try{const size=Math.min(info.size,512*1024),buffer=Buffer.alloc(size);await file.read(buffer,0,size,info.size-size);source=buffer.toString('utf8');if(info.size>size)source=source.slice(source.indexOf('\n')+1);}finally{await file.close();}
 const value=sidebarFromSessionTail(source);sessionCache.set(path,{key,value});return value;
 }catch{return {};}}

export function invalidateProjectMetadata(cwd){cache.delete(cwd);}

const identityCache=new Map();
export function projectIdentityMetadata(cwd){if(identityCache.get(cwd)?.until>Date.now())return identityCache.get(cwd).value;const value=discoverIcon(cwd).catch(()=>({}));identityCache.set(cwd,{value,until:Date.now()+30000});return value;}
