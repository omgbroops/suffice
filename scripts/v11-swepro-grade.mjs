// Pristine official V2 image replay. This module never calls an agent/model.
import {readFile,writeFile,mkdir,access,lstat,realpath,readdir,rename} from 'node:fs/promises';
import {resolve,join,relative,sep,dirname,basename} from 'node:path';
import {randomBytes} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {hash,inside} from '../src/v9/workspace.mjs';
import {docker,save,upstreamTasks,verifiedTask,publicOrder,UPSTREAM_COMMIT} from './v11-swepro-prepare.mjs';

const read=async path=>JSON.parse(await readFile(path,'utf8'));
const mount=(source,target,readonly=true)=>{source=resolve(source);if(source.includes(','))throw Error('Unsupported comma in bind path');return['--mount',`type=bind,source=${source},target=${target}${readonly?',readonly':''}`];};
const successful=r=>r.exitCode===0&&!r.error&&!r.timedOut&&!r.overflow&&!r.aborted;
export function officialReward(process,reward){
  if(!process||process.error||process.timedOut||process.overflow||process.aborted)return null;
  if(process.exitCode===0&&String(reward).trim()==='1')return true;
  if(process.exitCode===1&&String(reward).trim()==='0')return false;
  return null;
}
export async function evidenceInventory(directory,ownGrade=true){
  const out=[];for(const entry of(await readdir(directory,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))){
    if(ownGrade&&entry.name==='grade.json')continue;const path=join(directory,entry.name),info=await lstat(path);
    if(info.isSymbolicLink()||(!info.isFile()&&!info.isDirectory()))throw Error('Verifier evidence must contain only regular files/directories');
    if(info.isDirectory())out.push(...await evidenceInventory(path,false));else out.push({path,sha256:hash(await readFile(path))});
  }return out;
}
async function regularJson(path){const info=await lstat(path);if(!info.isFile()||info.isSymbolicLink())throw Error('Verifier JSON must be a regular file');return read(path);}
export async function cachedGrade(directory,expected){
  const grade=await regularJson(join(directory,'grade.json')),request=await regularJson(join(directory,'request.json'));
  for(const key of['purpose','id','imageId','taskSha256','patchSha256','closedCohortProofSha256','graderCodeSha256','timeoutMs'])if(request[key]!==expected[key])throw Error('Cached verifier request differs: '+key);
  const actual=await evidenceInventory(directory);if(!Array.isArray(grade.evidenceFiles)||JSON.stringify(actual)!==JSON.stringify(grade.evidenceFiles))throw Error('Cached verifier evidence changed');
  const required=await regularJson(join(directory,'verifier/required-cases.json')).catch(()=>null),output=await regularJson(join(directory,'verifier/output.json')).catch(()=>null);
  const rewardPath=join(directory,'verifier/reward.txt');let reward=null;try{const info=await lstat(rewardPath);if(!info.isFile()||info.isSymbolicLink())throw Error('Nonregular reward');reward=await readFile(rewardPath,'utf8');}catch{}
  if(grade.kind!==verdict({process:grade.process,reward,output,required,removed:grade.removed})||grade.pass!==(grade.kind==='pass')||grade.rawOfficialPass!==officialReward(grade.process,reward)||grade.id!==expected.id||grade.purpose!==expected.purpose||grade.patchSha256!==expected.patchSha256||grade.imageId!==expected.imageId||grade.taskSha256!==expected.taskSha256||JSON.stringify(grade.caseSummary)!==JSON.stringify(requiredCases(output,required)))throw Error('Cached verifier result differs from its authentic evidence');
  return grade;
}
export async function preserveVerifierFailure(root,directory,{dockerRun=docker}={}){
  root=await realpath(resolve(root));const requested=resolve(directory),requestedInfo=await lstat(requested);if(requestedInfo.isSymbolicLink())throw Error('Verifier retry cannot follow a directory symlink');directory=await realpath(requested);if(!inside(root,directory)||directory===root)throw Error('Verifier retry must stay inside its cohort root');
  const parts=relative(root,directory).split(sep);if(!(parts.length===2&&parts[0]==='candidate-grades'||parts.length===3&&parts[0]==='reference-validation'&&['gold','empty'].includes(parts[2]))||!/^[A-Za-z0-9_.-]+$/.test(parts[1]))throw Error('Retry may preserve verifier directories only');
  const info=await lstat(directory);if(!info.isDirectory()||info.isSymbolicLink()||!inside(root,await realpath(directory)))throw Error('Expected a contained verifier directory');
  let grade=null,request=null;try{grade=await regularJson(join(directory,'grade.json'));}catch(e){if(e.code!=='ENOENT')throw e;}try{request=await regularJson(join(directory,'request.json'));}catch(e){if(e.code!=='ENOENT')throw e;}
  if(grade&&['pass','test_fail','patch_apply_failed'].includes(grade.kind))throw Error('Authentic completed verdicts are reused, not retried');
  if(request){
    const name=request.args?.[request.args.indexOf('--name')+1];if(!/^suffice-swepro-verifier-[a-f0-9]{14}$/.test(name))throw Error('Unknown verifier container identity');
    await dockerRun(['rm','--force',name],{allowFailure:true});const check=await dockerRun(['ps','--all','--filter',`name=^/${name}$`,'--format','{{.ID}}']);if(!successful(check)||check.stdout.trim())throw Error('Verifier removal could not be confirmed before retry');
  }else{
    const check=await dockerRun(['ps','--all','--filter','name=^/suffice-swepro-verifier-','--format','{{.ID}}']);if(!successful(check)||check.stdout.trim())throw Error('Unknown live verifier prevents an unsealed-evidence retry');
  }
  const history=join(root,'verifier-retry-history');await mkdir(history,{recursive:true});if(!inside(root,await realpath(history)))throw Error('Retry history escaped cohort root');
  const prefix=hash(directory).slice(0,16)+'-';if((await readdir(history)).filter(x=>x.startsWith(prefix)).length>=2)throw Error('Two infrastructure verifier retries already preserved; no coding actor is retried');
  const destination=join(history,prefix+Date.now()+'-'+randomBytes(4).toString('hex'));if(!inside(root,destination))throw Error('Retry target escaped cohort root');
  await rename(directory,destination);await save(join(destination,'retry-preserved.json'),{at:new Date().toISOString(),originalDirectory:directory,sourceUnchanged:true});return destination;
}
export async function verifierRetryCount(root,directory){try{const canonical=join(await realpath(dirname(resolve(directory))),basename(directory));return(await readdir(join(root,'verifier-retry-history'))).filter(x=>x.startsWith(hash(canonical).slice(0,16)+'-')).length;}catch(e){if(e.code==='ENOENT')return 0;throw e;}}
export const confirmedDockerFailure=(process,stderr='')=>Boolean(process?.error)||process?.exitCode===125||/^(?:request returned .+ for API route|Cannot connect to the Docker daemon|error during connect|Error response from daemon|docker: Error response from daemon)/m.test(stderr);
export async function runVerifierWithRetries(root,request){
  for(;;){
    let result;
    try{result=await runOfficialVerifier(request);}catch(e){
      if(!e.message.startsWith('Unsealed verifier output')||await verifierRetryCount(root,request.directory)>=2)throw e;
      await preserveVerifierFailure(root,request.directory);continue;
    }
    // No subsequent 4 GiB verifier can start while a previous one may exist.
    // Preserve/replay only after its exact named container is confirmed removed.
    if(result.removed!==true){
      if(await verifierRetryCount(root,request.directory)>=2)throw Error('Verifier removal remains unconfirmed; serial grading halted');
      await preserveVerifierFailure(root,request.directory);continue;
    }
    if(['pass','test_fail','patch_apply_failed'].includes(result.kind)||!result.confirmedInfrastructureFailure||await verifierRetryCount(root,request.directory)>=2)return result;
    await preserveVerifierFailure(root,request.directory);
  }
}
const terminalStates=new Set(['completed','failed','timeout','timed_out','budget_stopped','cost_unknown','infrastructure_error','operational_failure','closure_failure','verification_failed','unverified','interrupted','cancelled','aborted','overflow','error','unavailable','invalid_result','protocol_failure','policy_violation','source_violation','source_sealing_failure']);
const terminal=attempt=>terminalStates.has(attempt.status);
export function availablePatch(attempt){return attempt.artifactStatus!=='missing'&&typeof attempt.patchSha256==='string'&&/^[a-f0-9]{64}$/.test(attempt.patchSha256);}
export function assertClosedCohort(execution){
  const documentedMissing=a=>a.artifactStatus==='missing'&&['infrastructure_error','closure_failure','source_sealing_failure','operational_failure'].includes(a.status)&&typeof a.error==='string'&&Boolean(a.error);
  if(execution?.closed!==true||!Array.isArray(execution.attempts)||execution.attempts.length!==16||new Set(execution.attempts.map(x=>x.id)).size!==16||execution.attempts.some(x=>!terminal(x)||x.cleanup?.safeToContinue!==true||x.cleanup?.removed!==true||(!availablePatch(x)&&!documentedMissing(x)))||execution.relayCleanup?.removed!==true)throw Error('All16terminal actors and the relay must be confirmed removed; each patch must be sealed or explicitly documented unrecoverable before candidate grading');
}
export function requiredCases(output,required){
  if(!Array.isArray(output?.tests)||output.tests.some(x=>!x||typeof x.name!=='string'||!['PASSED','FAILED','ERROR','SKIPPED'].includes(x.status)))return null;
  if(!Array.isArray(required?.fail_to_pass)||!Array.isArray(required?.pass_to_pass)||!required.fail_to_pass.length||[...required.fail_to_pass,...required.pass_to_pass].some(x=>typeof x!=='string'||!x))return null;
  const seen=new Map();for(const row of output?.tests??[]){const statuses=seen.get(row.name)??new Set();statuses.add(row.status);seen.set(row.name,statuses);}
  const all=[...new Set([...required.fail_to_pass,...required.pass_to_pass])],passed=name=>seen.get(name)?.has('PASSED'),failed=name=>!passed(name)&&['FAILED','ERROR'].some(status=>seen.get(name)?.has(status));
  return{required:all.length,missing:all.filter(x=>!seen.has(x)).length,allPassed:all.every(passed),confirmedFailures:all.filter(failed).length,
    failToPassFailures:required.fail_to_pass.filter(failed).length,passToPassMissing:required.pass_to_pass.filter(x=>!seen.has(x)).length,passToPassFailures:required.pass_to_pass.filter(x=>!passed(x)).length};
}
export function verdict({process,reward,output,removed,required}){
  if(!removed)return'infrastructure_error';
  if(process.timedOut||process.aborted)return'timeout';
  if(process.exitCode===97)return'patch_apply_failed';
  if(process.error||process.overflow||!Array.isArray(output?.tests)||output.tests.length===0)return'infrastructure_error';
  const cases=requiredCases(output,required);if(!cases)return'infrastructure_error';
  if(cases.missing)return'incomplete_verification';
  if(successful(process)&&String(reward).trim()==='1'&&cases.allPassed)return'pass';
  if(String(reward).trim()==='0'&&cases.confirmedFailures)return'test_fail';
  if(String(reward).trim()==='0'&&!cases.allPassed)return'incomplete_verification';
  return'infrastructure_error';
}
export async function verifyClosedRoot(root,{dockerRun=docker}={}){
  if(typeof root!=='string'||!root)throw Error('Candidate verification requires the actual closed cohort root');root=resolve(root);
  const planPath=join(root,'plan.json'),plan=await read(planPath),execution=await read(join(root,'execution-complete.json')),started=await read(join(root,'execution-started.json'));
  const{fingerprint,...body}=plan,planSha256=hash(await readFile(planPath));
  if(plan.version!=='v11-swepro-v2-compatible8-1'||hash(JSON.stringify(body))!==fingerprint||!Array.isArray(plan.tasks)||plan.tasks.length!==8||new Set(plan.tasks.map(x=>x.id)).size!==8||plan.schedule?.length!==16||new Set(plan.schedule.map(x=>x.id)).size!==16||plan.schedule.some(x=>x.repeat!==1||x.id!==x.taskId+'-r1-'+x.strategy)||plan.tasks.some(t=>!['v11','native'].every(s=>plan.schedule.filter(x=>x.taskId===t.id&&x.strategy===s).length===1)))throw Error('Invalid frozen SWEPro schedule');
  publicOrder(plan.tasks.map(x=>x.id));
  assertClosedCohort(execution);
  if(started.planFingerprint!==fingerprint||started.planSha256!==planSha256||execution.planFingerprint!==fingerprint||execution.planSha256!==planSha256)throw Error('Actor closure/start receipts do not belong to the frozen plan');
  for(const file of[...plan.runtimeFiles,...plan.evaluationFiles])if(hash(await readFile(file.path))!==file.sha256)throw Error('Frozen SWEPro input changed');
  const patches=[];
  for(const item of plan.schedule){
    const attempt=execution.attempts.find(x=>x.id===item.id),directory=join(root,'attempts',item.id),patchPath=join(directory,'patch.diff');
    if(!attempt||attempt.taskId!==item.taskId||attempt.strategy!==item.strategy||resolve(attempt.attemptPath)!==directory||resolve(attempt.patchPath)!==patchPath)throw Error('Actor receipt or patch path differs from frozen schedule');
    if(JSON.stringify(await read(join(directory,'scheduled-attempt.json')))!==JSON.stringify(attempt)||JSON.stringify(await read(join(directory,'cleanup.json')))!==JSON.stringify(attempt.cleanup))throw Error('Attempt closure receipt differs');
    if(availablePatch(attempt)){
      const info=await lstat(patchPath),realDirectory=await realpath(directory),realPatch=await realpath(patchPath);
      if(!info.isFile()||info.isSymbolicLink()||!inside(await realpath(root),realDirectory)||realPatch!==join(realDirectory,'patch.diff'))throw Error('Patch must be a contained regular file');
      if(hash(await readFile(patchPath))!==attempt.patchSha256)throw Error('Sealed actor patch changed');patches.push({id:attempt.id,sha256:attempt.patchSha256});
    }else{try{await access(patchPath);throw Error('A documented missing patch unexpectedly exists');}catch(e){if(e.code!=='ENOENT')throw e;}patches.push({id:attempt.id,ungraded:true});}
  }
  const live=await dockerRun(['ps','--all','--filter','label=com.suffice.benchmark=v11-swepro-v2','--format','{{.Names}}']);if(!successful(live)||live.stdout.trim())throw Error('A SWEPro actor or model relay still exists, or absence cannot be confirmed');
  return{plan,execution,proofSha256:hash(JSON.stringify({planSha256,executionSha256:hash(await readFile(join(root,'execution-complete.json'))),startedSha256:hash(await readFile(join(root,'execution-started.json'))),patches}))};
}
const REQUIRED_SCRIPT=`import ast, json
def parse(v):
    if isinstance(v, list): return v
    if isinstance(v, str):
        try: return json.loads(v)
        except json.JSONDecodeError: return ast.literal_eval(v)
    raise ValueError('Invalid required-case list')
c=json.load(open('/tests/config.json'))
json.dump({k:parse(c[k]) for k in ['fail_to_pass','pass_to_pass']},open('/logs/verifier/required-cases.json','w'))
`;
export async function runOfficialVerifier({task,patchPath,directory,purpose,cohortRoot,attemptId,timeoutMs=3000_000}){
  if(!['gold','empty','candidate'].includes(purpose))throw Error('Unknown verifier purpose');
  let proof;if(purpose==='candidate'){
    proof=await verifyClosedRoot(cohortRoot);const attempt=proof.execution.attempts.find(x=>x.id===attemptId),expected=proof.plan.tasks.find(x=>x.id===attempt?.taskId);
    if(!attempt||!availablePatch(attempt)||attempt.sourceSealed!==true||resolve(attempt.patchPath)!==resolve(patchPath)||resolve(directory)!==join(resolve(cohortRoot),'candidate-grades',attemptId)||task.id!==expected?.id||task.imageId!==expected.verifierImage||task.taskSha256!==expected.taskSha256||resolve(task.directory)!==resolve(expected.directory))throw Error('Candidate verifier request differs from sealed cohort');
  }
  if(!/^sha256:[a-f0-9]{64}$/.test(task.imageId))throw Error('Pristine verifier image must be immutable');
  directory=resolve(directory);await mkdir(directory,{recursive:true});
  const patch=await readFile(patchPath),patchSha256=hash(patch),name='suffice-swepro-verifier-'+randomBytes(7).toString('hex');
  if(purpose==='candidate'&&proof.execution.attempts.find(x=>x.id===attemptId)?.patchSha256!==patchSha256)throw Error('Candidate patch changed after cohort closure authentication');
  const graderCodeSha256=hash(await readFile(new URL(import.meta.url))),expected={purpose,id:task.id,imageId:task.imageId,taskSha256:task.taskSha256,patchSha256,closedCohortProofSha256:proof?.proofSha256??null,graderCodeSha256,timeoutMs};
  try{await access(join(directory,'grade.json'));return cachedGrade(directory,expected);}catch(e){if(e.code!=='ENOENT')throw e;}
  if((await readdir(directory)).length)throw Error('Unsealed verifier output must be preserved and its container closed before retry');
  const logs=join(directory,'verifier');await mkdir(logs);
  await writeFile(join(directory,'sealed.patch'),patch,{flag:'wx'});
  const command='set -eu\ncd /app 2>/dev/null || cd /testbed\npython3 - <<\'REQUIRED_CASES\'\n'+REQUIRED_SCRIPT+'REQUIRED_CASES\nif [ -s /candidate.patch ]; then git apply --binary /candidate.patch || { echo SUFFICE_CANDIDATE_PATCH_APPLY_FAILED; exit 97; }; fi\nbash /tests/test.sh\n';
  const args=['run','--name',name,'--platform','linux/amd64','--network','bridge','--cpus','1','--memory','4g','--pids-limit','512','--cap-drop','ALL','--security-opt','no-new-privileges',
    ...mount(join(task.directory,'tests'),'/tests'),...mount(join(directory,'sealed.patch'),'/candidate.patch'),...mount(logs,'/logs/verifier',false),'--entrypoint','/bin/bash',task.imageId,'-c',command];
  await save(join(directory,'request.json'),{at:new Date().toISOString(),...expected,upstreamCommit:UPSTREAM_COMMIT,network:'public verifier',timeoutMs,args});
  let process,removed=false,cleanupError=null;
  try{process=await docker(args,{allowFailure:true,timeoutMs,stdoutPath:join(directory,'stdout.txt'),stderrPath:join(directory,'stderr.txt'),maxBytes:16_000_000});}
  finally{
    try{await docker(['rm','--force',name],{allowFailure:true});const confirmation=await docker(['ps','--all','--filter',`name=^/${name}$`,'--format','{{.ID}}'],{allowFailure:true});removed=successful(confirmation)&&!confirmation.stdout.trim();}catch(e){cleanupError=e.message;}
  }
  const evidenceFiles=await evidenceInventory(directory);
  let reward=null,output=null,required=null;try{reward=await readFile(join(logs,'reward.txt'),'utf8');}catch{}try{output=await regularJson(join(logs,'output.json'));}catch{}try{required=await regularJson(join(logs,'required-cases.json'));}catch{}
  const kind=verdict({process:process??{error:'Verifier process unavailable'},reward,output,removed,required});
  const result={at:new Date().toISOString(),id:task.id,purpose,kind,pass:kind==='pass',patchSha256,imageId:task.imageId,taskSha256:task.taskSha256,removed,cleanupError,
    process:{...process,stdout:undefined,stderr:undefined},confirmedInfrastructureFailure:confirmedDockerFailure(process,process?.stderr),reward:reward?.trim()??null,rawOfficialPass:officialReward(process,reward),caseSummary:requiredCases(output,required),testCount:output?.tests?.length??null,outputSha256:output?hash(await readFile(join(logs,'output.json'))):null,evidenceFiles};
  if(purpose==='candidate'&&(await verifyClosedRoot(cohortRoot)).proofSha256!==proof.proofSha256)throw Error('Cohort evidence changed during private grading');
  await save(join(directory,'grade.json'),result);return result;
}
export async function validateReferences(root){
  root=resolve(root);const eligibility=await read(join(root,'eligibility.json'));
  try{await access(join(root,'execution-started.json'));throw Error('Reference validation cannot run after actors start');}catch(e){if(e.code!=='ENOENT')throw e;}
  if(!eligibility.complete||eligibility.selected?.length!==8||eligibility.upstreamCommit!==UPSTREAM_COMMIT)throw Error('Eight public technically compatible tasks must be frozen before any reference outcome is observed');
  const eligibilitySha256=hash(await readFile(join(root,'eligibility.json')));try{const prior=await read(join(root,'reference-validation-started.json'));if(prior.eligibilitySha256!==eligibilitySha256)throw Error('The fixed subset changed after private reference validation started');}catch(e){if(e.code!=='ENOENT')throw e;await writeFile(join(root,'reference-validation-started.json'),JSON.stringify({at:new Date().toISOString(),eligibilitySha256},null,2)+'\n',{flag:'wx'});}
  const upstream=await upstreamTasks(),results=[];
  for(const row of eligibility.selected){
    const task={...await verifiedTask(upstream.upstream,row.id,upstream.expected),imageId:row.imageId};
    if(task.taskSha256!==row.taskSha256)throw Error('Qualified upstream assets changed');
    const directory=join(root,'reference-validation',row.id);await mkdir(directory,{recursive:true});
    const emptyPath=join(directory,'empty.patch');try{await writeFile(emptyPath,'',{flag:'wx'});}catch(e){if(e.code!=='EEXIST'||(await readFile(emptyPath)).length)throw e;}
    const gold=await runVerifierWithRetries(root,{task,patchPath:join(task.directory,'solution/gold_patch.diff'),directory:join(directory,'gold'),purpose:'gold'});
    const empty=await runVerifierWithRetries(root,{task,patchPath:emptyPath,directory:join(directory,'empty'),purpose:'empty'});
    results.push({id:row.id,gold,empty,valid:gold.pass&&empty.kind==='test_fail'&&empty.caseSummary.failToPassFailures>0&&empty.caseSummary.passToPassMissing===0&&empty.caseSummary.passToPassFailures===0});
    await save(join(root,'reference-validation.json'),{at:new Date().toISOString(),valid:results.length===8&&results.every(x=>x.valid),tasks:results});
    console.log(JSON.stringify({id:row.id,gold:gold.kind,empty:empty.kind}));
    if(!results.at(-1).valid)throw Error('Official reference validation failed; setup halted without replacing the task');
  }
  return{valid:results.length===8&&results.every(x=>x.valid),tasks:results};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  validateReferences(process.argv[2]).then(r=>console.log(JSON.stringify({valid:r.valid,tasks:r.tasks.length}))).catch(e=>{console.error(e.stack);process.exitCode=1;});
}
