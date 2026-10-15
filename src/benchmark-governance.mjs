import {readFile,readdir,lstat,realpath} from 'node:fs/promises';
import {resolve,relative,isAbsolute,sep} from 'node:path';
import {hash} from './workspace.mjs';

export const LIMITS=Object.freeze({maxAttempts:12,maxKnownTotalUsd:3,maxCostUsd:.20,maxTurns:24,maxCalls:120,timeoutMs:240000,maxArtifactBytes:160*1024**2,minFreeBytes:1024**3});
export const MODEL=Object.freeze({provider:'openai',model:'gpt-6.1-sol',effort:'low',transport:'sse',billing:'API-equivalent metadata; not subscription charges; engineering inference excluded'});
export const TRACK_RULES=Object.freeze({
 efficiency:'Candidate only after 2/2 calibration attempts accepted within the common budget. Qualification is pilot evidence, not proof of reliability. Confirm reliability on fresh replicates before an efficiency claim.',
 capability:'Candidate only after at least one contract-supported semantic failure and one success OR additional reviewed difficulty evidence. Operational errors, budget-only stops and disputed grader failures are not semantic failures. No mechanism superiority without fresh held-out matched-budget comparison.',
 reserve:'No repair attempts during calibration. Never retrospectively rename calibration attempts held-out. Reserve results cannot be used to tune the next scored policy.'
});
export function relativePath(value){return typeof value==='string'&&value.length>0&&!isAbsolute(value)&&!value.includes(':')&&!value.includes('\\')&&!value.split('/').some(p=>p==='..'||p==='.'||!p);}
export async function treeHashes(directory){
 const root=resolve(directory),rows={};
 async function visit(d){for(const e of (await readdir(d,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))){const p=resolve(d,e.name);if(e.isSymbolicLink())throw new Error('Fixture symlinks are forbidden');if(e.isDirectory())await visit(p);else if(e.isFile())rows[relative(root,p).split(sep).join('/')]=hash(await readFile(p));}}
 await visit(root);return rows;
}
export function normalizeMap(task){
 if(Array.isArray(task.assertionMap))return task.assertionMap.map(r=>({name:r.test??r.testName??r.name,requirements:r.requirements??r.requirementIds??r.requirementIDs,rationale:r.rationale??r.justification}));
 return Object.entries(task.assertionMap??{}).map(([name,v])=>({name,requirements:Array.isArray(v)?v:v.requirements??v.requirementIds??v.requirementIDs,rationale:Array.isArray(v)?null:v.rationale??v.justification}));
}
export function validateContract(task,hiddenSource,visibleSource=''){
 const errors=[];
 for(const key of ['id','repository','url','sourceCommit','publicPrompt'])if(typeof task[key]!=='string'||!task[key].trim())errors.push('Missing '+key);
 if(!['calibration','reserve'].includes(task.split))errors.push('Unknown split');
 if(!/^[0-9a-f]{40}$/.test(task.sourceCommit??''))errors.push('Unpinned source');
 for(const key of ['workspaceDir','referenceDir','acceptancePath','visiblePath'])if(!relativePath(task[key]))errors.push('Unsafe '+key);
 if(!task.provenance)errors.push('Missing provenance');
 const reqs=task.requirements??[],ids=reqs.map(r=>r.id);
 if(!ids.length||new Set(ids).size!==ids.length||reqs.some(r=>!r.id||!r.text))errors.push('Invalid requirements');
 const edits=task.allowedEditPaths??[];
 if(!edits.length||edits.some(p=>!relativePath(p)||!p.startsWith('src/')||!(/\.(?:js|mjs|cjs|ts)$/.test(p))||/(?:^|\/)(?:test|tests|fixtures|node_modules)(?:\/|$)/.test(p)))errors.push('Invalid edit allowlist');
 if(![1,2,3].includes(task.scopeTier)||!task.engineeringScope)errors.push('Missing ex-ante engineering scope');
 const names=[...hiddenSource.matchAll(/\btest\(\s*['"]([^'"]+)['"]/g)].map(m=>m[1]);
 const visibleNames=[...visibleSource.matchAll(/\btest\(\s*['"]([^'"]+)['"]/g)].map(m=>m[1]);
 const map=normalizeMap(task),mapped=map.map(r=>r.name);
 if(!names.length||new Set(names).size!==names.length||names.some(n=>!mapped.includes(n))||mapped.some(n=>!names.includes(n)&&!visibleNames.includes(n))||new Set(mapped).size!==mapped.length)errors.push('Hidden test map mismatch');
 const covered=new Set();
 for(const row of map){if(!Array.isArray(row.requirements)||!row.requirements.length||row.requirements.some(id=>!ids.includes(id)))errors.push('Unknown or empty requirement mapping');else row.requirements.forEach(id=>covered.add(id));}
 if(ids.some(id=>!covered.has(id)))errors.push('Requirement lacks a hidden check');
 if(/\b(?:fetch|exec|spawn|https?|net)\s*\(/.test(hiddenSource)||/node:(?:child_process|https?|net|tls)/.test(hiddenSource))errors.push('Forbidden grader I/O');
 return {passed:errors.length===0,errors,testNames:names,visibleTestNames:visibleNames,map};
}
export async function loadTask(taskFile){
 const base=resolve(taskFile,'..'),task=JSON.parse(await readFile(taskFile,'utf8'));
 const hidden=await readFile(resolve(base,task.acceptancePath),'utf8'),visible=await readFile(resolve(base,task.visiblePath),'utf8'),contract=validateContract(task,hidden,visible);
 if(!contract.passed)throw new Error(task.id+': '+contract.errors.join('; '));
 const resolved={...task,taskFile:resolve(taskFile),taskBase:base,sourceFiles:task.allowedEditPaths};
 for(const key of ['workspaceDir','referenceDir','acceptancePath','visiblePath'])resolved[key]=resolve(base,task[key]);
 const actor=await realpath(resolved.workspaceDir);
 for(const key of ['acceptancePath','referenceDir']){const rp=await realpath(resolved[key]),r=relative(actor,rp);if(!r||(!r.startsWith('..'+sep)&&r!=='..'&&!isAbsolute(r)))throw new Error('Evaluator data inside actor');}
 for(const p of task.allowedEditPaths)if(!(await lstat(resolve(actor,p))).isFile())throw new Error('Edit file absent');
 return {task:resolved,contract};
}
export function budgetEligible(worker,limits=LIMITS){return worker.status==='completed'&&!worker.usageCostUnknown&&Number.isFinite(worker.usage?.estimatedApiUsd)&&worker.usage.estimatedApiUsd<=limits.maxCostUsd&&worker.turns<=limits.maxTurns&&worker.calls<=limits.maxCalls&&Number.isFinite(worker.latencyMs)&&worker.latencyMs<=limits.timeoutMs;}
export function qualify(rows){
 const byTask={};for(const r of rows)(byTask[r.task]??=[]).push(r);
 return Object.entries(byTask).map(([task,rs])=>({task,attempts:rs.length,accepted:rs.filter(r=>r.success).length,semanticFailures:rs.filter(r=>r.semanticFailure).length,operationalFailures:rs.filter(r=>r.status!=='completed').length,candidateTrack:rs.length>=2&&rs.every(r=>r.success)?'efficiency-candidate':rs.some(r=>r.semanticFailure)?'capability-candidate-pending-failure-review':'unqualified'}));
}
