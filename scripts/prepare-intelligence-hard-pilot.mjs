import {mkdir,readFile,writeFile,statfs,cp} from 'node:fs/promises';
import {resolve} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {pilotRoot,pilotTask as task,record} from '../benchmarks/intelligence-hard-pilot/tasks.mjs';
import {copySource,linkDependencies,applyPatch,runMocha,dependencySnapshot} from '../src/native-intelligence-eval.mjs';
import {hash} from '../src/workspace.mjs';
import {snapshot,initializeWorkspaceGit} from '../src/intelligence-eval.mjs';
const exec=promisify(execFile),disk=await statfs(process.cwd());
if(disk.bavail*disk.bsize<6*1024**3)throw new Error('Need 6 GiB free disk');
await mkdir(pilotRoot,{recursive:true});
const archive=resolve(pilotRoot,'source.tar.gz');
try{await readFile(archive);}catch(e){if(e.code!=='ENOENT')throw e;await exec('python',['-c','import urllib.request,sys; open(sys.argv[2],"wb").write(urllib.request.urlopen(sys.argv[1],timeout=60).read())',`https://codeload.github.com/${record.repo}/tar.gz/${record.base_commit}`,archive],{windowsHide:true,timeout:90000});}
const bytes=await readFile(archive);if(bytes.length>8*1024**2||hash(bytes)!=='52f1f8d5570e3ac04a372204a15afa4e49b4f83e27fd2dda2a2ab86367880f0f')throw new Error('Archive size/hash differs from pinned input');
await exec('tar',['-xzf',archive,'-C',pilotRoot],{windowsHide:true});
const upstream=resolve(pilotRoot,'axios-'+record.base_commit);
await copySource(upstream,task.baseline);
const dependencies=resolve(pilotRoot,'dependencies');await mkdir(dependencies,{recursive:true});
const lock=JSON.parse(await readFile(resolve(upstream,'package-lock.json'),'utf8'));
const names=['mocha','follow-redirects','form-data','proxy-from-env','formidable','express','multer','body-parser','stream-throttle','dev-null','abortcontroller-polyfill','get-stream','sinon'];
const pins=Object.fromEntries(names.map(n=>[n,lock.packages['node_modules/'+n].version]));pins['formdata-node']='5.0.0';
await writeFile(resolve(dependencies,'package.json'),JSON.stringify({name:'suffice-native-pilot-dependencies',private:true,dependencies:pins},null,2));
const frozenLock=resolve('reports/repository-intelligence-eval-v2/hard-native-pilot/dependency-lock.json');
await cp(frozenLock,resolve(dependencies,'package-lock.json'));
// Install only the pinned runtime/test subset, not browsers, release tools or build chains.
const command=process.platform==='win32'?'cmd.exe':'npm',args=process.platform==='win32'?['/d','/s','/c','npm ci --ignore-scripts --no-audit --no-fund --loglevel=error']:['ci','--ignore-scripts','--no-audit','--no-fund','--loglevel=error'];
console.log('Installing small native test dependency subset');
await exec(command,args,{cwd:dependencies,windowsHide:true,timeout:180000,maxBuffer:1024**2});
const dependencyHashes=await dependencySnapshot(resolve(dependencies,'node_modules'));
await writeFile(resolve(pilotRoot,'dependency-hashes.json'),JSON.stringify(dependencyHashes));
await linkDependencies(task.baseline,dependencies);
const gates={};
const validationRoot=resolve(pilotRoot,'validation',String(Date.now()));
for(const variant of ['empty','reference']){
  const workspace=resolve(validationRoot,variant);await mkdir(workspace,{recursive:true});await copySource(task.baseline,workspace);await linkDependencies(workspace,dependencies);
  await initializeWorkspaceGit(workspace);
  if(variant==='reference')await applyPatch(workspace,record.patch,resolve(pilotRoot,'reference.diff'));
  const publicRegression=await runMocha(workspace,task.regressionArgs);
  await applyPatch(workspace,record.test_patch,resolve(pilotRoot,'acceptance.diff'));
  const acceptance=await runMocha(workspace,task.acceptanceArgs,{required:[...record.FAIL_TO_PASS,...record.PASS_TO_PASS]});
  gates[variant]={publicRegression,acceptance};console.log(JSON.stringify({variant,public:publicRegression.status,publicTests:publicRegression.tests,acceptance:acceptance.status,tests:acceptance.tests,failures:acceptance.failures?.map(f=>({name:f.fullTitle,message:f.err?.message}))}));
}
const valid=gates.empty.publicRegression.status==='passed'&&gates.reference.publicRegression.status==='passed'&&gates.empty.acceptance.status==='failed'&&gates.empty.acceptance.failures?.some(f=>record.FAIL_TO_PASS.includes(f.fullTitle))&&gates.reference.acceptance.status==='passed';
const receipt={version:1,valid,node:process.version,platform:process.platform,task:task.id,provenance:record.provenance,repository:record.repo,revision:record.base_commit,archiveSha256:hash(bytes),archiveBytes:bytes.length,baselineHashes:await snapshot(task.baseline),testPatchSha256:task.acceptanceHash,dependencyLockSha256:hash(await readFile(resolve(dependencies,'package-lock.json'))),dependencyFiles:Object.keys(dependencyHashes).length,pins,gates,limitations:['Native Windows/Node 24 adaptation, not an official SWE-bench container score.','Pinned direct subset uses a separately frozen transitive npm lock; not identical to official image.','Acceptance contains the official FormData F2P/P2P subset; browser/build/type suites are not run.','Native process scope is a prompt contract, not OS sandboxing. Shared dependencies are content-checked before independent grading.']};
await writeFile(resolve(pilotRoot,'validation.json'),JSON.stringify(receipt,null,2));
await mkdir('reports/repository-intelligence-eval-v2/hard-native-pilot',{recursive:true});
await writeFile('reports/repository-intelligence-eval-v2/hard-native-pilot/validation.json',JSON.stringify(receipt,null,2));
await cp(resolve(dependencies,'package-lock.json'),'reports/repository-intelligence-eval-v2/hard-native-pilot/dependency-lock.json');
if(!valid)throw new Error('Empty/reference validation failed; do not dispatch inference');
