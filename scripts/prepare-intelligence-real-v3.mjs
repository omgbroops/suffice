import {mkdir,readFile,writeFile,cp,statfs,open,unlink,lstat,realpath,rm} from 'node:fs/promises';
import {resolve,relative} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {freemem} from 'node:os';
import {root} from '../src/runtime.mjs';
import {hash} from '../src/workspace.mjs';
import {snapshot,initializeWorkspaceGit} from '../src/intelligence-eval.mjs';
import {copySource,linkDependencies,dependencySnapshot,applyPatch} from '../src/native-intelligence-eval.mjs';
import {testSvelte,gradeSvelte} from '../src/svelte-intelligence-pilot.mjs';
import {classicBuildSteps,buildClassic} from '../src/classic-svelte-eval.mjs';
const exec=promisify(execFile),base=resolve(root,'.suffice/intelligence-real-v3'),published=resolve(root,'reports/repository-intelligence-eval-v2/real-v3');
const cohort=JSON.parse(await readFile(resolve(root,'benchmarks/intelligence-real-v3/cohort.json'),'utf8'));
const ledger=JSON.parse(await readFile(resolve(root,'reports/repository-intelligence-eval-v2/spending.json'),'utf8'));
if(ledger.entries.some(e=>e.state==='dispatched'))throw new Error('Do not prepare environments alongside scored inference');
if(process.platform!=='win32')throw new Error('Pinned native adaptation requires Windows');
await mkdir(base,{recursive:true});await mkdir(published,{recursive:true});
const leasePath=resolve(root,'.suffice/native-evaluation.lock');let lease;
try{lease=await open(leasePath,'wx');}catch(error){if(error.code==='EEXIST'){console.log(JSON.stringify({event:'preparation_waiting_for_exclusive_lease'}));process.exit(75);}throw error;}
await lease.writeFile(JSON.stringify({kind:'preparation',pid:process.pid,startedAt:new Date().toISOString()}));
try{
const adapterFingerprint=hash(JSON.stringify(await Promise.all(['benchmarks/intelligence-real-v3/native-tests.cjs','benchmarks/intelligence-real-v3/native-loader-base.cjs'].map(async path=>hash(await readFile(resolve(root,path)))))));
const resourceFloor=async()=>{const disk=await statfs(root);if(freemem()<1.75*1024**3||disk.bavail*disk.bsize<6*1024**3)throw new Error('RESOURCE_FLOOR: stop preparation without classifying unattempted tasks');};
async function download(url,path){try{await readFile(path);}catch(e){if(e.code!=='ENOENT')throw e;await exec('python',['-c','import urllib.request,sys;open(sys.argv[2],"wb").write(urllib.request.urlopen(sys.argv[1],timeout=60).read())',url,path],{windowsHide:true,timeout:90000});}}
function pinnedDependencies(pkg,lock){
  const excluded=/^(?:nightmare|electron(?:-.*)?|eslint(?:-.*)?|nyc|codecov|prettier|rollup-watch|husky|lint-staged)$/;
  const versions={};
  for(const [name,range]of Object.entries({...pkg.dependencies,...pkg.devDependencies}).sort(([a],[b])=>a.localeCompare(b))){
    if(excluded.test(name))continue;
    const selector=name+'@'+range;
    for(const block of lock.split(/\n(?=[^\s#])/)){
      const header=block.split('\n')[0].replace(/:$/,'');
      if(!header.split(', ').map(s=>s.replace(/^"|"$/g,'')).includes(selector))continue;
      const version=/\n  version "([^"]+)"/.exec(block)?.[1];
      if(version)versions[name]=version;
      break;
    }
    if(!versions[name])throw new Error('Cannot pin upstream dependency '+selector);
  }
  return {name:'svelte-real-v3-native-env',private:true,dependencies:versions};
}
async function dependenciesFor(pkg,lock){
  const pinned=pinnedDependencies(pkg,lock),key=hash(JSON.stringify(pinned)).slice(0,20),directory=resolve(base,'dependencies',key);
  await mkdir(directory,{recursive:true});
  try{
    const receipt=JSON.parse(await readFile(resolve(directory,'receipt.json'),'utf8'));
    if(JSON.stringify(await dependencySnapshot(resolve(directory,'node_modules')))!==JSON.stringify(receipt.hashes))throw new Error('Shared dependency drift');
    return {directory,key,receipt};
  }catch(e){if(e.code!=='ENOENT')throw e;}
  await writeFile(resolve(directory,'package.json'),JSON.stringify(pinned,null,2));
  await exec('cmd.exe',['/d','/s','/c','npm install --package-lock-only --ignore-scripts --legacy-peer-deps --no-audit --no-fund --loglevel=error'],{cwd:directory,windowsHide:true,timeout:180000,maxBuffer:1024**2});
  await exec('cmd.exe',['/d','/s','/c','npm ci --ignore-scripts --legacy-peer-deps --no-audit --no-fund --loglevel=error'],{cwd:directory,windowsHide:true,timeout:180000,maxBuffer:1024**2});
  const globPath=resolve(directory,'node_modules/tiny-glob/sync.js');
  try{const original=await readFile(globPath,'utf8');if(!original.includes('isMatch = lexer.regex.test(relpath);'))throw new Error('Unaudited tiny-glob implementation');await writeFile(globPath,original.replace('isMatch = lexer.regex.test(relpath);',"isMatch = lexer.regex.test(relpath.replace(/\\\\/g, '/'));").replace('output.push(relative(opts.cwd, fullpath))',"output.push(relative(opts.cwd, fullpath).replace(/\\\\/g, '/'))"));}catch(e){if(e.code!=='ENOENT')throw e;}
  const nodeSource=resolve(root,'.suffice/intelligence-svelte-outro-pilot/dependencies/node_modules/.suffice-node16/node.exe');
  const trusted=JSON.parse(await readFile(resolve(root,'.suffice/intelligence-svelte-outro-pilot/dependency-hashes.json'),'utf8'));
  if(hash(await readFile(nodeSource))!==trusted['.suffice-node16/node.exe'])throw new Error('Pinned Node16 binary drift');
  await mkdir(resolve(directory,'node_modules/.suffice-node16'),{recursive:true});await cp(nodeSource,resolve(directory,'node_modules/.suffice-node16/node.exe'));
  const receipt={key,pinned,lockSha256:hash(await readFile(resolve(directory,'package-lock.json'))),hashes:await dependencySnapshot(resolve(directory,'node_modules')),node:'16.20.2',nativeDependencyPatch:'tiny-glob sync slash normalization where present'};
  await writeFile(resolve(directory,'receipt.json'),JSON.stringify(receipt));
  const target=resolve(published,'dependencies',key);await mkdir(target,{recursive:true});
  await cp(resolve(directory,'package.json'),resolve(target,'package.json'));await cp(resolve(directory,'package-lock.json'),resolve(target,'package-lock.json'));
  await writeFile(resolve(target,'receipt.json'),JSON.stringify({...receipt,hashes:undefined,contentHashesSha256:hash(JSON.stringify(receipt.hashes))},null,2));
  return {directory,key,receipt};
}
const selected=process.argv.find(a=>a.startsWith('--task='))?.slice(7),results=[];
for(const item of cohort.tasks.filter(t=>!selected||t.id===selected)){
  await resourceFloor();
  const directory=resolve(base,'tasks',item.id),target=resolve(published,'validation',item.id);await mkdir(directory,{recursive:true});await mkdir(target,{recursive:true});
  try{
    const existing=JSON.parse(await readFile(resolve(directory,'validation.json'),'utf8'));
    if(existing.valid&&existing.nativeAdapterVersion===2&&existing.nativeAdapterSha256===adapterFingerprint){
      if(existing.recordSha256!==item.recordSha256||JSON.stringify(await snapshot(resolve(directory,'baseline')))!==JSON.stringify(existing.baselineHashes))throw new Error('Validated task content drift');
      console.log(JSON.stringify({event:'validated_task_reused',task:item.id}));results.push({id:item.id,valid:true});continue;
    }
    if(!existing.valid&&!process.argv.includes('--retry-infrastructure')){results.push({id:item.id,valid:false,classification:existing.classification});continue;}
  }catch(e){if(e.code!=='ENOENT')throw e;}
  const attempt=String(Date.now()),attemptDir=resolve(directory,'validation',attempt),attemptPublished=resolve(target,attempt);await mkdir(attemptDir,{recursive:true});await mkdir(attemptPublished,{recursive:true});
  const receipt={version:1,nativeAdapterVersion:2,nativeAdapterSha256:adapterFingerprint,task:item.id,recordSha256:item.recordSha256,valid:false,attempt,category:item.category};
  console.log(JSON.stringify({event:'task_preparation_start',task:item.id}));
  try{
    const recordBytes=await readFile(resolve(root,'benchmarks/intelligence-real-v3',item.record));if(hash(recordBytes)!==item.recordSha256)throw new Error('Frozen record drift');
    const record=JSON.parse(recordBytes),archive=resolve(directory,'source.tar.gz');await download(`https://codeload.github.com/${record.repo}/tar.gz/${record.base_commit}`,archive);receipt.archiveSha256=hash(await readFile(archive));
    await exec('tar',['-xzf',archive,'-C',directory],{windowsHide:true,timeout:60000});
    const upstream=resolve(directory,'svelte-'+record.base_commit),pkg=JSON.parse(await readFile(resolve(upstream,'package.json'),'utf8')),steps=classicBuildSteps(pkg);
    const deps=await dependenciesFor(pkg,await readFile(resolve(upstream,'yarn.lock'),'utf8'));receipt.dependencyKey=deps.key;receipt.dependencyLockSha256=deps.receipt.lockSha256;receipt.buildSteps=steps;receipt.projectVersion=pkg.version;
    const baseline=resolve(directory,'baseline');
    try{
      const owner=await realpath(directory),actual=await realpath(baseline);
      if(relative(owner,actual).replaceAll('\\','/').toLowerCase()!=='baseline'||actual.toLowerCase()!==baseline.toLowerCase())throw new Error('Refusing baseline cleanup outside the owned task directory');
      try{const link=resolve(baseline,'node_modules');if((await lstat(link)).isSymbolicLink())await unlink(link);}catch(error){if(error.code!=='ENOENT')throw error;}
      await rm(baseline,{recursive:true,force:true});
    }catch(error){if(error.code!=='ENOENT')throw error;}
    await copySource(upstream,baseline);
    await cp(resolve(root,'benchmarks/intelligence-real-v3/native-loader-base.cjs'),resolve(baseline,'native-loader-base.cjs'));
    await cp(resolve(root,'benchmarks/intelligence-real-v3/native-tests.cjs'),resolve(baseline,'native-tests.cjs'));
    const scored=[...record.FAIL_TO_PASS,...record.PASS_TO_PASS],excludedRuntimeSamples=scored.some(title=>/^runtime binding-select \(/.test(title))?[]:['binding-select'];
    receipt.nativeEnvironment={excludedRuntimeSamples,reason:'Known Node16/jsdom legacy selection assertion incompatibility; isolated execution can exhaust the 384 MiB heap. Omitted cases are not counted as passes or pending. All official labels are retained.'};
    await writeFile(resolve(baseline,'native-environment.json'),JSON.stringify(receipt.nativeEnvironment,null,2));
    const verify=`const {execFileSync}=require('child_process'),path=require('path');\nconst runtime=path.resolve('node_modules/.suffice-node16/node.exe'),env={...process.env,NODE_OPTIONS:''};\nfor(const args of ${JSON.stringify(steps)})execFileSync(runtime,['--max-old-space-size=384',...args],{stdio:'inherit',env,windowsHide:true});\nexecFileSync(runtime,['--max-old-space-size=384','node_modules/mocha/bin/_mocha','--opts','NUL','native-tests.cjs','--reporter','spec','--exit'],{stdio:'inherit',env,windowsHide:true});\n`;
    await writeFile(resolve(baseline,'native-verify.cjs'),verify);await linkDependencies(baseline,deps.directory);
    const initialBuild=await buildClassic(baseline,steps);await writeFile(resolve(attemptPublished,'initial-build.json'),JSON.stringify(initialBuild,null,2));if(initialBuild.status!=='passed')throw new Error('Baseline build failed: '+initialBuild.error);
    receipt.baselineHashes=await snapshot(baseline);await writeFile(resolve(directory,'dependency-hashes.json'),JSON.stringify(deps.receipt.hashes));
    // svelteTask expects this directory; a junction shares the pinned environment.
    const {symlink}=await import('node:fs/promises');const link=resolve(directory,'dependencies');try{await lstat(link);if(await realpath(link)!==await realpath(deps.directory))throw new Error('Task dependency junction drift');}catch(e){if(e.code!=='ENOENT')throw e;await symlink(deps.directory,link,'junction');}
    const clone=async name=>{const workspace=resolve(attemptDir,name);await mkdir(workspace,{recursive:true});await copySource(baseline,workspace);await initializeWorkspaceGit(workspace);await linkDependencies(workspace,deps.directory);return workspace;};
    const observations={},control=await clone('public');observations.public=await testSvelte(control,resolve(attemptPublished,'public-mocha.json'));if(observations.public.status!=='reported'){await writeFile(resolve(attemptPublished,'public-execution.json'),JSON.stringify(observations.public,null,2));throw new Error('Public execution failed: '+observations.public.status);}
    receipt.knownFailures=observations.public.report.failures.map(t=>t.fullTitle);receipt.knownPending=observations.public.report.pending.map(t=>t.fullTitle);
    if(receipt.knownFailures.some(n=>!/^runtime binding-select \(/.test(n)&&!/^cli (dir-sourcemap|sourcemap)$/.test(n)))throw new Error('Unclassified public failures: '+receipt.knownFailures.join(', '));
    if(receipt.knownFailures.some(n=>record.FAIL_TO_PASS.includes(n)||record.PASS_TO_PASS.includes(n)))throw new Error('A scored title fails in the public baseline');
    receipt.gates={};
    for(const variant of ['empty','reference']){
      const workspace=await clone(variant);if(variant==='reference')await applyPatch(workspace,record.patch,resolve(attemptDir,'reference.diff'));await applyPatch(workspace,record.test_patch,resolve(attemptDir,'tests.diff'));
      const build=await buildClassic(workspace,steps);await writeFile(resolve(attemptPublished,variant+'-build.json'),JSON.stringify(build,null,2));if(build.status!=='passed')throw new Error(variant+' build failed: '+build.error);
      const observed=await testSvelte(workspace,resolve(attemptPublished,variant+'-mocha.json'));if(observed.status!=='reported'){await writeFile(resolve(attemptPublished,variant+'-execution.json'),JSON.stringify(observed,null,2));throw new Error(variant+' execution failed: '+observed.status);}
      const titles=observed.report.tests.map(t=>t.fullTitle),counts=Object.fromEntries([...new Set(titles)].sort().map(n=>[n,titles.filter(t=>t===n).length]));receipt.expectedTitleCounts??=counts;if(JSON.stringify(counts)!==JSON.stringify(receipt.expectedTitleCounts))throw new Error('Reference/empty test inventory mismatch');
      receipt.gates[variant]={acceptance:gradeSvelte(observed,record.FAIL_TO_PASS,receipt),regression:gradeSvelte(observed,record.PASS_TO_PASS,{...receipt,otherEndpointTests:record.FAIL_TO_PASS})};
    }
    receipt.valid=receipt.gates.empty.acceptance.status==='failed'&&receipt.gates.empty.acceptance.requiredPassed===0&&receipt.gates.empty.acceptance.missing.length===0&&receipt.gates.empty.regression.status==='passed'&&receipt.gates.reference.acceptance.status==='passed'&&receipt.gates.reference.regression.status==='passed';
    receipt.classification=receipt.valid?'validated':'evaluator_gate_failure';
    receipt.limitations=['Native Windows adaptation, not an official SWE-PolyBench score.','All dataset target/regression titles retained; known unscored failures, omitted native-incompatible samples and pending tests are never counted as passes.','Nightmare/Electron and the recorded legacy selection sample are excluded only where scored title coverage remains complete.','Frozen test-title multiplicities prevent dropped duplicate cases.','Original issue descriptions and exact upstream tests may still differ in intended feature details; runtime targets are separately reported.','Native process scope is a contract, not an OS sandbox.'];
  }catch(error){receipt.classification='infrastructure_or_evaluator_error';receipt.error=error.stack;}
  receipt.finishedAt=new Date().toISOString();receipt.preparationWallMs=Date.now()-Number(attempt);
  await writeFile(resolve(directory,'validation.json'),JSON.stringify(receipt,null,2));await writeFile(resolve(target,'validation.json'),JSON.stringify(receipt,null,2));await writeFile(resolve(attemptPublished,'validation.json'),JSON.stringify(receipt,null,2));
  results.push({id:item.id,valid:receipt.valid,classification:receipt.classification,error:receipt.error});console.log(JSON.stringify({event:'task_preparation_end',...results.at(-1)}));
}
const aggregate=[];for(const task of cohort.tasks){try{const value=JSON.parse(await readFile(resolve(base,'tasks',task.id,'validation.json'),'utf8'));aggregate.push({id:task.id,category:task.category,valid:value.valid&&value.nativeAdapterSha256===adapterFingerprint,classification:value.nativeAdapterSha256===adapterFingerprint?value.classification:'adapter_refresh_required',error:value.error});}catch(error){if(error.code!=='ENOENT')throw error;aggregate.push({id:task.id,category:task.category,valid:false,classification:'not_prepared'});}}
await writeFile(resolve(published,'preparation.json'),JSON.stringify({cohortSha256:hash(await readFile(resolve(root,'benchmarks/intelligence-real-v3/cohort.json'))),latestInvocation:results,results:aggregate},null,2));
}catch(error){if(error.message.startsWith('RESOURCE_FLOOR')){console.error(JSON.stringify({event:'preparation_resource_stop',error:error.message}));process.exitCode=75;}else throw error;}finally{await lease.close();await unlink(leasePath);}
