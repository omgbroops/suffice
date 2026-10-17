// Offline replay of harness policies over a finished real-runs report (no model calls).
// shortcut: replays reuse the recorded Sol run as the "escalation" run (fresh-workspace Sol); only valid for same task+repetition pairs.
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {root} from '../src/runtime.mjs';

export function replay(runs,{cheap='luna-repro',strong='sol',gate=r=>r.status==='completed'}={}){
  const key=r=>`${r.task}#${r.repetition}`,by=(arm)=>new Map(runs.filter(r=>r.arm===arm).map(r=>[key(r),r]));
  const c=by(cheap),s=by(strong),rows=[];
  for(const [k,cr] of c){
    const sr=s.get(k);if(!sr)continue;
    const accepted=gate(cr),esc=!accepted;
    rows.push({k,escalated:esc,success:esc?sr.success:cr.success,usd:cr.knownEstimatedUsd+(esc?sr.knownEstimatedUsd:0),unknown:cr.usageCostUnknown||(esc&&sr.usageCostUnknown),gateWrong:accepted&&!cr.success});
  }
  return rows;
}
export function summarize(name,rows){
  const n=rows.length,ok=rows.filter(r=>r.success).length,usd=rows.reduce((a,r)=>a+r.usd,0);
  return {policy:name,n,pass:`${ok}/${n}`,meanUsd:+(usd/n).toFixed(4),usdPerSuccess:ok?+(usd/ok).toFixed(4):null,escalated:rows.filter(r=>r.escalated).length,gateFalseAccepts:rows.filter(r=>r.gateWrong).length,runsWithUnknownCost:rows.filter(r=>r.unknown).length};
}
export function plain(runs,arm){return runs.filter(r=>r.arm===arm).map(r=>({k:`${r.task}#${r.repetition}`,escalated:false,success:r.success,usd:r.knownEstimatedUsd,unknown:r.usageCostUnknown,gateWrong:false}));}
// Pooled attempts per task from the cheap family: if no attempt ever passes, best-of-N cannot help.
export function cheapFamily(runs,arms){
  const t={};for(const r of runs.filter(r=>arms.includes(r.arm))){(t[r.task]??={n:0,pass:0}).n++;if(r.success)t[r.task].pass++;}
  return t;
}
if(import.meta.url===`file://${process.argv[1]}`){
  const campaign=process.argv[2]??'semver-control-v1',runs=JSON.parse(await readFile(resolve(root,`reports/${campaign}.json`),'utf8')).runs;
  const table=[...new Set(runs.map(r=>r.arm))].map(a=>summarize(a,plain(runs,a)));
  table.push(summarize('replay: luna-repro, escalate to sol if repro not established',replay(runs)));
  table.push(summarize('replay: luna, escalate to sol if not completed',replay(runs,{cheap:'luna'})));
  console.table(table);
  console.log('cheap-family pooled pass per task (luna,state,prune,state-prune,repro):',JSON.stringify(cheapFamily(runs,['luna','luna-state','luna-prune','luna-state-prune','luna-repro'])));
}
