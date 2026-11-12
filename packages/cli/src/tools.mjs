import {spawn} from 'node:child_process';
import {createCodingTools} from '@earendil-works/pi-coding-agent';
import {repositoryPath} from './workspace.mjs';
import {createNavigation} from './navigation.mjs';

const NATIVE_BY_ACCESS={
  read:['read'],
  edit:['read','edit','write'],
  full:['read','bash','edit','write'],
};

// Runs SUFFICE_GATE_CMD (the backend gate-hook) on the call; resolves only on exit 0.
function gateBash(command) {
  return new Promise((resolve,reject)=>{
    const child=spawn('/bin/sh',['-c',process.env.SUFFICE_GATE_CMD],{stdio:['pipe','ignore','pipe']});
    let stderr='';
    const fail=()=>{clearTimeout(timer);reject(new Error(stderr.trim()||'suffice gate: blocked'));};
    const timer=setTimeout(()=>{child.kill('SIGKILL');fail();},10000); // reject now: a grandchild holding stderr would delay 'close'
    child.stderr.on('data',d=>{stderr+=d;});
    child.stdin.on('error',()=>{});
    child.on('error',fail);
    child.on('close',code=>code===0?(clearTimeout(timer),resolve()):fail());
    child.stdin.end(JSON.stringify({tool_name:'Bash',tool_input:{command}}));
  });
}

export function repositoryTools({workspace, commandTimeout=180, shellPath, access='full'}) {
  if(!Object.hasOwn(NATIVE_BY_ACCESS,access)) throw new Error(`Unknown access level: ${access}`);
  const allowed=NATIVE_BY_ACCESS[access];
  const native=createCodingTools(workspace,{bash:{shellPath,exposeSessionEnvironment:false}}).filter(tool=>allowed.includes(tool.name));
  return [
    ...native.map(tool=>({...tool,label:tool.label??tool.name,
      async execute(id,args,signal,onUpdate) {
        if(tool.name!=='bash') await repositoryPath(workspace,args.path);
        else if(process.env.SUFFICE_GATE_CMD) await gateBash(args.command);
        if(tool.name==='bash') args={...args,timeout:Math.min(Math.max(args.timeout??commandTimeout,1),commandTimeout)};
        return tool.execute(id,args,signal,onUpdate);
      }
    })),
    ...createNavigation({workspace,includeTypeScript:true}).map(tool=>({...tool,
      async execute(id,args) {
        if(args.path) await repositoryPath(workspace,args.path);
        return tool.execute(id,args);
      }
    }))
  ];
}
