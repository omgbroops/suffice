// Opt-in local task bookkeeping. No provider or checker is launched here.
import {mkdir,readFile,writeFile,rename,realpath,stat,lstat} from 'node:fs/promises';
import {resolve,basename} from 'node:path';
import {randomUUID} from 'node:crypto';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {hash,repositoryPath} from './workspace.mjs';

const BRIDGE=fileURLToPath(new URL('./learner_bridge.py',import.meta.url));
const LIMIT=1024*1024;
const uuid=value=>typeof value==='string'&&/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value);
const location=options=>resolve(options.home,'learner');
async function load(path) {
  try {
    if((await lstat(path)).isSymbolicLink() || (await stat(path)).size>LIMIT) throw Error();
    return JSON.parse(await readFile(path,'utf8'));
  }catch(cause){const error=Error('Learning state is unavailable or invalid.');error.code=cause.code;throw error;}
}
async function save(path,value) {
  await mkdir(resolve(path,'..'),{recursive:true,mode:0o700});
  const temporary=path+'.'+randomUUID()+'.tmp';
  await writeFile(temporary,JSON.stringify(value,null,2)+'\n',{flag:'wx',mode:0o600});
  await rename(temporary,path);
}
export async function invoke(config,operation,payload,{spawnProcess=spawn,timeoutMs=30_000}={}) {
  return new Promise((accept,reject)=>{
    const env={};for(const key of ['PATH','HOME','TMPDIR','SystemRoot','USERPROFILE','LOCALAPPDATA','APPDATA','PATHEXT','LANG']) if(process.env[key]) env[key]=process.env[key];
    env.UV_CACHE_DIR=resolve(config.stateRoot,'uv-cache');env.PYTHONNOUSERSITE='1';
    const child=spawnProcess('uv',['run','--offline','--no-sync','--project',config.project,'python',BRIDGE,operation],{stdio:['pipe','pipe','ignore'],env,windowsHide:true});
    let output='',settled=false;
    const finish=(error,value)=>{if(settled)return;settled=true;clearTimeout(timer);error?reject(error):accept(value);};
    const timer=setTimeout(()=>{child.kill();finish(Error('Model Learner timed out; the task remains unverified.'));},timeoutMs);
    child.on('error',()=>finish(Error('Cannot start Model Learner. Install uv and connect its prepared checkout.')));
    child.stdin.on('error',()=>{});
    child.stdout.on('data',chunk=>{output+=chunk;if(Buffer.byteLength(output)>LIMIT){child.kill();finish(Error('Model Learner returned an oversized response.'));}});
    child.on('close',code=>{
      if(settled)return;
      try {const result=JSON.parse(output);if(code!==0||result.error)throw Error();finish(null,result);}
      catch {finish(Error('Model Learner rejected the operation. Check the connection, fresh-task scope and independent artifact/report binding.'));}
    });
    child.stdin.end(JSON.stringify(payload));
  });
}
export async function connectLearner(options,project,{call=invoke}={}) {
  let root;try{root=await realpath(project);}catch{throw Error('Choose an existing prepared Model Learner checkout.');}
  const stateRoot=location(options);
  if(!(await stat(resolve(root,'src/model_learner/adapters/suffice.py'))).isFile()) throw Error('Choose the prepared Model Learner checkout.');
  const config={version:'suffice-learner/v1',project:root,stateRoot,machine_id:'suffice-'+randomUUID(),database:resolve(stateRoot,'ledger.sqlite3')};
  try {const previous=await load(resolve(stateRoot,'connection.json'));config.machine_id=previous.machine_id;}catch(e){if(e.code!=='ENOENT')throw e;}
  const probe=await call(config,'probe',{});
  if(probe.protocol!=='suffice-learner/v1'||!probe.runtime_manifests) throw Error('Model Learner needs the runtime-link adapter update.');
  await save(resolve(stateRoot,'connection.json'),config);
  return {connected:true,message:'Model Learner connected. Enable --learn for a fresh task or use /learn.'};
}
async function connection(options) {
  try {const config=await load(resolve(location(options),'connection.json'));
    if(config.version!=='suffice-learner/v1'||typeof config.project!=='string'||!uuid(config.machine_id?.slice(8)))throw Error();
    // Storage always belongs to the selected Suffice home, not paths from JSON.
    return {...config,stateRoot:location(options),database:resolve(location(options),'ledger.sqlite3')};
  }catch {throw Error('Connect first: suffice learn connect /path/to/model-learner');}
}
const latestPath=options=>resolve(location(options),'projects',hash(resolve(options.cwd)).slice(0,20),'latest.json');
async function selected(options) {
  let id=options.learnerRun;
  if(!id) {try {id=(await load(latestPath(options))).run_id;}catch {throw Error('No tracked task in this project yet.');}}
  if(!uuid(id))throw Error('Invalid tracked task identity.');
  const runDir=resolve(location(options),'runs',id),state=await load(resolve(runDir,'state.json'));
  if(state.workspace!==await realpath(options.cwd))throw Error('Tracked task belongs to another project.');
  return {runDir,state};
}
async function artifactPath(workspace,path) {
  const artifact=await repositoryPath(workspace,path);
  if(/^(?:\.env(?:\..*)?|auth\.json|credentials\.json|id_rsa|id_ed25519)$/i.test(basename(artifact)))throw Error('Choose a task artifact, not a credential file.');
  try{if(!(await stat(artifact)).isFile())throw Error('Choose a task artifact file, not a directory.');}catch(error){if(error.code!=='ENOENT')throw error;}
  return artifact;
}
export async function armLearner(options,source,{call=invoke,notify=()=>{}}={}) {
  if(source.hasHistory())throw Error('Learning needs a fresh task session. Use /learn to start one, or omit --continue.');
  if(!options.learnArtifact||!options.learnTests?.length)throw Error('Learning needs an artifact and named independent tests.');
  const config=await connection(options),artifact=await artifactPath(options.cwd,options.learnArtifact);
  const run_id=randomUUID(),task_id=randomUUID(),runtime_id=randomUUID();
  const runDir=resolve(config.stateRoot,'runs',run_id);
  await mkdir(runDir,{recursive:true,mode:0o700});
  const task=await call(config,'prepare',{database:config.database,task_id,tests:options.learnTests});
  const state={version:'suffice-task/v1',workspace:await realpath(options.cwd),run_id,task_id:task.task_id,runtime_id,
    artifact,receipts:source.receipts,pi_session:source.piSession(),started_at:source.startedAt,
    machine_id:config.machine_id,status:'armed'};
  await save(resolve(runDir,'state.json'),state);await save(latestPath(options),{run_id});
  try{await source.link({runtime_id,task_id,run_id});}catch{state.status='cancelled';await save(resolve(runDir,'state.json'),state);throw Error('Cannot save the runtime linkage; learning was not armed.');}
  let pending;
  return {run_id,
    async cancel() {if(!pending){state.status='cancelled';await save(resolve(runDir,'state.json'),state);}},
    finish() {
      return pending??=(async()=>{
        state.ended_at=new Date().toISOString();state.status='capturing';
        await save(resolve(runDir,'state.json'),state);
        try {
          await artifactPath(state.workspace,state.artifact);
          const result=await call(config,'finish',{...state,run_dir:runDir,database:config.database});
          state.status='captured';state.result=result;await save(resolve(runDir,'state.json'),state);
          notify('Task saved to Model Learner. Outcome is unknown until independent verification.');
          return result;
        }catch(error){state.status='capture_failed';await save(resolve(runDir,'state.json'),state);
          notify('Learning capture failed; the task is unverified. Use /learn retry or suffice learn retry.');return {capture_failed:true};}
      })();
    }
  };
}
export async function learnerAction(options,action,{call=invoke}={}) {
  const config=await connection(options),{runDir,state}=await selected(options);
  if(action==='retry'&&state.status==='captured')action='status';
  if(action==='retry') {
    if(!state.ended_at)throw Error('This tracked task has not finished.');
    const result=await call(config,'finish',{...state,run_dir:runDir,database:config.database});
    state.status='captured';state.result=result;await save(resolve(runDir,'state.json'),state);return result;
  }
  if(action==='status' && state.status!=='captured')return {status:state.status,outcome:'unknown',eligible:false};
  if(state.status!=='captured')throw Error('Capture must complete before verification.');
  const data={database:config.database,run_id:state.run_id};
  if(action==='verify') {
    if(!options.learnIndependent||!options.learnReport||!options.learnGeneratedAt||!Number.isInteger(options.learnExitCode))throw Error('Provide --report, --generated-at, --exit-code and --independent for an independently produced report.');
    await artifactPath(state.workspace,state.artifact);
    Object.assign(data,{report:resolve(options.cwd,options.learnReport),artifact:state.artifact,
      generated_at:options.learnGeneratedAt,exit_code:options.learnExitCode,independent:true});
  } else if(action!=='status') throw Error('Use learn connect, status, retry or verify.');
  const result=await call(config,action,data);state.result=result;await save(resolve(runDir,'state.json'),state);return result;
}
export async function learnerCommand(options) {
  const [action,project,...extra]=options.learnerArgs;
  if(action==='connect') {if(!project||extra.length)throw Error('Use suffice learn connect /path/to/model-learner');return connectLearner(options,project);}
  if(project)throw Error('Use learning flags for the selected report; no positional identity is needed.');
  return learnerAction(options,action??'status');
}

export function learningText(result) {
  if(result.message)return result.message;
  if(result.status==='cancelled')return 'Tracking ended before a task was captured.';
  if(result.status==='armed')return 'Learning is armed for the next task.';
  if(result.status==='capture_failed'||result.capture_failed)return 'Capture needs attention. The task remains unverified; use learn retry.';
  const issues=result.summary?.attribution_issues??[];
  const verdict=issues.length?'Saved for review. Task boundaries, session history or configuration are ambiguous; this task is excluded from single-configuration learning.':result.outcome==='unknown'?'Saved. Awaiting independent verification.':
    result.eligible?`Independent checks ${result.outcome==='success'?'passed':'failed'}. One verified ${result.outcome} is available for learning.`:
    'Evidence saved, but this task is not eligible for single-configuration learning.';
  const value=result.summary?.api_equivalent_usd;
  return verdict+` API-equivalent usage: ${value===null||value===undefined?'unknown':'$'+value.toFixed(4)}. Subscription spending and execution latency are unknown.`;
}
