// Deterministic saved-patch replay only. Never imports the campaign entry point.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {ROOT,executeReplay} from './replay-general-execution.mjs';
const DIR=resolve(ROOT,'.suffice/general-field-replay-v1'),REPORT=resolve(ROOT,'reports/general-field-pilot-v1');
const FIELD=resolve(ROOT,'.suffice/field-v1');
const json=async p=>JSON.parse(await readFile(p,'utf8'));
const save=async(p,v)=>{await mkdir(resolve(p,'..'),{recursive:true});await writeFile(p,JSON.stringify(v,null,2)+'\n');};
const hash=async p=>createHash('sha256').update(await readFile(p)).digest('hex');
const reconstruction=await json(resolve(DIR,'reconstruction.json'));
if(!reconstruction.complete)throw new Error('Incomplete fresh reconstruction');
const frozenManifest=await json(resolve(ROOT,'.suffice/general-field-pilot-v1/manifest.json'));
for(const p of reconstruction.rows)if(JSON.stringify(p.initialHashes)!==JSON.stringify(frozenManifest.inputs['base/'+p.task]))throw new Error('Initial base differs from frozen campaign input: '+p.id);
const validation=await json(resolve(REPORT,'validation.json'));
const privateRoots=[resolve(FIELD,'private')];
const inputPaths=['configs/general-v1.json','docs/general-v1/PILOT-PROTOCOL.md','scripts/general-field-pilot.mjs','.suffice/general-field-pilot-v1/manifest.json',...['tasks.json','h02.test.mjs','l01-check.cjs','h02-reference-index.js'].map(p=>'.suffice/field-v1/private/'+p)];
const before=Object.fromEntries(await Promise.all(inputPaths.map(async p=>[p,await hash(resolve(ROOT,p))])));
const rows=[];
for(const preparation of reconstruction.rows){
 const {id,task,workspace}=preparation,out=resolve(DIR,'receipts',id);
 const command=task==='h02'?['node','node_modules/mocha/bin/mocha','--reporter','json']:['node','--no-experimental-strip-types','node_modules/mocha/bin/mocha.js','--require','ts-node/register','--ui','tdd','--reporter','json','test/*.ts'];
 const process=await executeReplay({workspace,dependencies:preparation.dependencies.source,receipts:resolve(out,'native'),command,privateRoots,timeoutMs:45000});
 let data;try{data=JSON.parse(process.stdout);}catch{}
 const native={exitCode:process.exitCode,stats:data?.stats,failures:data?.failures?.map(f=>({title:f.fullTitle,error:f.err?.message})),valid:!!data?.stats&&Number.isInteger(process.exitCode),latencyMs:process.latencyMs};
 await save(resolve(out,'native/summary.json'),native);
 let buildAndLint=null,lintDiagnostic=null;
 if(task==='l01'){
  const p=await executeReplay({workspace,dependencies:preparation.dependencies.source,receipts:resolve(out,'build-lint'),command:['bash','-c','npm run build && npm run lint'],privateRoots,timeoutMs:90000});
  buildAndLint={exitCode:p.exitCode,passed:p.exitCode===0,latencyMs:p.latencyMs};
 }
 let acceptance;
 const privateCommand=task==='h02'?['node','--test-reporter=tap','/grader.mjs']:['node','/grader.cjs'];
 const privateRun=await executeReplay({workspace,dependencies:preparation.dependencies.source,grader:resolve(FIELD,'private',task==='h02'?'h02.test.mjs':'l01-check.cjs'),receipts:resolve(out,'acceptance'),command:privateCommand,privateRoots,timeoutMs:15000});
 if(task==='h02'){
  const count=name=>Number([...privateRun.stdout.matchAll(new RegExp('^# '+name+' (\\d+)$','gm'))].at(-1)?.[1]);
  const expectedNames=[...(await readFile(resolve(FIELD,'private/h02.test.mjs'),'utf8')).matchAll(/\btest\(\s*['"]([^'"]+)['"]/g)].map(m=>m[1]);
  const observedNames=[...privateRun.stdout.matchAll(/^ok \d+ - (.*)$/gm)].map(m=>m[1]);
  const namesMatch=JSON.stringify(expectedNames)===JSON.stringify(observedNames);
  const passed=privateRun.exitCode===0&&count('tests')===3&&count('pass')===3&&count('fail')===0&&count('skipped')===0&&count('cancelled')===0&&namesMatch;
  acceptance={...privateRun,tests:count('tests'),passed:count('pass'),failed:count('fail'),namesMatch,status:passed?'passed':'failed'};
 }else{
  let done;try{done=JSON.parse(privateRun.stdout.trim().split('\n').at(-1));}catch{}
  acceptance={...privateRun,complete:done?.accepted===true,passed:privateRun.exitCode===0&&done?.accepted===true};
 }
 await save(resolve(out,'private.json'),acceptance);
 const control=validation.checks.find(c=>c.label===task+'-before'),allowed=(control.native.failures??[]).map(f=>f.title).sort(),observed=(native.failures??[]).map(f=>f.title).sort();
 const originalTestHashes=Object.fromEntries(await Promise.all(preparation.originalTestsRestored.map(async p=>[p,await hash(resolve(workspace,p))])));
 const originalTestsUnmodified=Object.entries(originalTestHashes).every(([p,h])=>h===preparation.initialHashes[p]);
 const nativeRegressionGate=native.valid&&native.stats.tests===control.native.stats.tests&&native.stats.pending===control.native.stats.pending&&JSON.stringify(allowed)===JSON.stringify(observed)&&(task!=='l01'||buildAndLint.passed);
 const passed=(task==='h02'?acceptance.status==='passed':acceptance.passed)&&nativeRegressionGate&&originalTestsUnmodified;
 const row={id,task,passed,patchSha256:preparation.patchSha256,workspace,native,buildAndLint,lintDiagnostic,acceptance,nativeRegressionGate,originalTestsUnmodified};rows.push(row);
 await save(resolve(DIR,'replay-results.partial.json'),{rows,inferenceCalls:0});
 console.log(JSON.stringify({id,passed,stats:native.stats,acceptance:task==='h02'?acceptance.status:acceptance.passed,buildAndLint,lintDiagnostic}));
}
const after=Object.fromEntries(await Promise.all(inputPaths.map(async p=>[p,await hash(resolve(ROOT,p))])));
let originalBasesUnmodified=true;
for(const p of reconstruction.rows)for(const [file,h]of Object.entries(p.initialHashes))if(await hash(resolve(FIELD,'bases',p.task,file))!==h)originalBasesUnmodified=false;
const result={at:new Date().toISOString(),inferenceCalls:0,newBenchmarkAttempts:0,reconstructedFromInitialBases:true,method:'Fresh tracked-file copies plus git apply of each saved tracked.patch; original tests restored; pinned evaluator dependencies mounted read-only; original native commands and private acceptance rerun.',rows,frozenInputsUnmodified:JSON.stringify(before)===JSON.stringify(after),originalBasesUnmodified,inputHashes:before,passed:rows.every(r=>r.passed)&&JSON.stringify(before)===JSON.stringify(after)&&originalBasesUnmodified,scope:'Independent deterministic correctness replay. Original reports, receipts, campaign config, source core and private graders preserved. h02 pre-existing test failures allowed only with exact matching identities; h02 lint is diagnostic outside original acceptance gate.'};
await save(resolve(REPORT,'independent-replay.json'),result);
await writeFile(resolve(REPORT,'independent-replay.md'),`# Independent saved-patch replay\n\nReconstructed all three saved patches from initial bases and restored original native tests. No model calls or new benchmark attempts. Pinned evaluator dependencies are reused through read-only mounts. An unfinished physical dependency copy is preserved separately and hidden by the read-only dependency mount.\n\n| Attempt | Task | Private acceptance | Original native suite | Build / lint | Verdict |\n|---|---|---|---|---|---|\n${rows.map(r=>`| ${r.id} | ${r.task} | ${r.task==='h02'?r.acceptance.status:r.acceptance.passed?'passed':'failed'} | ${r.native.stats?.tests} tests, ${r.native.stats?.passes} passed, ${r.native.stats?.pending} pending, ${r.native.stats?.failures} failed | ${r.buildAndLint?r.buildAndLint.passed?'passed':'failed':'not required by historical gate'} | ${r.passed?'accepted':'failed'} |`).join('\n')}\n\nHistorical failures match the original controls by exact test title. h02 lint was not rerun: the original actor receipts preserve its pre-existing Node24 tooling crash, and lint is not an original historical acceptance gate. Private graders were rerun under Linux Node24 in the isolated evaluator, using unchanged grader source; the original private receipts used Windows Node24. Frozen input and original base checks: ${result.frozenInputsUnmodified&&originalBasesUnmodified?'unchanged':'DRIFT'}.\n\nDetailed reconstruction hashes: .suffice/general-field-replay-v1/reconstruction.json. Raw native/private receipts: .suffice/general-field-replay-v1/receipts/. Historical test failures are retained in these receipts; existing lint crash receipts remain with the original pilot attempts.\n`);
if(!result.passed)globalThis.process.exitCode=1;


