// Pre-primary regrading of preserved framework reports. No test rerun is
// claimed: only the grading module may differ from the execution receipt.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {hash} from '../src/workspace.mjs';
import {repositorySnapshot} from '../src/eval-v4/environment.mjs';
import {normalizeReport,inventory,canonicalLabel,gradeReport} from '../src/eval-v4/grading.mjs';
const root=process.cwd(),base=resolve(root,'.suffice/intelligence-v4'),out=resolve(root,'reports/repository-intelligence-v4'),load=async p=>JSON.parse(await readFile(p,'utf8'));
try{await readFile(resolve(out,'protocol.json'));throw new Error('Regrading is restricted to pre-primary stabilization');}catch(e){if(e.code!=='ENOENT')throw e;}
const id=process.argv.find(a=>a.startsWith('--task='))?.slice(7);if(!id)throw new Error('Use --task=ID');
const path=resolve(base,'tasks',id,'validation.json'),oldBytes=await readFile(path),receipt=JSON.parse(oldBytes),oldInputs=structuredClone(receipt.setupInputs);
for(const [file,expected]of Object.entries(oldInputs))if(file!=='src/eval-v4/grading.mjs'&&hash(await readFile(resolve(root,file)))!==expected)throw new Error('Execution input changed: '+file);
if(JSON.stringify(await repositorySnapshot(receipt.baselineDirectory))!==JSON.stringify(receipt.baselineHashes))throw new Error('Baseline drift');
const source=resolve(out,'preparation',id,receipt.publicGateDirectory.match(/-(\d+)$/)[1]),record=await load(resolve(base,'records',id+'.json')),observations={};
for(const variant of ['public','empty','reference']){
  const raw=await load(resolve(source,variant,'framework.json'));
  observations[variant]=normalizeReport(raw,{framework:receipt.framework,workspace:resolve(receipt.publicGateDirectory,variant)});
  if(observations[variant].executionFailure||!observations[variant].validInventory||observations[variant].loadErrors?.length||(variant!=='empty'&&observations[variant].hooks?.length))throw new Error('Cannot regrade invalid framework execution');
  if(variant==='public'&&observations[variant].tests.some(test=>test.status==='failed'))throw new Error('Original public tests failed');
}
receipt.knownPending=observations.reference.tests.filter(t=>['pending','todo','skipped','disabled'].includes(t.status)).map(t=>t.title);receipt.expectedInventory=inventory(observations.reference);
const options={targets:record.FAIL_TO_PASS,regressions:record.PASS_TO_PASS,knownPending:receipt.knownPending,expectedInventory:receipt.expectedInventory};
receipt.gates={empty:gradeReport({...observations.empty,hooks:[]},{...options,expectedInventory:undefined}),reference:gradeReport(observations.reference,options)};
receipt.emptyHooks=observations.empty.hooks;
const allTargetsFailed=record.FAIL_TO_PASS.map(label=>canonicalLabel(label,receipt.framework)).every(title=>observations.empty.tests.some(t=>t.title===title&&t.status==='failed'));
receipt.valid=receipt.gates.empty.valid&&receipt.gates.empty.targetsPassed===0&&allTargetsFailed&&receipt.gates.empty.regressionsPassed===record.PASS_TO_PASS.length&&receipt.gates.reference.accepted;
receipt.classification=receipt.valid?'validated':'original_reference_gate_failure';
receipt.regradedFrom={validationSha256:hash(oldBytes),rawReports:source,executionSetupInputs:oldInputs,reason:'QUnit appends spaces to duplicate names; normalize TAP trailing whitespace while retaining duplicate counts and frozen TODO allowances.',gradedAt:new Date().toISOString()};
receipt.setupInputs['src/eval-v4/grading.mjs']=hash(await readFile(resolve(root,'src/eval-v4/grading.mjs')));
const publication=resolve(out,'preparation',id,'regrade-'+Date.now());await mkdir(publication,{recursive:true});await writeFile(resolve(publication,'validation.json'),JSON.stringify(receipt,null,2));await writeFile(path,JSON.stringify(receipt,null,2));
console.log(JSON.stringify({event:'v4_preprimary_regrade',task:id,valid:receipt.valid,reference:receipt.gates.reference.accepted,rawReportsRerun:false}));if(!receipt.valid)process.exitCode=1;
