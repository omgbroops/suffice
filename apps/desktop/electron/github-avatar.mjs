import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const exec=promisify(execFile);
const OWNER=/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/;
// git@github.com:owner/repo.git, https://github.com/owner/repo, ssh://git@github.com/owner/repo
export function githubOwner(remote){const m=String(remote||'').trim().match(/github\.com[:/]([^/\s]+)\/[^/\s]+?(?:\.git)?\/?$/i);return m&&OWNER.test(m[1])?m[1]:null;}
export function createAvatarStore({dir,fetchImpl=globalThis.fetch,git=(cwd)=>exec('git',['-C',cwd,'remote','get-url','origin'],{timeout:3000,windowsHide:true}).then(r=>r.stdout)}){
 const memory=new Map(),misses=new Map();
 const file=owner=>resolve(dir,owner.toLowerCase()+'.png');
 const url=buffer=>`data:image/png;base64,${buffer.toString('base64')}`;
 // Fetched once per owner, then read from disk; a failed fetch is retried after an hour.
 async function avatar(owner){
  if(!owner)return null;const key=owner.toLowerCase();
  if(memory.has(key))return memory.get(key);
  try{const disk=await readFile(file(owner));memory.set(key,url(disk));return memory.get(key);}catch{}
  if(misses.get(key)>Date.now())return null;
  try{
   const response=await fetchImpl(`https://github.com/${encodeURIComponent(owner)}.png?size=64`,{signal:AbortSignal.timeout(5000)});
   const type=response.headers.get('content-type')||'';
   if(!response.ok||!/^image\/(png|jpeg|webp)/.test(type))throw new Error('no avatar');
   const buffer=Buffer.from(await response.arrayBuffer());if(!buffer.length||buffer.length>300000)throw new Error('bad avatar');
   await mkdir(dir,{recursive:true});await writeFile(file(owner),buffer);
   memory.set(key,url(buffer));return memory.get(key);
  }catch{misses.set(key,Date.now()+3600000);return null;}
 }
 const owners=new Map();
 async function forProject(cwd){
  if(!cwd)return null;
  if(!owners.has(cwd))owners.set(cwd,git(cwd).then(githubOwner).catch(()=>null));
  const owner=await owners.get(cwd);return owner?{owner,image:await avatar(owner)}:null;
 }
 return {avatar,forProject};
}
// The signed-in GitHub login: `gh` first, then the numeric noreply address git was configured with.
export async function githubLogin(run=(cmd,args)=>exec(cmd,args,{timeout:4000,windowsHide:true}).then(r=>r.stdout)){
 try{const login=(await run('gh',['api','user','--jq','.login'])).trim();if(OWNER.test(login))return login;}catch{}
 try{const email=(await run('git',['config','--global','user.email'])).trim();const m=email.match(/^(?:\d+\+)?([A-Za-z0-9-]+)@users\.noreply\.github\.com$/);if(m&&OWNER.test(m[1]))return m[1];}catch{}
 return null;
}
