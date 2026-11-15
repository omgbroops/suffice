import {mkdir,readFile,writeFile,rename,realpath} from 'node:fs/promises';
import {resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const exec=promisify(execFile);
const receipt=(home,id)=>/^[a-f0-9]{32}$/.test(id||'')?resolve(home,'chat-git',id+'.json'):null;
const rootKey=async cwd=>{const path=await realpath(cwd).catch(()=>resolve(cwd));return process.platform==='win32'?path.toLowerCase():path;};
const sameRoot=async(a,b)=>{const [left,right]=await Promise.all([rootKey(a),rootKey(b)]);return left===right;};
export async function readChatGit(home,id,cwd){try{const value=JSON.parse(await readFile(receipt(home,id),'utf8'));return value.version===1&&value.scope==='chat'&&(!cwd||!value.root||await sameRoot(value.root,cwd))?value:null;}catch{return null;}}
async function writeReceipt(home,id,state){const file=receipt(home,id);if(!file)throw new Error('Invalid chat Git receipt');await mkdir(resolve(home,'chat-git'),{recursive:true});const temporary=file+'.'+randomUUID()+'.tmp';await writeFile(temporary,JSON.stringify(state),{mode:0o600});await rename(temporary,file);}
export async function stampChatGitRoot(home,id,cwd){const state=await readChatGit(home,id);if(state&&!state.root)await writeReceipt(home,id,{...state,root:resolve(cwd)});}
export async function bindChatGitToProject(home,id,cwd){
 const previous=await readChatGit(home,id);if(previous?.root&&await sameRoot(previous.root,cwd))return previous;
 const {previousContexts=[],...context}=previous||{};
 const state={version:1,scope:'chat',root:resolve(cwd),...await snapshot(cwd),pr:null,...(previous?{previousContexts:[...previousContexts,context]}:{})};
 await writeReceipt(home,id,state);return state;
}
async function snapshot(cwd){const git=async args=>{try{return (await exec('git',['-C',cwd,...args],{windowsHide:true,timeout:3000})).stdout.trim();}catch{return null;}};const [branch,dir,common]=await Promise.all([git(['symbolic-ref','--short','HEAD']),git(['rev-parse','--git-dir']),git(['rev-parse','--git-common-dir'])]);return {branch,worktree:!!(dir&&common&&resolve(cwd,dir)!==resolve(cwd,common)),gitAvailable:!!dir};}
export function chatGitProjection(project,chat){const {branch,pr,worktree,diff,...identity}=project;return {...identity,branch:chat?.branch??null,worktree:chat?.worktree??false,pr:chat?.pr??null,gitUnknown:!chat,branchMismatch:!!(chat?.branch&&branch&&chat.branch!==branch)};}
export function createChatGitTracker({cwd,home,getId,onChange=()=>{}}){
 let state,tail=Promise.resolve();
 async function save(){const id=getId();if(!receipt(home,id)||!state)return;state.root=resolve(cwd);const saved=structuredClone(state);tail=tail.catch(()=>{}).then(async()=>{await writeReceipt(home,id,saved);onChange();});await tail;}
 return {
  async initialize(newlyCreated){state=await readChatGit(home,getId());if(state?.root&&!(await sameRoot(state.root,cwd)))state=await bindChatGitToProject(home,getId(),cwd);if(!state&&newlyCreated){state={version:1,scope:'chat',...await snapshot(cwd),pr:null};await save();}},
  async after(_token,{name,args,result,error}={}){
   if(!['bash','powershell'].includes(name)||error||!result||result.isError||result.details?.exit_code&&result.details.exit_code!==0)return;
   const command=String(args?.command||'').trim();
   // Only direct calls: avoid treating mentions, compound commands or arbitrary output as provenance.
   if(/[\n;&|`]/.test(command))return;
   if(/^git\s+(?:switch|checkout)\s/.test(command)){state??={version:1,scope:'chat',pr:null};Object.assign(state,await snapshot(cwd));await save();}
   if(!/^gh\s+pr\s+create(?:\s|$)/.test(command))return;
   const text=(result.content||[]).filter(p=>p.type==='text').map(p=>p.text).join('\n');const urls=[...text.matchAll(/^https:\/\/github\.com\/[^/\s]+\/[^/\s]+\/pull\/(\d+)\s*$/gm)];if(urls.length!==1)return;
   state??={version:1,scope:'chat',branch:null,worktree:false};state.pr={url:urls[0][0].trim(),number:Number(urls[0][1]),state:'UNKNOWN',checks:'unknown'};await save();
  },
 };
}
