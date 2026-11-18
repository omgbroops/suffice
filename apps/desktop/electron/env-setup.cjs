const {spawn,execFile}=require('node:child_process');
const {readFile,writeFile,mkdir,realpath}=require('node:fs/promises');
const {createHash}=require('node:crypto');
const {promisify}=require('node:util');
const path=require('node:path');
const exec=promisify(execFile);
const LOCKS=['bun.lock','bun.lockb','package-lock.json','pnpm-lock.yaml','yarn.lock','Cargo.lock','uv.lock','poetry.lock','Gemfile.lock','go.sum','composer.lock'];
const LIMIT=10*60*1000;
// The cache key covers the script and every lockfile, so editing either re-runs setup.
async function fingerprint(cwd,script){const hash=createHash('sha256').update(script);for(const name of LOCKS){try{hash.update('\0'+name+'\0').update(await readFile(path.join(cwd,name)));}catch{}}return hash.digest('hex');}
// A worktree has no record of its own: fall back to the checkout that owns it.
async function ownerPath(cwd){try{const {stdout}=await exec('git',['-C',cwd,'rev-parse','--path-format=absolute','--git-common-dir'],{timeout:5000,windowsHide:true});const common=stdout.trim();return path.basename(common)==='.git'?path.dirname(common):null;}catch{return null;}}
exports.scriptFor=async(cwd,items)=>{const real=async p=>realpath(p).catch(()=>path.resolve(p));const rows=await Promise.all(items.map(async p=>({...p,path:await real(p.path)}))),at=await real(cwd);items=rows;cwd=at;const same=(a,b)=>a===b,own=item=>typeof item?.envSetup==='string'&&item.envSetup.trim()?item.envSetup:'';let script=own(items.find(p=>same(p.path,cwd)));if(script)return script;const owner=await ownerPath(cwd).then(o=>o&&real(o));return owner&&!same(owner,cwd)?own(items.find(p=>same(p.path,owner))):'';};
exports.createEnvSetup=({file})=>{
 const live=new Map();
 const cache=async()=>{try{return JSON.parse(await readFile(file,'utf8'));}catch{return {};}};
 async function execute(cwd,script,emit){
  const hash=await fingerprint(cwd,script),known=await cache();
  if(known[cwd]?.hash===hash){emit({phase:'skipped',at:known[cwd].at});return {ran:false};}
  emit({phase:'start',script});
  const code=await new Promise(resolve=>{
   const child=spawn(script,{cwd,shell:true,windowsHide:true,stdio:['ignore','pipe','pipe']});let sent=0;
   const timer=setTimeout(()=>child.kill(),LIMIT);
   const chunk=data=>{if(sent>200000)return;const text=data.toString('utf8').slice(0,64000);sent+=text.length;emit({phase:'output',text});};
   child.stdout.on('data',chunk);child.stderr.on('data',chunk);
   child.on('error',error=>{clearTimeout(timer);emit({phase:'output',text:error.message+'\n'});resolve(1);});
   child.on('close',status=>{clearTimeout(timer);resolve(status??1);});
  });
  if(code!==0){emit({phase:'failed',code});throw new Error('Environment setup failed (exit '+code+'). Fix it in Settings > Projects & Git.');}
  const at=Date.now();await mkdir(path.dirname(file),{recursive:true});await writeFile(file,JSON.stringify({...await cache(),[cwd]:{hash,at}}),{mode:0o600});
  emit({phase:'done',at});return {ran:true};
 }
 // Two chats opening one worktree share a single run; the second just waits for it.
 const run=(cwd,script,emit)=>{if(live.has(cwd))return live.get(cwd);const job=execute(cwd,script,emit).finally(()=>live.delete(cwd));live.set(cwd,job);return job;};
 return {run,status:async(cwd)=>(await cache())[cwd]?.at||null};
};
