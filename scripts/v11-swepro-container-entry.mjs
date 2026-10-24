// Actor-only runtime. The image and request contain public source/instructions only.
import {readFile,writeFile,mkdir,copyFile,chmod,access,readdir} from 'node:fs/promises';
import {join,dirname,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {executeV11} from '../src/v11/controller.mjs';
import {createNativeAdapter} from '../src/bench/native-codex.mjs';
import {captureTree,treeHash,hash,protectedFiles,enforceChecks,writeTree} from '../src/v9/workspace.mjs';
import {runProcess} from '../src/v9/process.mjs';
import {inspectContainer} from './v11-poly27-container-entry.mjs';
import {createWorkerTools} from '../src/v10/tools.mjs';

const read=async path=>JSON.parse(await readFile(path,'utf8'));
const save=async(path,value)=>{await mkdir(dirname(path),{recursive:true});await writeFile(path,JSON.stringify(value,null,2)+'\n',{flag:'wx'});};
export const CANARY_ID='suffice-swepro-protocol-canary';
export const CANARY_PROMPT='Implement def identity(value) in identity.py. Return the supplied object unchanged, preserving its identity for lists and dictionaries and its value for numbers, strings and None. Write and run your own public tests. This is a discarded infrastructure canary, not a benchmark task.';
export function actorPrompt(instruction){
  if(typeof instruction!=='string'||!instruction.trim())throw Error('Complete official public instruction is required');
  const prompt=instruction+'\n\nEnvironment and verification:\nWork in the supplied repository using its public source, documentation, and existing tests. The official problem statement, requirements and interfaces above are the task contract. Preserve existing tests and runner configuration; you may add your own checks. Network access is restricted to the model service. Acceptance tests, reference patches and private results are unavailable during this attempt. Use the project\'s existing local toolchain and test commands. Report checks actually executed and unresolved requirements.\n';
  if(prompt.length>80_000)throw Error('Complete public instruction exceeds the frozen V11 prompt allowance');return prompt;
}
async function git(workspace,args,options={}){
  const out=await runProcess('git',args,{cwd:workspace,timeoutMs:60_000,maxBytes:256_000_000,...options});
  if(out.exitCode!==0||out.error||out.timedOut||out.overflow||out.aborted)throw Error('Task Git operation failed: '+(out.error??out.stderr).slice(-600));return out.stdout;
}
async function credentials(strategy){
  const paths=strategy==='v11'?[['/run/pi-auth.json','/opt/suffice/.suffice/pi/auth.json']]:[['/run/native-auth.json','/home/node/.codex/auth.json']];
  for(const[source,target]of paths){await mkdir(dirname(target),{recursive:true});await copyFile(source,target);await chmod(target,0o600);}
}
export const privateWorkspaceArtifacts=(tree,workspace)=>[...tree.keys()].filter(path=>['gold_patch.diff','test_patch.patch'].includes(path.split('/').at(-1))).map(path=>workspace+'/'+path);
export function sourceAuditReady(result){return result.sourceHash===result.expectedSourceHash&&!result.exposed.length&&result.objectProbeReady&&result.fixingCommitObjectPresent===false&&result.refs.length<=1&&result.refs.every(x=>x.startsWith('refs/heads/'))&&result.gitProbeReady&&!result.unreachableObjects&&result.artifactProbeReady&&!result.privateArtifactPaths.length&&result.metadataProbeReady&&!result.gitMetadata.length&&result.localRuntimeReady;}
async function localRuntimeProbe(workspace){
  const tools=await createWorkerTools({workspace,runDir:'/results/local-runtime',signal:new AbortController().signal});
  const test="import unittest\nprint('LOCAL_WORKER_READY')\nclass Smoke(unittest.TestCase):\n def test_runtime(self): self.assertEqual(1+1,2)\nunittest.main()\n";
  const result=(await tools.find(x=>x.name==='exec').execute('local-runtime-probe',{command:['python3','-c',test],timeoutMs:30_000})).structuredContent;
  const node=await runProcess(process.execPath,['--version'],{timeoutMs:10_000});
  return{ready:result.exitCode===0&&!result.error&&!result.timedOut&&!result.overflow&&result.stdout.includes('LOCAL_WORKER_READY')&&node.exitCode===0&&/^v24\./.test(node.stdout),worker:result,node};
}
export async function inspectSource(){
  const task=await read('/opt/suffice/swepro-task.json'),workspace=task.workspace;
  const tree=await captureTree(workspace,{includeIgnored:true}),sourceHash=treeHash(tree),exposed=[];
  for(const path of ['/tests','/solution','/gold_patch.diff','/test_patch.patch'])try{await access(path);exposed.push(path);}catch{}
  const fix=/^instance_.+-([a-f0-9]{40})(?:-|$)/.exec(task.id)?.[1];if(!fix)throw Error('Invalid public task identifier');
  const fixingObject=await runProcess('git',['cat-file','--batch-check=%(objectname) %(objecttype)'],{cwd:workspace,timeoutMs:30_000,input:fix+'\n'});
  const objectProbeReady=fixingObject.exitCode===0&&!fixingObject.error&&!fixingObject.timedOut&&!fixingObject.overflow&&!fixingObject.aborted;
  const fixingObjectMissing=objectProbeReady&&fixingObject.stdout.trim()===fix+' missing';
  const refs=(await git(workspace,['for-each-ref','--format=%(refname)'])).trim().split('\n').filter(Boolean);
  const fsck=await runProcess('git',['fsck','--full','--unreachable','--no-reflogs'],{cwd:workspace,timeoutMs:180_000,maxBytes:2_000_000});
  const artifacts=await runProcess('find',['/','-xdev','(','-path','/proc','-o','-path','/dev','-o','-path','/sys','-o','-path',workspace,'-o','-path','/results','-o','-path','/run',')','-prune','-o','-type','f','(','-name','gold_patch.diff','-o','-name','test_patch.patch',')','-print'],{timeoutMs:120_000,maxBytes:1_000_000});
  const artifactProbeReady=artifacts.exitCode===0&&!artifacts.error&&!artifacts.timedOut&&!artifacts.overflow&&!artifacts.aborted;
  const gitProbeReady=fsck.exitCode===0&&!fsck.error&&!fsck.timedOut&&!fsck.overflow&&!fsck.aborted;
  const gitDirectory=(await git(workspace,['rev-parse','--absolute-git-dir'])).trim(),gitMetadata=[];
  for(const file of['ORIG_HEAD','FETCH_HEAD','MERGE_HEAD','REBASE_HEAD','CHERRY_PICK_HEAD','BISECT_LOG','objects/info/alternates'])try{await access(join(gitDirectory,file));gitMetadata.push(file);}catch{}
  try{for(const file of await readdir(join(gitDirectory,'hooks')))if(!file.endsWith('.sample'))gitMetadata.push('hooks/'+file);}catch(e){if(e.code!=='ENOENT')throw e;}
  const reflog=await runProcess('git',['reflog','show','--all','--format=%H'],{cwd:workspace,timeoutMs:30_000});
  const hooks=await runProcess('git',['config','--get','core.hooksPath'],{cwd:workspace,timeoutMs:30_000});
  if(reflog.stdout.trim())gitMetadata.push('reflog');if(hooks.stdout.trim())gitMetadata.push('core.hooksPath');
  const metadataProbeReady=gitDirectory===join(workspace,'.git')&&reflog.exitCode===0&&!reflog.error&&!reflog.timedOut&&!reflog.overflow&&!reflog.aborted&&[0,1].includes(hooks.exitCode)&&!hooks.error&&!hooks.timedOut&&!hooks.overflow&&!hooks.aborted;
  const localRuntime=await localRuntimeProbe(workspace);
  const result={id:task.id,workspace,sourceHash,expectedSourceHash:task.sourceHash,taskMetadataSha256:hash(await readFile('/opt/suffice/swepro-task.json')),files:tree.size,exposed,
    objectProbeReady,fixingCommitObjectPresent:objectProbeReady?!fixingObjectMissing:null,refs,unreachableObjects:fsck.stdout.trim(),gitProbeReady,
    artifactProbeReady,metadataProbeReady,gitMetadata,localRuntimeReady:localRuntime.ready,localRuntime,privateArtifactPaths:[...artifacts.stdout.trim().split('\n').filter(Boolean),...privateWorkspaceArtifacts(tree,workspace)]};
  result.ready=sourceAuditReady(result);
  return result;
}
export async function runActor(configPath='/config/actor.json',{canary=false}={}){
  const config=await read(configPath);let task=await read('/opt/suffice/swepro-task.json'),workspace=task.workspace;
  if(!['v11','native'].includes(config.strategy))throw Error('Unexpected SWEPro strategy');
  if(canary){if(config.task?.id!==CANARY_ID||config.task.prompt!==CANARY_PROMPT||config.timeoutMs!==300_000)throw Error('Unexpected public canary request');}
  else if(config.task?.id!==task.id||hash(config.task.prompt)!==task.instructionSha256||config.timeoutMs!==3000_000)throw Error('Unexpected SWEPro public actor request');
  await credentials(config.strategy);
  if(canary){
    workspace='/tmp/'+CANARY_ID;await mkdir(workspace);await writeFile(join(workspace,'identity.py'),'def identity(value):\n    raise NotImplementedError\n');await writeFile(join(workspace,'TASK.md'),CANARY_PROMPT+'\n');
    await git(workspace,['init','--quiet']);await git(workspace,['config','core.autocrlf','false']);await git(workspace,['add','--all']);
    await git(workspace,['-c','user.name=Suffice public canary','-c','user.email=canary@local','-c','commit.gpgsign=false','commit','--quiet','-m','public canary baseline']);
    task={id:CANARY_ID,workspace,sourceHash:treeHash(await captureTree(workspace,{includeIgnored:true}))};
  }
  const original=await captureTree(workspace,{includeIgnored:true});if(treeHash(original)!==task.sourceHash)throw Error('Official public source inventory changed');
  const protection=protectedFiles(original),baseCommit=(await git(workspace,['rev-parse','HEAD'])).trim();
  // Save a full public baseline tree without changing the project's HEAD/history.
  // This also handles existing ignored context without treating it as a new patch.
  await git(workspace,['add','--force','--all']);const baselineTree=(await git(workspace,['write-tree'])).trim();await git(workspace,['reset','--mixed','--quiet','HEAD']);
  await save('/results/actor-start.json',{at:new Date().toISOString(),id:task.id,strategy:config.strategy,sourceHash:task.sourceHash,baseCommit,baselineTree});
  const started=Date.now();let result,failure;
  try{
    const prompt=actorPrompt(config.task.prompt);
    result=config.strategy==='v11'?await executeV11({workspace,prompt,runDir:'/results/actor',strategy:'v11',timeoutMs:config.timeoutMs,maxCostUsd:Number.MAX_VALUE,checks:[],protectedPaths:[],contextPaths:[]}):
      await createNativeAdapter({bin:'/opt/codex/bin/codex',pricing:config.pricing['gpt-6.1-sol']})({role:'native',workspace,prompt,runDir:'/results/actor',model:'gpt-6.1-sol',effort:'high',timeoutMs:config.timeoutMs,maxCostUsd:Number.MAX_VALUE,sandbox:'danger-full-access'});
  }catch(e){failure=e.message;}
  const actorLatencyMs=Date.now()-started;let tree,violations=[],sealError=null,patch;
  try{violations=await enforceChecks(workspace,original,protection);tree=await captureTree(workspace,{includeIgnored:true});}
  catch(e){sealError=e.message;}
  try{
    if(tree)await git(workspace,['add','--force','--all']);
    // On snapshot failure preserve tracked partial work, without force-adding an
    // unbounded generated dependency/cache tree. The receipt marks this partial.
    patch=tree?await git(workspace,['diff','--cached','--binary',baselineTree,'--','.']):await git(workspace,['diff','--binary',baselineTree,'--','.']);
  }catch(e){sealError=[sealError,e.message].filter(Boolean).join('; ');}
  if(typeof patch==='string')await writeFile('/results/patch.diff',patch,{flag:'wx'});
  if(tree){await writeTree('/results/sealed-source',tree);await save('/results/source-files.json',[...tree].map(([path,v])=>({path,sha256:hash(v.bytes),bytes:v.bytes.length,mode:v.mode})));}
  await save('/results/actor-result.json',result??{status:'operational_failure',error:failure,costKnown:false,costUsd:null,knownCostFloorUsd:0});
  const row={at:new Date().toISOString(),id:task.id,strategy:config.strategy,status:sealError?'source_sealing_failure':result?.status??'operational_failure',error:failure??null,sealError,
    sourceHash:tree?treeHash(tree):null,sourceSealed:Boolean(tree)&&!sealError,patchSha256:typeof patch==='string'?hash(patch):null,protectionViolations:violations,
    costKnown:result?.costKnown===true,costUsd:result?.costKnown?result.costUsd:null,knownCostFloorUsd:result?.knownCostFloorUsd??0,
    actorLatencyMs,repairs:result?.repairs??0,takeovers:result?.takeovers??0,usage:result?.usage??null,completionEvidence:result?.completionEvidence??null,
    writerRetries:result?.writerRetries??0,verificationRecoveries:result?.verificationRecoveries??0,controllerPolicyEligible:result?.policyEligible??null,controllerPolicyViolations:result?.policyViolations??[]};
  if(canary){
    const code="import runpy\nf=runpy.run_path('identity.py')['identity']\nfor x in [42,'ready',None,[],{}]:\n assert f(x) is x\nprint('PUBLIC_CANARY_PASSED')\n";
    const probe=await runProcess('python3',['-c',code],{cwd:workspace,timeoutMs:30_000});row.canaryPassed=probe.exitCode===0&&!probe.error&&!probe.timedOut&&!probe.overflow&&probe.stdout.includes('PUBLIC_CANARY_PASSED');
    await save('/results/canary.json',{at:new Date().toISOString(),publicPrompt:CANARY_PROMPT,passed:row.canaryPassed,probe});
  }
  await save('/results/attempt.json',row);return row;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  const mode=process.argv[2];
  const action=mode==='run'?runActor(process.argv[3]):mode==='canary'?runActor(process.argv[3],{canary:true}):mode==='inspect'?inspectContainer().then(async clients=>{const source=await inspectSource();await save('/results/source-inspection.json',source);const result={...clients,source,ready:clients.ready&&source.ready};await writeFile('/results/inspection.json',JSON.stringify(result,null,2)+'\n');return result;}):Promise.reject(Error('Expected run, inspect or canary'));
  action.then(value=>console.log(JSON.stringify(value))).catch(e=>{console.error(e.stack);process.exitCode=1;});
}
