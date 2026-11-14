// The only place git and gh are spawned. Project folders can be hostile repos, so every git call
// runs with fsmonitor and hooks off, and user-derived arguments belong after `--`.
const {promisify}=require('node:util');
const {execFile}=require('node:child_process');
const path=require('node:path');
// Apps started from Finder get a bare PATH; add the usual tool locations.
const PATH=[process.env.PATH,'/opt/homebrew/bin','/usr/local/bin',path.join(process.env.HOME||'','.local/bin'),path.join(process.env.HOME||'','.local/share/mise/shims')].filter(Boolean).join(path.delimiter);
// Attributes come from the empty tree, so a hostile repo's .gitattributes can't select a clean/smudge filter or diff driver.
// Git older than 2.42 ignores GIT_ATTR_SOURCE, so the runner refuses to call it at all.
const EMPTY_TREE='4b825dc642cb6eb9a060e54bf8d69288fbee4904';
const HARDEN=['--no-optional-locks','-c','core.fsmonitor=false','-c','core.hooksPath=/dev/null'];

function gitArgs(root,args){
 if(typeof root!=='string'||!root)throw new Error('No project selected');
 return [...HARDEN,'-C',root,...args];
}
// A caller-supplied GIT_DIR or GIT_CONFIG_* would redirect git away from the folder we pass.
function cleanEnv(env){
 const out={...env,PATH,GH_PROMPT_DISABLED:'1',GIT_TERMINAL_PROMPT:'0',GIT_ATTR_SOURCE:EMPTY_TREE};
 for(const key of Object.keys(out))if(key==='GIT_DIR'||key==='GIT_WORK_TREE'||key.startsWith('GIT_CONFIG'))delete out[key];
 return out;
}
function gitVersionOk(text){
 const m=/git version (\d+)\.(\d+)/.exec(String(text));
 return !!m&&(+m[1]>2||(+m[1]===2&&+m[2]>=42));
}
function createRunner(exec=promisify(execFile)){
 const run=(cmd,args,cwd,{timeout=15000,maxBuffer=4*1024*1024,raw=false}={})=>
  exec(cmd,args,{cwd,windowsHide:true,timeout,maxBuffer,env:cleanEnv(process.env)}).then(r=>raw?r.stdout:r.stdout.trim());
 let checked;
 const ensureGit=()=>checked??=run('git',['--version']).then(v=>{
  if(!gitVersionOk(v))throw new Error(`Git 2.42 or newer is required (found: ${v||'unknown'})`);
 });
 const git=(root,args,options)=>{
  const full=gitArgs(root,args);
  return ensureGit().then(()=>run('git',full,root,options));
 };
 return {run,git};
}
module.exports={...createRunner(),createRunner,gitArgs,gitVersionOk,HARDEN};
