import {readFile,writeFile,mkdir,cp,unlink} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {root,stateDir} from './runtime.mjs';
import {hash} from './workspace.mjs';
import {snapshot,initializeWorkspaceGit} from './intelligence-eval.mjs';
import {copySource,linkDependencies,dependencySnapshot,applyPatch} from './native-intelligence-eval.mjs';
const exec=promisify(execFile);
export const svelteRoot=resolve(stateDir,'intelligence-svelte-pilot');
export const record=JSON.parse(await readFile(resolve(root,'benchmarks/intelligence-svelte-pilot/svelte-1190.json'),'utf8'));
export const production=p=>p.startsWith('src/')&&!p.endsWith('/__test__.js');
export const derived=p=>['compiler/svelte.js','compiler/svelte.js.map','ssr/register.js','ssr/register.js.map','shared.js','store.umd.js'].includes(p);
export async function buildSvelte(workspace){
  const started=performance.now(),logs=[];
  for(const args of [['src/shared/_build.js'],['node_modules/rollup/bin/rollup','-c'],['node_modules/rollup/bin/rollup','-c','rollup.store.config.js']]){
    try{const r=await exec(resolve(workspace,'node_modules/.suffice-node16/node.exe'),['--max-old-space-size=384',...args],{cwd:workspace,windowsHide:true,timeout:120000,maxBuffer:2*1024**2,env:{...process.env,NODE_OPTIONS:''}});logs.push({args,stdout:r.stdout,stderr:r.stderr});}
    catch(e){return {status:'build_failed',error:e.message,stdout:e.stdout,stderr:e.stderr,logs,latencyMs:performance.now()-started};}
  }
  return {status:'passed',logs,latencyMs:performance.now()-started};
}
export async function testSvelte(workspace,reportPath){
  let exitCode=0,stdout='',stderr='';const started=performance.now();
  try{({stdout,stderr}=await exec(resolve(workspace,'node_modules/.suffice-node16/node.exe'),['--max-old-space-size=384','node_modules/mocha/bin/_mocha','--opts','NUL','native-tests.cjs','--reporter',resolve(root,'benchmarks/intelligence-svelte-pilot/reporter.cjs'),'--exit'],{cwd:workspace,windowsHide:true,timeout:120000,maxBuffer:16*1024**2,env:{...process.env,NODE_OPTIONS:'',CI:'true',SUFFICE_MOCHA_REPORT:reportPath}}));}
  catch(e){exitCode=e.code;stdout=e.stdout??'';stderr=e.stderr??'';if(e.killed||typeof e.code!=='number')return {status:'infrastructure_error',error:e.message,stdout,stderr,latencyMs:performance.now()-started};}
  let report;try{report=JSON.parse(await readFile(reportPath,'utf8'));}catch(e){return {status:'invalid_result',error:e.message,stdout,stderr,exitCode};}
  return {status:'reported',report,exitCode,stdout,stderr,latencyMs:performance.now()-started};
}
export function gradeSvelte(observed,required,{knownFailures=[],knownPending=[],otherEndpointTests=[],expectedTitleCounts}={}){
  if(observed.status!=='reported')return {...observed,report:undefined};
  const r=observed.report,passed=new Set(r.passes.map(t=>t.fullTitle)),failed=new Set(r.failures.map(t=>t.fullTitle)),pending=new Set(r.pending.map(t=>t.fullTitle));
  const missing=required.filter(n=>!passed.has(n)&&!failed.has(n)&&!pending.has(n)),unpassed=required.filter(n=>!passed.has(n)||failed.has(n)||pending.has(n)),unexpectedFailures=[...failed].filter(n=>!knownFailures.includes(n)&&!otherEndpointTests.includes(n)),unexpectedPending=[...pending].filter(n=>!knownPending.includes(n)&&!otherEndpointTests.includes(n));
  const counts=entries=>Object.fromEntries([...new Set(entries.map(t=>t.fullTitle))].sort().map(n=>[n,entries.filter(t=>t.fullTitle===n).length]));
  const actualCounts=counts(r.tests),discovered=counts([...r.passes,...r.failures,...r.pending]);
  const multiplicitiesMatch=JSON.stringify(actualCounts)===JSON.stringify(discovered)&&(!expectedTitleCounts||JSON.stringify(actualCounts)===JSON.stringify(expectedTitleCounts));
  const valid=r.stats.tests===r.tests.length&&r.stats.tests===r.passes.length+r.failures.length+r.pending.length&&r.stats.passes===r.passes.length&&r.stats.failures===r.failures.length&&r.stats.pending===r.pending.length&&observed.exitCode===Math.min(255,r.stats.failures)&&multiplicitiesMatch;
  return {status:!valid||missing.length?'invalid_result':unpassed.length||unexpectedFailures.length||unexpectedPending.length?'failed':'passed',exitCode:observed.exitCode,tests:r.stats.tests,passed:r.stats.passes,failed:r.stats.failures,pending:r.stats.pending,required:required.length,requiredPassed:required.length-unpassed.length,missing,unpassed,unexpectedFailures,unexpectedPending,multiplicitiesMatch,knownFailuresStillFailing:[...failed].filter(n=>knownFailures.includes(n)),latencyMs:observed.latencyMs,failures:r.failures,stdout:observed.stdout,stderr:observed.stderr};
}
export async function svelteTask({directory=svelteRoot,taskRecord=record,promptNotes='That command omits the Nightmare/Electron suite; three known legacy binding-select failures and existing skips may appear. Existing snapshots encode the old scoping markup and may differ when implementing the requested behavior.'}={}){
  const receipt=JSON.parse(await readFile(resolve(directory,'validation.json'),'utf8'));
  if(!receipt.valid)throw new Error('Svelte empty/reference gates required');
  const record=taskRecord,dependencies=resolve(directory,'dependencies'),expectedDependencies=JSON.parse(await readFile(resolve(directory,'dependency-hashes.json'),'utf8'));
  const task={id:record.instance_id,category:'complex',kind:'upstream-native-pilot',repository:record.repo,revision:record.base_commit,family:'svelte',record,baseline:resolve(directory,'baseline'),baselineHashes:receipt.baselineHashes,acceptanceHash:hash(record.test_patch),sourceFiles:Object.keys(receipt.baselineHashes).filter(production),referenceFiles:[...record.patch.matchAll(/^diff --git a\/(\S+) b\/(\S+)$/gm)].map(m=>m[2]),
    allowsChange:p=>production(p)||derived(p)||!receipt.baselineHashes[p]&&p.startsWith('test/'),setupWorkspace:w=>linkDependencies(w,dependencies),
    prompt:`Resolve this upstream compiler issue. Dependencies and a portable Node 16 toolchain are preprovisioned. Edit production files under src/ (excluding __test__.js); build outputs and new test scratch outputs are allowed. Preserve existing test code, fixtures, configuration, package metadata and verification helpers. Do not install packages or use external network access. Run node native-verify.cjs to build and test. ${promptNotes} Independent grading applies the upstream updated test expectations to a fresh reconstruction of your production changes; do not revert the requested behavior merely to satisfy old snapshots.\n\n${record.problem_statement}`};
  task.verify=async workspace=>{
    if(JSON.stringify(await dependencySnapshot(resolve(dependencies,'node_modules')))!==JSON.stringify(expectedDependencies))throw new Error('Svelte dependency content drifted');
    const destination=resolve(dirname(workspace),'independent-grade');await mkdir(destination,{recursive:true});await copySource(task.baseline,destination);const after=await snapshot(workspace);
    for(const p of new Set([...Object.keys(receipt.baselineHashes),...Object.keys(after)]))if(receipt.baselineHashes[p]!==after[p]&&production(p)){
      if(!after[p])await unlink(resolve(destination,p));else{await mkdir(dirname(resolve(destination,p)),{recursive:true});await cp(resolve(workspace,p),resolve(destination,p));}
    }
    await initializeWorkspaceGit(destination);await linkDependencies(destination,dependencies);
    await applyPatch(destination,record.test_patch,resolve(dirname(workspace),'acceptance.diff'));
    const build=await buildSvelte(destination);if(build.status!=='passed')return {acceptance:build,regression:{status:'not_run'}};
    const observed=await testSvelte(destination,resolve(dirname(workspace),'grade-mocha.json'));
    await writeFile(resolve(dirname(workspace),'grade-build.json'),JSON.stringify(build,null,2));
    return {acceptance:gradeSvelte(observed,record.FAIL_TO_PASS,receipt),regression:gradeSvelte(observed,record.PASS_TO_PASS,{...receipt,otherEndpointTests:record.FAIL_TO_PASS})};
  };
  return {task,receipt,dependencies};
}
