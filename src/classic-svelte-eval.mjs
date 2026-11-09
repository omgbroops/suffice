import {readFile} from 'node:fs/promises';
import {resolve,relative,isAbsolute} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {svelteTask} from './svelte-intelligence-pilot.mjs';
const exec=promisify(execFile);

/** Expand only the audited classic compiler build commands, without a shell. */
export function classicBuildSteps(pkg){
  const expand=(name,seen=new Set())=>{
    if(seen.has(name)||typeof pkg.scripts?.[name]!=='string')throw new Error('Missing or recursive build script: '+name);
    seen=new Set([...seen,name]);
    return pkg.scripts[name].split('&&').flatMap(command=>{
      command=command.trim();let match;
      if((match=/^npm run ([\w:-]+)$/.exec(command)))return expand(match[1],seen);
      if((match=/^node ([\w./-]+\.js)$/.exec(command)))return [[match[1]]];
      if((match=/^rollup -c(?: ([\w./-]+\.js))?$/.exec(command)))return [['node_modules/rollup/bin/rollup','-c',...(match[1]?[match[1]]:[])]];
      throw new Error('Unaudited build command: '+command);
    });
  };
  const steps=expand('build');
  for(const args of steps)for(const path of [args[0],...(args[2]?[args[2]]:[])])if(isAbsolute(path)||path.split('/').includes('..'))throw new Error('Build path escapes workspace');
  return steps;
}
export async function buildClassic(workspace,steps){
  const started=performance.now(),logs=[];
  for(const args of steps){
    const path=resolve(workspace,args[0]),within=relative(workspace,path);
    if(isAbsolute(within)||within==='..'||within.startsWith('..\\')||within.startsWith('../'))throw new Error('Build path escapes workspace');
    try{const result=await exec(resolve(workspace,'node_modules/.suffice-node16/node.exe'),['--max-old-space-size=384',...args],{cwd:workspace,windowsHide:true,timeout:120000,maxBuffer:2*1024**2,env:{...process.env,NODE_OPTIONS:''}});logs.push({args,...result});}
    catch(error){return {status:'build_failed',error:error.message,stdout:error.stdout,stderr:error.stderr,logs,latencyMs:performance.now()-started};}
  }
  return {status:'passed',logs,latencyMs:performance.now()-started};
}
export async function classicTask(directory,record){
  const validation=JSON.parse(await readFile(resolve(directory,'validation.json'),'utf8'));
  if(!validation.valid)throw new Error('Real-task empty/reference gates failed');
  const result=await svelteTask({directory,taskRecord:record,buildProject:workspace=>buildClassic(workspace,validation.buildSteps),promptNotes:`The native adaptation omits Nightmare/Electron and these native-incompatible runtime samples: ${validation.nativeEnvironment?.excludedRuntimeSamples.join(', ')||'(none)'}. Their SSR cases remain enabled. These original, unscored failures may remain: ${validation.knownFailures.join('; ')||'(none)'}. Existing pending tests are preserved. Independent grading retains all official target and required regression titles.`});
  result.task.category=record.evaluation.category;result.task.kind='real-upstream-v3';
  result.task.prompt+='\n\nRun build and test commands one at a time to respect this machine\'s available memory.';
  return result;
}
