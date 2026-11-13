// The only place git and gh are spawned. Project folders can be hostile repos, so every git call
// runs with fsmonitor and hooks off, and user-derived arguments belong after `--`.
const {promisify}=require('node:util');
const {execFile}=require('node:child_process');
const path=require('node:path');
// Apps started from Finder get a bare PATH; add the usual tool locations.
const PATH=[process.env.PATH,'/opt/homebrew/bin','/usr/local/bin',path.join(process.env.HOME||'','.local/bin'),path.join(process.env.HOME||'','.local/share/mise/shims')].filter(Boolean).join(path.delimiter);
// Attributes come from the empty tree, so a hostile repo's .gitattributes can't select a clean/smudge filter or diff driver.
// shortcut: git older than 2.42 ignores GIT_ATTR_SOURCE; require 2.42+ or read filter.* names and blank them per call.
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
function createRunner(exec=promisify(execFile)){
 const run=(cmd,args,cwd,{timeout=15000,maxBuffer=4*1024*1024,raw=false}={})=>
  exec(cmd,args,{cwd,windowsHide:true,timeout,maxBuffer,env:cleanEnv(process.env)}).then(r=>raw?r.stdout:r.stdout.trim());
 const git=(root,args,options)=>run('git',gitArgs(root,args),root,options);
 return {run,git};
}
module.exports={...createRunner(),createRunner,gitArgs,HARDEN};
