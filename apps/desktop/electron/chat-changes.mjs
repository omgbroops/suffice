import {createHash,randomUUID} from 'node:crypto';
import {mkdir,readFile,writeFile,rename,readdir,lstat,realpath,rm} from 'node:fs/promises';
import {resolve,relative,isAbsolute,sep,dirname,basename} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {diffLines} from 'diff';
const exec=promisify(execFile),active=new Map();
const maxFile=2*1024*1024,maxTotal=64*1024*1024,maxFiles=10000;
const excluded=new Set(['.git','node_modules','.suffice','.next','dist','build','coverage','target','.venv']);
const ledgerPath=(home,id)=>typeof id==='string'&&/^[a-f0-9]{32}$/.test(id)?resolve(home,'chat-changes',id+'.json'):null;
function totals(state){let added=0,removed=0,files=0,partial=state.partial;for(const record of Object.values(state.files)){if(record.before===record.after)continue;const parts=diffLines(record.before,record.after,{timeout:100,maxEditLength:10000});if(!parts){partial=true;continue;}files++;for(const part of parts){if(part.added)added+=part.count;if(part.removed)removed+=part.count;}}return {added,removed,files,partial,scope:'chat'};}
export async function readChatChanges(home,id){const path=ledgerPath(home,id);if(!path)return null;try{const state=JSON.parse(await readFile(path.replace('.json','.summary.json'),'utf8'));return state?.scope==='chat'?state:null;}catch{return null;}}
// Local snapshots are receipts only: no stash, index writes, checkout or reset.
export function createChatChangeTracker({cwd,home,getId,onChange=()=>{}}){
 let state={version:1,root:resolve(cwd),files:{},partial:false},loading,tail=Promise.resolve();
 let turnState={files:{},partial:false};
 let canonicalRoot,key,operations;
 async function initialize(){canonicalRoot??=await realpath(cwd);key=process.platform==='win32'?canonicalRoot.toLowerCase():canonicalRoot;operations=resolve(home,'chat-change-activity',createHash('sha256').update(key).digest('hex'));}
 const overlaps=(a,b)=>!a||!b||a.some(path=>b.includes(path));
 // Resolve directory aliases while keeping the final component intact for symlink checks.
 async function toolTarget(path){const logical=resolve(cwd,path),suffix=[basename(logical)];let parent=dirname(logical);for(;;){try{return resolve(await realpath(parent),...suffix);}catch(error){if(error.code!=='ENOENT')throw error;const next=dirname(parent);if(next===parent)throw error;suffix.unshift(basename(parent));parent=next;}}}
 async function peers(token){
  for(const name of await readdir(operations)){if(!name.endsWith('.json')||name===token.operation+'.json')continue;
   let other;try{other=JSON.parse(await readFile(resolve(operations,name),'utf8'));}catch{continue;}
   try{process.kill(other.pid,0);}catch(error){if(error.code==='ESRCH'){await rm(resolve(operations,name),{force:true});continue;}}
   if(overlaps(token.names,other.names)){token.conflict=true;await Promise.all([writeFile(resolve(operations,token.operation+'.conflict'),''),writeFile(resolve(operations,name.replace('.json','.conflict')),'')]);}
  }
  try{await lstat(resolve(operations,token.operation+'.conflict'));token.conflict=true;}catch{}
 }

 async function load(){if(!loading)loading=(async()=>{try{const path=ledgerPath(home,getId());if(path){const saved=JSON.parse(await readFile(path,'utf8'));if(saved.version===1&&saved.files&&typeof saved.files==='object')state=saved.root&&resolve(saved.root)!==resolve(cwd)?{version:1,root:resolve(cwd),files:{},partial:true}:{...saved,root:resolve(cwd)};}}catch{}})();await loading;}
 async function text(name){const path=resolve(cwd,name),rel=relative(cwd,path);if(isAbsolute(rel)||rel==='..'||rel.startsWith('..'+sep))return null;try{const info=await lstat(path);if(!info.isFile()||info.isSymbolicLink()||info.size>maxFile)return null;const actual=await realpath(path),inside=relative(canonicalRoot,actual);if(isAbsolute(inside)||inside==='..'||inside.startsWith('..'+sep))return null;const bytes=await readFile(path);if(bytes.length>maxFile||bytes.includes(0))return null;return new TextDecoder('utf-8',{fatal:true}).decode(bytes);}catch(error){if(error.code==='ENOENT')return '';return null;}}
 async function snapshot(names){let partial=false;if(!names){try{const {stdout}=await exec('git',['-C',cwd,'ls-files','--cached','--others','--exclude-standard','-z'],{windowsHide:true,timeout:5000,maxBuffer:8*1024*1024});names=[...new Set(stdout.split('\0').filter(Boolean))];}catch{names=[];const walk=async dir=>{for(const entry of await readdir(resolve(cwd,dir),{withFileTypes:true})){if(excluded.has(entry.name)||entry.isSymbolicLink())continue;const name=dir?dir+'/'+entry.name:entry.name;if(names.length>=maxFiles){partial=true;return;}if(entry.isDirectory())await walk(name);else if(entry.isFile())names.push(name);}};await walk('');}}
  const values=new Map();let bytes=0;if(names.length>maxFiles)partial=true;
  for(const name of names.slice(0,maxFiles)){const value=await text(name);if(value===null){partial=true;continue;}bytes+=Buffer.byteLength(value);if(bytes>maxTotal){partial=true;break;}values.set(name,value);}
  return {values,partial};
 }
 async function save(){const path=ledgerPath(home,getId());if(!path)return;state.summary=totals(state);const value=JSON.stringify(state);const summary=state.summary;tail=tail.catch(()=>{}).then(async()=>{await mkdir(resolve(home,'chat-changes'),{recursive:true,mode:0o700});const temporary=path+'.tmp';await writeFile(temporary,value,{mode:0o600});await rename(temporary,path);const summaryPath=path.replace('.json','.summary.json');await writeFile(summaryPath+'.tmp',JSON.stringify(summary),{mode:0o600});await rename(summaryPath+'.tmp',summaryPath);onChange(summary,{...totals(turnState),scope:'turn'});});await tail;}
 return {
  async beginTurn(){await tail;turnState={files:{},partial:false};},
  async before(name,args){if(!['write','edit','bash','powershell'].includes(name))return null;await initialize();await load();const names=['bash','powershell'].includes(name)?null:[relative(canonicalRoot,await toolTarget(args.path)).split(sep).join('/')];const token={names,conflict:false,operation:randomUUID()};const others=active.get(key)||new Set();for(const other of others){if(!names||!other.names||names.some(path=>other.names.includes(path)))token.conflict=other.conflict=true;}others.add(token);active.set(key,others);
   try{await mkdir(operations,{recursive:true,mode:0o700});await writeFile(resolve(operations,token.operation+'.json'),JSON.stringify({pid:process.pid,names}),{mode:0o600});await peers(token);token.before=await snapshot(names);}catch{token.before={values:new Map(),partial:true};token.conflict=true;}return token;
  },
  async after(token){if(!token)return;try{const after=await snapshot(token.names);await peers(token);state.partial ||= token.before.partial||after.partial||token.conflict;turnState.partial ||= token.before.partial||after.partial||token.conflict;
   for(const name of new Set([...token.before.values.keys(),...after.values.keys()])){const before=token.before.values.get(name)??'',current=after.values.get(name)??'';if(before===current)continue;for(const ledger of [state,turnState]){if(token.conflict||!token.before.values.has(name)&&token.before.partial||!after.values.has(name)&&after.partial){delete ledger.files[name];ledger.partial=true;continue;}
    const record=ledger.files[name];if(record&&record.after!==before){delete ledger.files[name];ledger.partial=true;continue;}const next={before:record?.before??before,after:current};const bytes=Object.entries(ledger.files).reduce((n,[path,r])=>path===name?n:n+Buffer.byteLength(r.before)+Buffer.byteLength(r.after),0)+Buffer.byteLength(next.before)+Buffer.byteLength(next.after);if(bytes>maxTotal){delete ledger.files[name];ledger.partial=true;continue;}ledger.files[name]=next;
}
   }await save();
  }catch{state.partial=true;await save().catch(()=>{});}finally{await Promise.all([rm(resolve(operations,token.operation+'.json'),{force:true}),rm(resolve(operations,token.operation+'.conflict'),{force:true})]).catch(()=>{});active.get(key)?.delete(token);if(!active.get(key)?.size)active.delete(key);}},
  async flush(){await load();await save();return state.summary;}
 };
}
