// Supplemental audit after the immutable pilot stopped. Pi removes a failed
// assistant from final history when retry succeeds; live events retain it.
import {readFile,writeFile,readdir,statfs} from 'node:fs/promises';
import {resolve} from 'node:path';
import {hash} from '../src/workspace.mjs';
export function accountEvents(events){
 const usage={input:0,cacheRead:0,cacheWrite:0,output:0,totalTokens:0,estimatedApiUsd:0};let unknown=false;
 const assistants=events.filter(e=>e.type==='assistant'),turns=assistants.map(e=>e.turn);
 if(new Set(turns).size!==turns.length)throw new Error('Duplicate assistant event turn');
 for(const e of assistants){for(const k of ['input','cacheRead','cacheWrite','output','totalTokens'])usage[k]+=e.usage?.[k]??0;if(Number.isFinite(e.usage?.cost?.total))usage.estimatedApiUsd+=e.usage.cost.total;else unknown=true;if(['error','aborted'].includes(e.stopReason))unknown=true;}
 return {usage,unknown,assistantEvents:assistants.length,failedEvents:assistants.filter(e=>['error','aborted'].includes(e.stopReason)).length};
}
if(process.argv[1]&&resolve(process.argv[1])===resolve(import.meta.filename)){
 const dir=resolve('.suffice/benchmark-v1/calibration-v1'),manifest=JSON.parse(await readFile(resolve(dir,'manifest.json'))),inputFailures=[];
 for(const[p,h]of Object.entries(manifest.inputs))if(hash(await readFile(p))!==h)inputFailures.push(p);
 const replay=JSON.parse(await readFile('reports/benchmark-v1/replay.json')),rows=[];
 for(const d of(await readdir(dir,{withFileTypes:true})).filter(e=>e.isDirectory()&&/^\d{3}-/.test(e.name))){const run=resolve(dir,d.name),r=JSON.parse(await readFile(resolve(run,'result.json'))),events=(await readFile(resolve(run,'worker/events.jsonl'),'utf8')).trim().split('\n').map(JSON.parse),a=accountEvents(events),tr=JSON.parse(await readFile(resolve(run,'worker/transcript.json'))),previous=replay.rows.find(p=>p.id===r.id);const usageMatches=Object.keys(a.usage).every(k=>Math.abs(a.usage[k]-r.usage[k])<1e-9),knownMatches=a.unknown===(r.totalEstimatedUsd===null),acceptanceMatches=previous?.gradeMatches&&previous.acceptance===r.acceptanceStatus&&previous.regression===r.regressionStatus;
  rows.push({id:r.id,usageMatches,knownMatches,acceptanceMatches,failedEvents:a.failedEvents,assistantEvents:a.assistantEvents,finalTranscriptAssistants:tr.filter(m=>m.role==='assistant').length,knownEstimatedUsd:r.knownEstimatedUsd,totalEstimatedUsd:r.totalEstimatedUsd,passed:usageMatches&&knownMatches&&acceptanceMatches});
 }
 const disk=await statfs('.');const out={at:new Date().toISOString(),campaignComplete:rows.length===manifest.schedule.length,scheduled:manifest.schedule.length,observed:rows.length,inputFailures,rows,integrityPassed:!inputFailures.length&&rows.every(r=>r.passed),knownEstimatedUsd:rows.reduce((s,r)=>s+r.knownEstimatedUsd,0),unknownTotals:rows.filter(r=>r.totalEstimatedUsd===null).length,freeBytes:disk.bavail*disk.bsize,method:'Uses saved patch rerun receipts from the original replay; reconciles complete durable assistant event receipts including failed responses pruned from Pi final session history after retries. Original replay is retained unchanged and its transcript-only unknown-cost check is superseded here; no inferred failed-call cost.',inferenceCalls:0};await writeFile('reports/benchmark-v1/receipt-audit.json',JSON.stringify(out,null,2));console.log(JSON.stringify(out));if(!out.integrityPassed)process.exitCode=1;
}
