import {readFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {STRATEGIES} from '../src/v10/config.mjs';
export function summarize(execution,grading={grades:[]}){
  return STRATEGIES.map(strategy=>{
    const rows=execution.attempts.filter(a=>a.strategy===strategy),grades=grading.grades.filter(g=>rows.some(r=>r.id===g.id));
    const cost=rows.reduce((n,r)=>n+(r.costKnown&&Number.isFinite(r.costUsd)?r.costUsd:r.knownCostFloorUsd??0),0),accepted=grades.filter(g=>g.accepted===true).length;
    return {strategy,scheduled:rows.length,executed:rows.filter(r=>r.status!=='not_started').length,accepted,graded:grades.filter(g=>g.status==='graded').length,
      unknownCosts:rows.filter(r=>!r.costKnown).length,knownCostFloorUsd:cost,costPerAcceptedUsd:accepted&&rows.every(r=>r.costKnown)?cost/accepted:null,
      meanLatencyMs:rows.some(r=>Number.isFinite(r.latencyMs))?rows.reduce((n,r)=>n+(r.latencyMs??0),0)/rows.filter(r=>Number.isFinite(r.latencyMs)).length:null,
      takeovers:rows.reduce((n,r)=>n+(r.takeovers??0),0),policyValidAccepted:grades.filter(g=>g.accepted&&rows.find(r=>r.id===g.id)?.budgetEligible===true).length};
  });
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  const dir=resolve(process.argv[2]??'.');const execution=JSON.parse(await readFile(join(dir,'execution-complete.json'),'utf8'));
  let grading;try{grading=JSON.parse(await readFile(join(dir,'grades.json'),'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
  console.log(JSON.stringify({gradingComplete:Boolean(grading),results:summarize(execution,grading)},null,2));
}
