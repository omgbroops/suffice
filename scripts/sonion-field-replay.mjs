// Deterministic patch adjudication only. Model calls: 0. Model replay cost: $0.
import {readFile,writeFile,mkdir,copyFile,stat,open,unlink,realpath} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {resolve,dirname} from 'node:path';
import {createHash} from 'node:crypto';
import {executeIsolated,ROOT} from './sonion-execution.mjs';
const D=resolve(ROOT,'.suffice/field-adjudication-v1'),V1=resolve(ROOT,'.suffice/field-campaign-v1'),REPORT=resolve(ROOT,'reports/field-adjudication-v1');
const ids=['q02','i01','i02','i04','s02','s03','q01'];
const hash=b=>createHash('sha256').update(b).digest('hex');
const json=p=>readFile(p,'utf8').then(JSON.parse);
const exists=async p=>!!await stat(p).catch(()=>null);
const save=async(p,v)=>{await mkdir(dirname(p),{recursive:true});await writeFile(p,JSON.stringify(v,null,2)+'\n');};
const inputPaths=['scripts/sonion-field-replay.mjs','scripts/sonion-data-v2.py','scripts/sonion-execution.mjs'];
function data(mode,task,out,extra){const r=spawnSync('python3',['-I',resolve(ROOT,'scripts/sonion-data-v2.py'),mode,task,out,...extra?[extra]:[]],{encoding:'utf8',maxBuffer:32*1024**2,timeout:120000});if(r.status!==0)throw Error(r.stderr||r.stdout);return JSON.parse(r.stdout);}
function stats(stdout,mocha=false){
 if(mocha){try{const j=JSON.parse(stdout);return {...j.stats,failureNames:(j.failures??[]).map(f=>f.fullTitle).sort()};}catch{return null;}}
 const out={};for(const line of stdout.split(String.fromCharCode(10))){const a=line.trim().split(/ +/);if(a.length>=3&&['tests','pass','passes','fail','failures','skipped','pending','cancelled','suites'].includes(a[1])&&/^[0-9]+$/.test(a[2])){const k=a[1],v=Number(a[2]);if(['tests','pass','passes','fail','failures','skipped','pending','cancelled','suites'].includes(k)&&Number.isFinite(v))out[k]=v;}else if(a[1]==='tests'&&a[2]==='passed'&&/^[0-9]+$/.test(a[0])){out.tests=Number(a[0]);out.pass=out.tests;out.fail=0;}}
 out.failureNames=stdout.split(String.fromCharCode(10)).filter(l=>/^not ok/.test(l)).map(l=>l.replace(/^not ok +[0-9]+ +- +/,''));return Object.keys(out).length>1?out:null;
}
async function controlRows(t){
 let c=t.controls;if(!c.baseline&&t.receipt&&await exists(t.receipt))c=await json(t.receipt);
 const answer=[];for(let i=0;i<t.nativeCommands.length;i++){let row=c.baseline?.native?.[i],s=null;
  if(row?.stdout)s=stats(row.stdout,t.nativeParser==='mocha-json');else if(row?.stdoutTail)s=stats(row.stdoutTail,t.nativeParser==='mocha-json');
  if(!s&&row?.receipts&&await exists(resolve(row.receipts,'process-stdout.txt')))s=stats(await readFile(resolve(row.receipts,'process-stdout.txt'),'utf8'),t.nativeParser==='mocha-json');
  const tests=s?.tests??t.controls.baselineNativeReportedTests?.[i]??null;answer.push({tests,stats:s});
 }return answer;
}
async function summary(){
 const rows=[],pending=[];for(const id of ids)for(const arm of ['suffice','stock-pi']){const aid=id+'-'+arm,p=resolve(D,'attempts',aid,'adjudication.json');if(await exists(p))rows.push(await json(p));else pending.push(aid);}
 const result={version:'field-adjudication-v1',at:new Date().toISOString(),modelCalls:0,replayModelCostUsd:0,counts:{replayed:rows.length,passed:rows.filter(r=>r.replayAccepted).length,failed:rows.filter(r=>r.replayAccepted===false).length,pending:pending.length},diagnosticIntegrationRuns:rows.filter(r=>r.comparisonEligibility==='invalid_v1_environment_perturbed').length,replays:rows,pending,caveat:'Integration v1 runs stay invalid for harness/cost comparison even if their patches pass this diagnostic replay. Native counts are exact runner totals; Nano Stores fake-timer files can be represented as file-level aggregate passes. Unchanged v1 result bytes remain authoritative historical receipts, not rewritten results.'};
 await save(resolve(REPORT,'summary.json'),result);
 const lines=['# Deterministic v1 patch adjudication','',`Updated ${result.at}. Model calls: **0**. Model replay cost: **$0**. Original v1 results are unchanged.`,'',result.caveat,'','| Attempt | Replay | Native test counts | Comparison interpretation |','|---|---|---|---|'];for(const r of rows)lines.push(`| ${r.attempt} | ${r.replayAccepted?'pass':r.classification} | ${r.native?.map(n=>n.stats?.tests??'build/type').join(', ')??'not run'} | ${r.comparisonEligibility} |`);lines.push('','Pending: '+pending.join(', '),'');await mkdir(REPORT,{recursive:true});await writeFile(resolve(REPORT,'summary.md'),lines.join('\n'));return result;
}
async function repairStoredReports(){
 for(const id of ids)for(const arm of ['suffice','stock-pi']){
  const aid=id+'-'+arm,file=resolve(D,'attempts',aid,'adjudication.json');if(!await exists(file))continue;const r=await json(file);if(!r.native?.length)continue;const t=await json(resolve(D,'attempts',aid,'normalized-task.json'));let changed=false;
  for(const [i,n]of r.native.entries()){const parsed=stats(await readFile(n.stdoutPath,'utf8'),t.nativeParser==='mocha-json');if(JSON.stringify(parsed)!==JSON.stringify(n.stats))changed=true;n.stats=parsed;const expected=r.originalNativeExpectations[i]?.tests;n.countsMatchOriginal=expected===null||expected===undefined||parsed?.tests===expected;n.knownFailureNamesMatch=t.nativeParser!=='mocha-json'||JSON.stringify(parsed?.failureNames)===JSON.stringify([...(t.controls.nativeFailureNames??[])].sort());n.accepted=n.exitCode===n.expectedExitCode&&!n.outputLimited&&n.knownFailureNamesMatch&&n.countsMatchOriginal;}
  for(const n of r.acceptance){const parsed=stats(await readFile(n.stdoutPath,'utf8'));if(JSON.stringify(parsed)!==JSON.stringify(n.stats))changed=true;n.stats=parsed;n.activeReportedTests=parsed?.tests===undefined?null:parsed.tests-(parsed.skipped??0);n.accepted=n.exitCode===0&&!n.outputLimited&&(n.activeReportedTests===null||n.activeReportedTests>0);}
  if(changed){const backup=resolve(D,'attempts',aid,'adjudication.parser-v1.json');if(!await exists(backup))await copyFile(file,backup);r.replayAccepted=r.native.every(n=>n.accepted)&&r.acceptance.length>0&&r.acceptance.every(n=>n.accepted);r.classification=r.replayAccepted?'patch_passes_restored_native_and_private_checks':r.native.some(n=>!n.accepted)?'native_failure_requires_evidence_review':'private_contract_failure';r.reportParserCorrection={at:new Date().toISOString(),reason:'ASCII token parsing replaces a Unicode marker corrupted by SSH transport stdin decoding; existing raw receipts reparsed, no commands repeated.',prior:backup};await save(file,r);}
 }
}

