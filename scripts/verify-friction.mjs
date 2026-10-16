// Independent reconstruction from saved patches, with no agent/model invocation.
import {readFile,writeFile,mkdir,readdir,cp,stat} from 'node:fs/promises';import {resolve,dirname} from 'node:path';
import {hash,runNodeTests} from '../src/workspace.mjs';
const directory=resolve('.suffice/friction-runs'),tasks=JSON.parse(await readFile('benchmarks/friction/tasks.json','utf8'));
// Exported-layout replay changes only evaluator path resolution in memory;
// original frozen task/config bytes and their hashes remain intact.
if(process.argv.includes('--portable'))for(const t of tasks){t.workspaceDir=resolve('.suffice/friction-fixtures',t.id,'baseline');t.acceptancePath=resolve('benchmarks/friction',t.id+'.acceptance.mjs');}
const auditRoot=resolve('.suffice/friction-audit',new Date().toISOString().replace(/[:.]/g,'-'));await mkdir(auditRoot,{recursive:true});
const rows=[],inputFailures=[],identityFailures=[];
for(const mode of ['pilot-v1','scored-v1']){
 const camp=resolve(directory,mode),manifest=JSON.parse(await readFile(resolve(camp,'manifest.json'),'utf8'));
 for(const [file,expected] of Object.entries(manifest.inputs)){if(hash(await readFile(file))!==expected)inputFailures.push({mode,file});}
 for(const [task,files] of Object.entries(manifest.baselines)){const fixture=tasks.find(t=>t.id===task).workspaceDir;for(const [file,expected] of Object.entries(files))if(hash(await readFile(resolve(fixture,file)))!==expected)inputFailures.push({mode,task,file});}
 for(const e of await readdir(camp,{withFileTypes:true})){
  if(!e.isDirectory()||!/^\d{3}-/.test(e.name))continue;
  const run=resolve(camp,e.name),r=JSON.parse(await readFile(resolve(run,'result.json'),'utf8')),task=tasks.find(t=>t.id===r.task),patch=JSON.parse(await readFile(resolve(run,'patch.json'),'utf8')),workspace=resolve(auditRoot,mode,e.name);
  await cp(task.workspaceDir,workspace,{recursive:true});for(const p of patch){if(!task.sourceFiles.includes(p.path)||await readFile(resolve(workspace,p.path),'utf8')!==p.before)throw new Error('Patch provenance failure');await writeFile(resolve(workspace,p.path),p.after);}
  const hidden=await runNodeTests(workspace,task.acceptancePath),visible=await runNodeTests(workspace,resolve(workspace,'tests/visible.test.mjs'));
  const messages=JSON.parse(await readFile(resolve(run,'worker/transcript.json'),'utf8')),seen=new Set(),usage={input:0,cacheRead:0,cacheWrite:0,output:0,totalTokens:0,estimatedApiUsd:0};let known=true;
  for(const m of messages){if(m.role!=='assistant')continue;if(m.responseId&&seen.has(m.responseId))throw new Error('Repeated response within transcript');if(m.responseId)seen.add(m.responseId);for(const key of ['input','cacheRead','cacheWrite','output','totalTokens'])usage[key]+=m.usage?.[key]??0;if(Number.isFinite(m.usage?.cost?.total))usage.estimatedApiUsd+=m.usage.cost.total;else known=false;if(['error','aborted'].includes(m.stopReason))known=false;}
  const usageMatches=Object.keys(usage).every(k=>Math.abs(usage[k]-r.usage[k])<1e-9),gradeMatches=(hidden.status==='passed'&&visible.status==='passed'&&r.intact&&r.modelValid&&r.effortValid)===r.patchAccepted;
  const es=(await readFile(resolve(run,'worker/events.jsonl'),'utf8')).split('\n').filter(Boolean).map(JSON.parse),req=es.filter(e=>e.type==='provider_request');
  if(!usageMatches||!gradeMatches||known!==Number.isFinite(r.totalEstimatedUsd))identityFailures.push(r.id);
  rows.push({mode,id:r.id,task:r.task,arm:r.arm,patchAccepted:r.patchAccepted,hidden:hidden.status,visible:visible.status,usageMatches,gradeMatches,known,models:r.models,effortValid:r.effortValid,initialToolsHash:req[0]?.toolsHash,initialInstructionsHash:req[0]?.instructionsHash,stableToolsHash:req.every(e=>e.toolsHash===req[0]?.toolsHash),initialPayloadBytes:req[0]?.bytes,source:resolve(run,'result.json')});
 }
}
const schemas={};for(const r of rows){(schemas[r.arm]??=new Set()).add(r.initialToolsHash);}
const payloadChecks={oneSchemaPerArm:Object.values(schemas).every(s=>s.size===1),differentArmSchemas:[...schemas.A][0]!==[...schemas.B][0],sameInstructions:new Set(rows.map(r=>r.initialInstructionsHash)).size===1,stableWithinRuns:rows.every(r=>r.stableToolsHash)};
const result={at:new Date().toISOString(),method:'Reconstructed saved patches in new directories; reran unchanged hidden acceptance and frozen public regression. Does not independently author the grader.',rows,inputFailures,identityFailures,payloadChecks,passed:!inputFailures.length&&!identityFailures.length&&Object.values(payloadChecks).every(Boolean)};
await mkdir(resolve('reports'),{recursive:true});await writeFile(process.argv.includes('--portable')?'reports/FRICTION-EXPORT-VALIDATION.json':'reports/FRICTION-VALIDATION.json',JSON.stringify(result,null,2));console.log(JSON.stringify({attempts:rows.length,inputFailures,identityFailures,payloadChecks,passed:result.passed}));if(!result.passed)process.exitCode=1;
