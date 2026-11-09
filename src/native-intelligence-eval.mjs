import {cp,mkdir,writeFile,symlink,lstat,readFile,readdir,readlink,realpath} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {snapshot,initializeWorkspaceGit} from './intelligence-eval.mjs';
import {hash} from './workspace.mjs';
const exec=promisify(execFile);
export const copySource=(from,to)=>cp(from,to,{recursive:true,filter:p=>!p.split(/[\\/]/).some(s=>s==='node_modules'||s==='.git')});
export async function linkDependencies(workspace,dependencies){
  const target=resolve(workspace,'node_modules');
  try{const entry=await lstat(target);if(entry.isSymbolicLink()&&(await realpath(target)).toLowerCase()===(await realpath(resolve(dependencies,'node_modules'))).toLowerCase())return;throw new Error('Dependency destination already exists');}catch(e){if(e.code!=='ENOENT')throw e;}
  await symlink(resolve(dependencies,'node_modules'),target,process.platform==='win32'?'junction':'dir');
}
export async function applyPatch(workspace,patch,path){
  const {stdout}=await exec('git',['rev-parse','--show-toplevel'],{cwd:workspace,windowsHide:true});
  if(resolve(stdout.trim()).toLowerCase()!==resolve(workspace).toLowerCase())throw new Error('Patch application requires an independent Git root');
  await writeFile(path,patch);
  await exec('git',['apply','--whitespace=nowarn',resolve(path)],{cwd:workspace,windowsHide:true,timeout:30000});
}
export async function dependencySnapshot(root,prefix=''){
  const files={};
  for(const entry of (await readdir(resolve(root,prefix),{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))){
    const p=[prefix,entry.name].filter(Boolean).join('/');
    if(entry.isSymbolicLink())files[p]='link:'+await readlink(resolve(root,p));
    else if(entry.isDirectory())Object.assign(files,await dependencySnapshot(root,p));
    else if(entry.isFile())files[p]=hash(await readFile(resolve(root,p)));
  }
  return files;
}
export function gradeMocha(report,{required=[],exitCode=0}={}){
  const passed=new Set((report.passes??[]).map(t=>t.fullTitle)),failed=new Set((report.failures??[]).map(t=>t.fullTitle));
  const missing=required.filter(n=>!passed.has(n)&&!failed.has(n));
  const valid=Number.isInteger(report.stats?.tests)&&report.stats.tests>0&&report.stats.tests===(report.tests??[]).length&&report.stats.tests===passed.size+failed.size+(report.pending??[]).length&&report.stats.passes===passed.size&&report.stats.failures===failed.size&&report.stats.pending===(report.pending??[]).length;
  return {status:!valid||missing.length?'invalid_result':exitCode===0&&failed.size===0&&(report.pending??[]).length===0&&required.every(n=>passed.has(n))?'passed':'failed',exitCode,tests:report.stats?.tests,passed:passed.size,failed:failed.size,pending:report.pending?.length,missing,required,failures:report.failures??[]};
}
export async function runMocha(workspace,args,{required=[],timeout=120000}={}){
  const started=performance.now();let stdout='',stderr='',exitCode=0;
  try{({stdout,stderr}=await exec(process.execPath,['--max-old-space-size=512',resolve(workspace,'node_modules/mocha/bin/mocha.js'),'--reporter','json','--timeout','10000','--exit',...args],{cwd:workspace,windowsHide:true,timeout,maxBuffer:8*1024**2,env:{...process.env,HTTP_PROXY:'',HTTPS_PROXY:'',ALL_PROXY:'',http_proxy:'',https_proxy:'',all_proxy:'',NO_PROXY:'*',NODE_OPTIONS:''}}));}
  catch(e){stdout=e.stdout??'';stderr=e.stderr??'';exitCode=e.code;if(e.killed||typeof e.code!=='number')return {status:'infrastructure_error',error:e.message,stdout,stderr,latencyMs:performance.now()-started};}
  let report;try{report=JSON.parse(stdout);}catch{return {status:'invalid_result',exitCode,stdout,stderr,latencyMs:performance.now()-started};}
  return {...gradeMocha(report,{required,exitCode}),stdout,stderr,latencyMs:performance.now()-started};
}
export async function verifyNativeTask({task,workspace,destination,dependencies,expectedDependencies}){
  if(JSON.stringify(await dependencySnapshot(resolve(dependencies,'node_modules')))!==JSON.stringify(expectedDependencies))throw new Error('Shared dependency files drifted');
  // Always reconstruct grading from pristine input. Agent tests/build output are never trusted.
  await mkdir(destination,{recursive:true});await copySource(task.baseline,destination);
  const before=await snapshot(task.baseline),after=await snapshot(workspace);
  for(const p of new Set([...Object.keys(before),...Object.keys(after)]))if(before[p]!==after[p]&&task.allowsChange(p)){
    if(!after[p]){const {unlink}=await import('node:fs/promises');await unlink(resolve(destination,p));}
    else{await mkdir(dirname(resolve(destination,p)),{recursive:true});await cp(resolve(workspace,p),resolve(destination,p));}
  }
  await initializeWorkspaceGit(destination);
  await linkDependencies(destination,dependencies);
  if(hash(task.record.test_patch)!==task.acceptanceHash)throw new Error('Acceptance patch drifted');
  await applyPatch(destination,task.record.test_patch,resolve(destination,'../acceptance.diff'));
  const acceptance=await runMocha(destination,task.acceptanceArgs,{required:[...task.record.FAIL_TO_PASS,...task.record.PASS_TO_PASS]});
  const regression=await runMocha(destination,task.regressionArgs);
  return {acceptance,regression};
}