await mkdir(D,{recursive:true});const lock=await open(resolve(D,'replay.lock'),'wx').catch(()=>{throw Error('Another adjudication or preserved lock exists; do not start parallel replay.');});await lock.writeFile(JSON.stringify({pid:process.pid,startedAt:new Date().toISOString()}));await lock.close();
try{
 const inputs={};for(const p of inputPaths)inputs[p]=hash(await readFile(resolve(ROOT,p)));
 const manifestPath=resolve(D,'manifest.json');if(await exists(manifestPath)){const m=await json(manifestPath);if(JSON.stringify(m.inputs)!==JSON.stringify(inputs))throw Error('Replay input drift; preserve original namespace.');}else await save(manifestPath,{at:new Date().toISOString(),inputs,modelCalls:0,replayModelCostUsd:0,network:false,taskOrder:ids,policy:'Original v1 frozen task commands and controls, normalized read-only installed dependencies, v2 original-test restoration, single sequential task, same executeIsolated namespace.'});
 await repairStoredReports();
 for(const id of ids)for(const arm of ['suffice','stock-pi']){
  const aid=id+'-'+arm,run=resolve(V1,'attempts',aid);if(!await exists(resolve(run,'result.json'))||!await exists(resolve(run,'patch.json')))continue;
  const out=resolve(D,'attempts',aid),reportPath=resolve(out,'adjudication.json');if(await exists(reportPath))continue;if(await exists(out))throw Error('Partial replay preserved; inspect before retry: '+aid);
  await mkdir(out,{recursive:true});await save(resolve(D,'progress.json'),{at:new Date().toISOString(),active:aid,modelCalls:0});
  const frozen=await json(resolve(V1,'frozen',id+'.json')),t=structuredClone(frozen.task),original=await json(resolve(run,'result.json')),patch=await json(resolve(run,'patch.json')),originalResultHash=hash(await readFile(resolve(run,'result.json'))),patchHash=hash(await readFile(resolve(run,'patch.json')));
  let dep=resolve(t.dependencyDir);if(!dep.endsWith('/node_modules')&&await exists(resolve(dep,'node_modules')))dep=resolve(dep,'node_modules');dep=await realpath(dep);if(!dep.endsWith('/node_modules'))throw Error('Installed dependency directory not normalized: '+dep);t.dependencyDir=dep;
  const mf=resolve(out,'normalized-task.json');await save(mf,t);
  const current=data('freeze',mf,t.baseDir),baseDifferences=[];for(const [p,h]of Object.entries(frozen.baseHashes))if(current.baseHashes[p]!==h)baseDifferences.push(p);for(const p of Object.keys(current.baseHashes))if(!Object.hasOwn(frozen.baseHashes,p))baseDifferences.push(p);
  const sourceHashChecks=[];for(const [p,h]of Object.entries(frozen.inputs)){if(p===frozen.taskFile)continue;sourceHashChecks.push({path:p,match:hash(await readFile(p))===h});}
  const record={attempt:aid,task:id,arm,at:new Date().toISOString(),modelCalls:0,replayModelCostUsd:0,originalResult:resolve(run,'result.json'),originalResultSha256:originalResultHash,originalRecordedAccepted:original.accepted,patchSha256:patchHash,normalizedDependencyDir:dep,baseDifferences,sourceHashChecks,comparisonEligibility:id.startsWith('i')?'invalid_v1_environment_perturbed':'potentially_valid_v1_pending_environment_review',native:[],acceptance:[],testRestoration:'sonion-data-v2.py; protected original test files restored from public base; task commands and private checks unchanged',network:false};
  if(baseDifferences.length||sourceHashChecks.some(x=>!x.match)){record.replayAccepted=false;record.classification='blocked_input_drift';await save(reportPath,record);await summary();console.log(aid,'blocked input drift');continue;}
  const workspace=resolve(out,'workspace');record.reconstruction=data('grade',mf,workspace,resolve(run,'patch.json'));const expected=await controlRows(t);record.originalNativeExpectations=expected;
  record.originalTestsExcluded=patch.filter(p=>{const parts=p.path.split('/');return parts.some(x=>['test','tests','test-d','__tests__','fixtures','__fixtures__'].includes(x))||/(^|[./_-])(test|spec)([./_-]|$)/.test(p.path);}).map(x=>x.path);
  const privateRoots=[resolve(ROOT,'research'),resolve(V1,'tasks',id,'private')].filter(p=>true);await mkdir(privateRoots[1],{recursive:true});
  const opts={workspace,privateRoots,gitMetadata:[dep],network:false,timeoutMs:120000};
  for(const [n,command]of t.nativeCommands.entries()){const r=await executeIsolated({...opts,command,receipts:resolve(out,'receipts','native-'+n)}),s=stats(r.stdout,t.nativeParser==='mocha-json');const expectedCode=t.controls.nativeExitCodes?.[n]??0,permitted=[...(t.controls.nativeFailureNames??t.controls.knownNativeFailures??[])].sort();const namesMatch=t.nativeParser!=='mocha-json'||JSON.stringify(s?.failureNames)===JSON.stringify(permitted);const countMatches=expected[n]?.tests===null||expected[n]?.tests===undefined||s?.tests===expected[n].tests;record.native.push({command,exitCode:r.exitCode,expectedExitCode:expectedCode,outputLimited:r.outputLimited,latencyMs:r.latencyMs,stats:s,countsMatchOriginal:countMatches,knownFailureNamesMatch:namesMatch,accepted:r.exitCode===expectedCode&&!r.outputLimited&&namesMatch&&countMatches,stdoutPath:resolve(out,'receipts','native-'+n,'process-stdout.txt'),stderrPath:resolve(out,'receipts','native-'+n,'process-stderr.txt'),stderrTail:r.stderr.slice(-1800)});}
  for(const f of t.graderOverlay??[]){const p=resolve(workspace,f.target);if(!p.startsWith(workspace+'/'))throw Error('Private overlay path escape');await mkdir(dirname(p),{recursive:true});await copyFile(f.source,p);}
  for(const [n,command]of t.acceptanceCommands.entries()){const r=await executeIsolated({...opts,command,receipts:resolve(out,'receipts','acceptance-'+n)}),s=stats(r.stdout);const active=s?.tests===undefined?null:s.tests-(s.skipped??0);record.acceptance.push({command,exitCode:r.exitCode,outputLimited:r.outputLimited,latencyMs:r.latencyMs,stats:s,activeReportedTests:active,accepted:r.exitCode===0&&!r.outputLimited&&(active===null||active>0),stdoutPath:resolve(out,'receipts','acceptance-'+n,'process-stdout.txt'),stderrPath:resolve(out,'receipts','acceptance-'+n,'process-stderr.txt'),stdoutTail:r.stdout.slice(-2600),stderrTail:r.stderr.slice(-1800)});}
  record.replayAccepted=record.native.every(r=>r.accepted)&&record.acceptance.length>0&&record.acceptance.every(r=>r.accepted);record.classification=record.replayAccepted?'patch_passes_restored_native_and_private_checks':record.native.some(r=>!r.accepted)?'native_failure_requires_evidence_review':'private_contract_failure';record.v1ResultUnchanged=hash(await readFile(resolve(run,'result.json')))===originalResultHash;record.patchUnchanged=hash(await readFile(resolve(run,'patch.json')))===patchHash;if(!record.v1ResultUnchanged||!record.patchUnchanged)throw Error('Original artifact changed during adjudication');
  if(!id.startsWith('i'))record.comparisonEligibility='v1_environment_review_required_independent_replay_complete';await save(reportPath,record);await summary();console.log(aid,record.classification,record.native.map(r=>r.stats?.tests??r.exitCode),record.acceptance.map(r=>r.exitCode));
 }
 const done=await summary();await save(resolve(D,'progress.json'),{at:new Date().toISOString(),active:null,...done.counts,modelCalls:0});console.log(JSON.stringify(done.counts));
}finally{await unlink(resolve(D,'replay.lock'));}
