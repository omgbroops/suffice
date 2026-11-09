import {ModelRuntime} from '@earendil-works/pi-coding-agent';
import {mkdir,readFile,writeFile,open,unlink,cp,statfs} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {homedir,freemem} from 'node:os';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {hash} from '../src/workspace.mjs';
import {writeLedger} from '../src/real-intelligence-eval.mjs';
import {CONFIGURATIONS,LIMITS,COST_CEILINGS,scheduleV4,v4CellId,reserveV4Round} from '../src/eval-v4/design.mjs';
import {CAMPAIGN,sourceInputs,catalogEntry} from '../src/eval-v4/protocol.mjs';
import {stageToolchain,sandboxExecutable,binaryHash} from '../src/eval-v4/sandbox.mjs';

const root=process.cwd(),out=resolve(root,'reports/repository-intelligence-v4'),base=resolve(root,'.suffice/intelligence-v4'),load=async p=>JSON.parse(await readFile(p,'utf8')),exec=promisify(execFile),ledgerPath=resolve(out,'spending.json');
const cohort=await load(resolve(root,'benchmarks/intelligence-v4/cohort.json')),schedule=scheduleV4(cohort.tasks),inputs=await sourceInputs(root);
const validations=new Map(),failedGates=new Map();for(const task of cohort.tasks){try{const path=resolve(base,'tasks',task.id,'validation.json'),validation=await load(path);if(Object.entries(validation.setupInputs).every(([p,h])=>inputs[p]===h)){if(validation.valid)validations.set(task.id,{validationSha256:hash(await readFile(path)),validation});else failedGates.set(task.id,{task:task.id,classification:validation.classification,error:validation.error,validationSha256:hash(await readFile(path)),reason:'No model inference; all eight planned cells remain missing because the frozen adapter failed the original/reference gate.'});}}catch(e){if(e.code!=='ENOENT')throw e;}}
if(process.argv.includes('--dry-run')){console.log(JSON.stringify({target:schedule.flat().length,ready:validations.size,firstTask:schedule[0][0].task,firstReady:validations.has(schedule[0][0].task),configurations:CONFIGURATIONS,limits:LIMITS,cap:(await load(ledgerPath)).cap}));process.exit(0);}
const lockPath=resolve(root,'.suffice/native-evaluation.lock'),lock=await open(lockPath,'wx');await lock.writeFile(JSON.stringify({pid:process.pid,kind:'v4-coordinator',at:new Date().toISOString()}));
let status='starting',detail={},protocol;
const state=async()=>writeFile(resolve(out,'execution-status.json'),JSON.stringify({status,...detail,at:new Date().toISOString()},null,2));
const release=async()=>{const ledger=await load(ledgerPath);for(const e of ledger.entries)if(e.runId.startsWith(CAMPAIGN+'/')&&e.state==='reserved'){e.state='not_started';e.known=0;e.reserved=0;e.unknown=false;}await writeLedger(ledgerPath,ledger);};
const summary=async item=>{try{return await load(resolve(out,'attempts',v4CellId(item)+'-a0.summary.json'));}catch(e){if(e.code!=='ENOENT')throw e;return null;}};
try{
  if((await load(ledgerPath)).entries.some(e=>e.state==='dispatched'))throw new Error('Orphaned inference requires audit');
  await mkdir(resolve(out,'task-gates'),{recursive:true});
  for(const [id,gate]of validations){const path=resolve(out,'task-gates',id+'.json'),data={task:id,validationSha256:gate.validationSha256};try{if(JSON.stringify(await load(path))!==JSON.stringify(data))throw new Error('Frozen task gate drift');}catch(e){if(e.code!=='ENOENT')throw e;await writeFile(path,JSON.stringify(data,null,2),{flag:'wx'});}}
  try{protocol=await load(resolve(out,'protocol.json'));if(JSON.stringify(inputs)!==JSON.stringify(protocol.inputs)||JSON.stringify(schedule)!==JSON.stringify(protocol.schedule))throw new Error('Frozen protocol drift');}
  catch(e){
    if(e.code!=='ENOENT')throw e;
    if(new Set([...validations.values()].map(v=>v.validation.framework)).size<3||!validations.has(schedule[0][0].task))throw new Error('All three framework adapters and the first scheduled task must pass before freeze');
    const runtime=await ModelRuntime.create({authPath:resolve(homedir(),'.suffice/auth.json'),modelsPath:null,allowModelNetwork:false});if(!runtime.isUsingSubscription('openai'))throw new Error('Subscription required');
    const catalogs=[...new Set(CONFIGURATIONS.map(c=>c.model))].map(id=>catalogEntry(runtime.getModel('openai',id))),frozen=resolve(base,'frozen',hash(JSON.stringify(inputs)));
    for(const [path,expected]of Object.entries(inputs)){const target=resolve(frozen,path);await mkdir(dirname(target),{recursive:true});await cp(resolve(root,path),target);if(hash(await readFile(target))!==expected)throw new Error('Source changed during freeze');}
    await exec('tar',['-czf',resolve(out,'frozen-source.tar.gz'),'-C',frozen,'.'],{windowsHide:true,timeout:60000});
    protocol={version:1,campaign:CAMPAIGN,createdAt:new Date().toISOString(),tasks:cohort.tasks,schedule,configurations:CONFIGURATIONS,limits:LIMITS,costCeilings:COST_CEILINGS,cap:25,includesPreflight:true,catalogs,inputs,node:process.version,platform:process.platform,arch:process.arch,toolchain:await stageToolchain(root),sandboxSha256:await binaryHash(sandboxExecutable()),sourceArchiveSha256:await binaryHash(resolve(out,'frozen-source.tar.gz')),resources:{concurrency:1,temperatureC:null,minWorkerRAMGiB:1.75,minParentRAMGiB:2,minDiskGiB:6,workerHeapMiB:768,projectHeapMiB:384},primary:'Held-out targets and required regressions passing in pristine production-only reconstruction; completion status separate',budgetPolicy:'Reserve an entire four-arm task/repetition round before dispatch. Equal common token/wall/tool limits; dollar ceilings differ by model price and binding ceilings are explicitly censored.',replacementPolicy:'No automatic reruns. Stop on provider, configuration or evaluator failure, preserve all data and require an explicit documented protocol amendment before any replacement.',uncertainty:'Paired comparisons B-A, C-A, C-B, C-D; task-cluster resampling of complete four-arm rounds with both repetitions, report family/category coverage and missingness. Ties do not demonstrate equivalence.',taskGatePolicy:'Immutable validation receipt before first inference on each task; additional environments may be prepared between completed balanced rounds. No primary-result-based prompt or controller tuning.',exclusions:'Public benchmark contamination possible; repository family and task repetitions are correlated; native platform adaptation; estimated prices are not invoices; model/effort comparison includes Sol Medium vs Luna xhigh.'};
    await writeFile(resolve(out,'protocol.json'),JSON.stringify(protocol,null,2),{flag:'wx'});
  }
  const maxRounds=Number(process.argv.find(a=>a.startsWith('--max-rounds='))?.slice(13)??48);let completedNow=0;
  outer:for(const round of protocol.schedule){
    const done=await Promise.all(round.map(summary));if(done.every(Boolean))continue;
    if(done.some(Boolean))throw new Error('Partial round requires audit; no automatic replay');
    if(!reserveV4Round(structuredClone(await load(ledgerPath)),round)){status='spending_cap';break;}
    if(!validations.has(round[0].task)){
      if(failedGates.has(round[0].task)){await mkdir(resolve(out,'unsupported-environments'),{recursive:true});await writeFile(resolve(out,'unsupported-environments',round[0].task+'.json'),JSON.stringify(failedGates.get(round[0].task),null,2));continue;}
      status='additional_preparation_required';detail={task:round[0].task};break;
    }
    if(completedNow>=maxRounds){status='round_limit';break;}
    const disk=await statfs(root);if(freemem()<2*1024**3||disk.bavail*disk.bsize<6*1024**3){status='resource_limited';break;}
    const ledger=await load(ledgerPath);if(!reserveV4Round(ledger,round)){status='spending_cap';break;}await writeLedger(ledgerPath,ledger);
    for(const item of round){
      status='running';detail={cell:v4CellId(item),target:192};await state();console.log(JSON.stringify({event:'v4_attempt_start',...detail}));
      const start=performance.now();try{const run=await exec(process.execPath,['--max-old-space-size=768','scripts/intelligence-v4-worker.mjs','--cell='+v4CellId(item)],{cwd:root,windowsHide:true,timeout:2400000,maxBuffer:1024**2});if(run.stdout.trim())console.log(run.stdout.trim());}
      catch(error){await writeFile(resolve(out,'attempts',v4CellId(item)+'-a0.worker-failure.json'),JSON.stringify({item,error:error.message,stderr:error.stderr,stdout:error.stdout,code:error.code,signal:error.signal,workerWallMs:performance.now()-start},null,2));status='worker_failure';detail.error=error.message;break outer;}
      const result=await summary(item);await writeFile(resolve(out,'attempts',v4CellId(item)+'-a0.execution.json'),JSON.stringify({workerWallMs:performance.now()-start,finishedAt:new Date().toISOString()},null,2));
      if(!result||['infrastructure_or_evaluator_error','experimental_invalidation','evaluator_failure','provider_interruption','provider_failure','resource_stop'].includes(result.classification)){status=result?.classification??'missing_result';break outer;}
    }
    completedNow++;status='running';
  }
  if(status==='running'||status==='starting')status='finished';
}catch(error){status='audit_required';detail.error=error.stack;process.exitCode=1;}
finally{await release();await state();await lock.close();await unlink(lockPath);}
console.log(JSON.stringify({event:'v4_campaign_stopped',status,...detail}));
