// Public technical eligibility only. No inference or candidate grading occurs here.
import {readFile,writeFile,mkdir,readdir,copyFile,statfs} from 'node:fs/promises';
import {join,resolve,dirname} from 'node:path';
import {pathToFileURL} from 'node:url';
import {runProcess} from '../src/v9/process.mjs';
import {hash} from '../src/v9/workspace.mjs';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {randomBytes} from 'node:crypto';
const exec=promisify(execFile);

export const UPSTREAM_COMMIT='66f92766bba642462d4bbe5479e83f91f9211862';
export const SEED='suffice-v11-swepro-v2-20261023';
export const DEFAULT_UPSTREAM=resolve(import.meta.dirname,'../.suffice/swepro-v2-upstream');
export const save=async(path,value)=>{await mkdir(dirname(path),{recursive:true});await writeFile(path,JSON.stringify(value,null,2)+'\n');};
export const MIN_FREE_BYTES=32*1024**3;
export function assertDiskHeadroom(availableBytes){if(!Number.isFinite(availableBytes)||availableBytes<MIN_FREE_BYTES)throw Error('Qualification paused: fewer than 32 GiB free or available disk could not be established; preserve existing images and volumes');}
async function diskCheckpoint(root,phase,id){
  const usage=await statfs(root),availableBytes=usage.bavail*usage.bsize;
  await save(join(root,'disk-checkpoints',Date.now()+'-'+phase+'-'+hash(id).slice(0,16)+'.json'),{at:new Date().toISOString(),phase,id,availableBytes,minimumFreeBytes:MIN_FREE_BYTES});
  assertDiskHeadroom(availableBytes);
}
export async function docker(args,options={}){
  const result=await runProcess('docker',args,{timeoutMs:120_000,maxBytes:4_000_000,...options});
  if(!options.allowFailure&&(result.exitCode!==0||result.error||result.timedOut||result.overflow))throw Error(`Docker ${args[0]} failed: ${(result.error??result.stderr??result.stdout).slice(-1200)}`);
  return result;
}
export function publicOrder(ids){
  if(!Array.isArray(ids)||new Set(ids).size!==ids.length)throw Error('Task identifiers must be unique');
  const groups=new Map();
  for(const id of ids){const repo=/^instance_([A-Za-z0-9_.-]+__[A-Za-z0-9_.-]+)-[a-f0-9]{40}(?:-[A-Za-z0-9_-]+)?$/.exec(id)?.[1];if(!repo)throw Error('Invalid upstream task ID');const rows=groups.get(repo)??[];rows.push({id,repo,rank:hash(SEED+'\0'+id)});groups.set(repo,rows);}
  const repos=[...groups.keys()].sort((a,b)=>hash(SEED+'\0'+a).localeCompare(hash(SEED+'\0'+b)));
  for(const rows of groups.values())rows.sort((a,b)=>a.rank.localeCompare(b.rank));
  const out=[];for(let i=0;out.length<ids.length;i++)for(const repo of repos)if(groups.get(repo)[i])out.push(groups.get(repo)[i]);
  return out;
}
export async function upstreamTasks(upstream=DEFAULT_UPSTREAM){
  const rev=await runProcess('git',['-C',upstream,'rev-parse','HEAD'],{timeoutMs:10_000});if(rev.exitCode!==0||rev.stdout.trim()!==UPSTREAM_COMMIT)throw Error('Unexpected SWE-bench Pro V2 upstream revision');
  const pinned=await runProcess('git',['-C',upstream,'show',UPSTREAM_COMMIT+':v2/SHA256SUMS'],{timeoutMs:30_000,maxBytes:4_000_000});
  if(pinned.exitCode!==0||pinned.error||pinned.overflow)throw Error('Cannot read pinned upstream checksums');
  const sums=pinned.stdout,expected=new Map(sums.trim().split(/\r?\n/).map(line=>{const m=/^([a-f0-9]{64})\s+(.+)$/.exec(line);if(!m)throw Error('Malformed upstream checksum');return[m[2].replace(/^\.\//,''),m[1]];}));
  const ids=(await readdir(join(upstream,'v2/tasks'),{withFileTypes:true})).filter(x=>x.isDirectory()).map(x=>x.name);
  if(ids.length!==642)throw Error('Expected the pinned 642-task V2 release');
  return{upstream:resolve(upstream),expected,order:publicOrder(ids)};
}
export async function verifiedTask(upstream,id,expected){
  const directory=join(upstream,'v2/tasks',id),files=[];
  async function walk(root,prefix=''){for(const entry of(await readdir(root,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))){const rel=prefix+entry.name,path=join(root,entry.name);if(entry.isDirectory())await walk(path,rel+'/');else if(entry.isFile()){
    const key='tasks/'+id+'/'+rel;let bytes=await readFile(path);
    // Windows checkout conversion must not change executable verifier bytes.
    // Recover the exact pinned Git blob, then verify the release checksum.
    if(expected.get(key)!==hash(bytes)){bytes=(await exec('git',['-C',upstream,'show',UPSTREAM_COMMIT+':v2/'+key],{encoding:'buffer',maxBuffer:64_000_000})).stdout;if(expected.get(key)!==hash(bytes))throw Error('Upstream task checksum differs: '+key);await writeFile(path,bytes);}
    files.push({path:rel,sha256:hash(bytes)});
  }else throw Error('Unexpected task file type');}}
  await walk(directory);const instruction=await readFile(join(directory,'instruction.md'),'utf8'),toml=await readFile(join(directory,'task.toml'),'utf8');
  const image=/docker_image\s*=\s*"([^"]+)"/.exec(toml)?.[1];if(image!=='ghcr.io/scaleapi/swe-bench_pro-v2:'+id)throw Error('Unexpected V2 image');
  return{id,directory,instruction,image,files,taskSha256:hash(JSON.stringify(files))};
}
export const PROBE_SCRIPT=`import {execFileSync} from 'node:child_process';
import{lstat,access,readdir}from'node:fs/promises';
import{captureTree,treeHash}from'/suffice-probe/workspace.mjs';
let workspace;for(const p of ['/app','/testbed'])try{execFileSync('git',['-C',p,'rev-parse','--show-toplevel'],{stdio:'pipe'});workspace=p;break}catch{}
if(!workspace)throw Error('No task Git workspace');process.chdir(workspace);
const names=[...new Set(execFileSync('git',['ls-files','--cached','--others','--exclude-standard','-z'],{encoding:'utf8',maxBuffer:32e6}).split('\\0').concat(execFileSync('git',['ls-files','--others','--ignored','--exclude-standard','-z'],{encoding:'utf8',maxBuffer:32e6}).split('\\0')).filter(Boolean))];
let bytes=0,symlinks=0,special=0;for(const p of names)try{const s=await lstat(p);bytes+=s.size;if(s.isSymbolicLink())symlinks++;else if(!s.isFile())special++;}catch(e){if(e.code!=='ENOENT')throw e;}
const exposed=[];for(const p of ['/tests','/solution','/gold_patch.diff','/test_patch.patch'])try{await access(p);exposed.push(p);}catch{}
let core;try{const tree=await captureTree(workspace,{includeIgnored:true});core={eligible:true,files:tree.size,sourceHash:treeHash(tree)}}catch(e){core={eligible:false,error:e.message}}
const git=args=>execFileSync('git',args,{encoding:'utf8',maxBuffer:8e6}).trim();
let fsck=null,fsckError=null;try{fsck=execFileSync('git',['fsck','--full','--unreachable','--no-reflogs'],{encoding:'utf8',stdio:['ignore','pipe','pipe'],maxBuffer:8e6,timeout:30000}).trim().slice(0,4000)}catch(e){fsckError=e.message.slice(0,300)}
const result={workspace,files:names.length,bytes,symlinks,special,core,exposed,git:{head:git(['rev-parse','HEAD']),commitCount:Number(git(['rev-list','--all','--count'])),refs:git(['for-each-ref','--format=%(refname)']).split('\\n').filter(Boolean),fsck,fsckError}};
console.log(JSON.stringify(result));
`;
export async function stageProbe(root){
  const directory=join(resolve(root),'public-probe');await mkdir(directory,{recursive:true});
  await copyFile(resolve(import.meta.dirname,'../src/v9/workspace.mjs'),join(directory,'workspace.mjs'));
  await writeFile(join(directory,'probe.mjs'),PROBE_SCRIPT);
  const created=await docker(['create','node:24.18.0-bookworm']);const name=created.stdout.trim();
  try{await docker(['cp',name+':/usr/local/bin/node',join(directory,'node')]);}finally{await docker(['rm','--force',name]);}
  return directory;
}
export async function runPublicProbe({imageId,directory,probe,dockerRun=docker}){
  if(!/^sha256:[a-f0-9]{64}$/.test(imageId))throw Error('Public probe requires an immutable image ID');
  const name='suffice-swepro-probe-'+randomBytes(7).toString('hex'),errors=[];
  const command=['run','--name',name,'--rm','--network','none','--read-only','--cpus','1','--memory','2g','--pids-limit','128',
    '--mount',`type=bind,source=${resolve(probe)},target=/suffice-probe,readonly`,'--entrypoint','/suffice-probe/node',imageId,'/suffice-probe/probe.mjs'];
  await save(join(directory,'probe-request.json'),{at:new Date().toISOString(),name,imageId,command});
  let process,removed=false;
  try{process=await dockerRun(command,{allowFailure:true,timeoutMs:180_000});}catch(e){process={exitCode:null,error:e.message,stdout:'',stderr:''};}
  finally{
    try{await dockerRun(['rm','--force',name],{allowFailure:true});}catch(e){errors.push({step:'remove',error:e.message});}
    try{const out=await dockerRun(['ps','--all','--filter',`name=^/${name}$`,'--format','{{.ID}}'],{allowFailure:true});removed=out.exitCode===0&&!out.error&&!out.timedOut&&!out.overflow&&!out.aborted&&!out.stdout.trim();if(!removed)errors.push({step:'removal_confirmation',error:'Probe container removal was not confirmed'});}catch(e){errors.push({step:'removal_confirmation',error:e.message});}
  }
  const result={name,process,removed,errors};await save(join(directory,'probe-closure.json'),result);return result;
}
export function reusableProbe(previous,task){return Boolean(previous?.probe&&!previous.error&&previous.probeClosure?.removed===true&&previous.probeClosure?.processCompleted===true&&previous.taskSha256===task.taskSha256&&previous.image===task.image);}
async function recoverProbeClosures(root,previous){
  const directory=join(root,'eligibility');let instances;try{instances=await readdir(directory,{withFileTypes:true});}catch(e){if(e.code==='ENOENT')return;throw e;}
  for(const instance of instances.filter(x=>x.isDirectory()))for(const attempt of(await readdir(join(directory,instance.name),{withFileTypes:true})).filter(x=>x.isDirectory()&&x.name.startsWith('attempt-'))){
    const folder=join(directory,instance.name,attempt.name);let request,closed;
    try{request=JSON.parse(await readFile(join(folder,'probe-request.json'),'utf8'));}catch(e){if(e.code==='ENOENT')continue;throw e;}
    try{closed=JSON.parse(await readFile(join(folder,'probe-closure.json'),'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
    if(closed?.removed===true)continue;
    if(!/^suffice-swepro-probe-[a-f0-9]{14}$/.test(request.name))throw Error('Unsafe recorded probe name');
    await docker(['rm','--force',request.name],{allowFailure:true});const out=await docker(['ps','--all','--filter',`name=^/${request.name}$`,'--format','{{.ID}}']);
    if(out.stdout.trim())throw Error('A previous public probe could not be removed');
    await save(join(folder,'probe-resume-closure-'+Date.now()+'.json'),{at:new Date().toISOString(),name:request.name,removed:true});
  }
  // The first pre-fix probe used --rm without a name. Do not assume it is gone:
  // confirm no container from that original task image remains before re-probing.
  for(const row of previous?.results??[])if(row.probe&&!row.probeClosure&&/^sha256:[a-f0-9]{64}$/.test(row.imageId)){
    const out=await docker(['ps','--all','--filter','ancestor='+row.imageId,'--format','{{.ID}} {{.Names}}']);if(out.stdout.trim())throw Error('Legacy unnamed public probe requires explicit closure inspection');
    await save(join(root,'legacy-probe-closure-'+hash(row.id).slice(0,16)+'.json'),{at:new Date().toISOString(),id:row.id,imageId:row.imageId,removed:true});
  }
}
export async function qualify(root,{upstream=DEFAULT_UPSTREAM,count=8,maxCandidates=33}={}){
  root=resolve(root);const data=await upstreamTasks(upstream),results=[],selected=[];
  const load=async path=>{try{return JSON.parse(await readFile(path,'utf8'));}catch(e){if(e.code==='ENOENT')return null;throw e;}};
  const priorRule=await load(join(root,'selection-rule.json')),prior=await load(join(root,'eligibility.json'));
  if(priorRule&&(priorRule.upstreamCommit!==UPSTREAM_COMMIT||priorRule.seed!==SEED||priorRule.count!==count||JSON.stringify(priorRule.order)!==JSON.stringify(data.order)))throw Error('Cannot change the public subset selection rule on resume');
  if(prior&&(prior.upstreamCommit!==UPSTREAM_COMMIT||prior.requested!==count))throw Error('Existing qualification uses another release or subset size');
  await recoverProbeClosures(root,prior);const probe=await stageProbe(root);
  if(!priorRule)await save(join(root,'selection-rule.json'),{at:new Date().toISOString(),upstreamCommit:UPSTREAM_COMMIT,seed:SEED,count,method:'Hash-ranked task order, round-robin across hash-ranked repositories; admit only unmodified public source trees accepted by the actual V11 snapshot primitive. No candidate model or acceptance outcomes used.',order:data.order});
  await save(join(root,'qualification-runs',Date.now()+'.json'),{at:new Date().toISOString(),maxCandidates,priorResults:prior?.results?.length??0});
  const cached=new Map((prior?.results??[]).map(row=>[row.id,row]));
  for(const row of data.order.slice(0,maxCandidates)){
    const task=await verifiedTask(data.upstream,row.id,data.expected),previous=cached.get(row.id);
    if(reusableProbe(previous,task)){results.push(previous);if(previous.eligible)selected.push(previous);if(selected.length===count)break;continue;}
    const directory=join(root,'eligibility',row.id,'attempt-'+Date.now());await mkdir(directory,{recursive:true});
    await diskCheckpoint(root,'before-pull',row.id);
    console.log(JSON.stringify({phase:'pull',id:row.id}));const pulled=await docker(['pull','--platform','linux/amd64',task.image],{timeoutMs:1800_000,allowFailure:true,stdoutPath:join(directory,'pull-stdout.txt'),stderrPath:join(directory,'pull-stderr.txt')});
    let result={...row,taskSha256:task.taskSha256,image:task.image,eligible:false,evidenceDirectory:directory};
    if(pulled.exitCode!==0||pulled.error||pulled.timedOut)result.error='Image pull failed';
    else{
      result.imageId=(await docker(['image','inspect',task.image,'--format','{{.Id}}'])).stdout.trim();
      const closed=await runPublicProbe({imageId:result.imageId,directory,probe}),out=closed.process;
      const processCompleted=out.exitCode===0&&!out.error&&!out.timedOut&&!out.overflow&&!out.aborted;
      result.probeClosure={name:closed.name,removed:closed.removed,processCompleted,errors:closed.errors};
      try{result.probe=JSON.parse(out.stdout);result.eligible=out.exitCode===0&&result.probe.core.eligible;}catch{result.error='Public technical probe failed';}
      if(!processCompleted){result.eligible=false;result.error='Public technical probe did not complete';}
      if(!closed.removed){result.eligible=false;result.error='Public probe closure was not confirmed';}
    }
    results.push(result);if(result.eligible)selected.push(result);await save(join(directory,'eligibility.json'),result);await save(join(root,'eligibility.json'),{at:new Date().toISOString(),upstreamCommit:UPSTREAM_COMMIT,requested:count,complete:selected.length===count,selected,results});
    await diskCheckpoint(root,'after-probe',row.id);
    console.log(JSON.stringify({phase:'qualified',id:row.id,eligible:result.eligible,reason:result.error??result.probe?.core?.error,selected:selected.length}));
    if(result.error)throw Error('Qualification infrastructure failed; repair or resume before continuing the public task order');
    if(selected.length===count)break;
  }
  return{complete:selected.length===count,selected,results};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  qualify(process.argv[2],{maxCandidates:Number(process.argv[3]??33)}).then(r=>console.log(JSON.stringify({complete:r.complete,selected:r.selected.length}))).catch(e=>{console.error(e.stack);process.exitCode=1;});
}
