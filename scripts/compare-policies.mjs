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
  return {policy:name,n,pass:`${ok}/${n}`,meanUsdKnownFloor:+(usd/n).toFixed(4),usdPerSuccess:ok?+(usd/ok).toFixed(4):null,escalated:rows.filter(r=>r.escalated).length,gateFalseAccepts:rows.filter(r=>r.gateWrong).length,runsWithUnknownCost:rows.filter(r=>r.unknown).length};
}
export function plain(runs,arm){return runs.filter(r=>r.arm===arm).map(r=>({k:`${r.task}#${r.repetition}`,escalated:false,success:r.success,usd:r.knownEstimatedUsd,unknown:r.usageCostUnknown,gateWrong:false}));}
// Pooled attempts per task from the cheap family: if no attempt ever passes, best-of-N cannot help.
export function cheapFamily(runs,arms){
  const t={};for(const r of runs.filter(r=>arms.includes(r.arm))){(t[r.task]??={n:0,pass:0}).n++;if(r.success)t[r.task].pass++;}
  return t;
}
// Analytic model of a spec gate: p=cheap pass rate, alpha=P(gate accepts a wrong patch), beta=P(gate rejects a correct patch),
// g=gate (spec-writer) cost, c=cheap cost, s=strong cost, q=strong pass rate. Wrong-patch alpha comes from mutants, not real cheap-model errors.
export function gateModel({p,alpha,beta,g,c,s,q=1}){
  const accept=p*(1-beta)+(1-p)*alpha,esc=1-accept;
  return {usd:+(g+c+esc*s).toFixed(4),pass:+(p*(1-beta)+esc*q).toFixed(3),escalated:+esc.toFixed(3),breakEvenG:+(s-c-esc*s).toFixed(4)};
}
if(import.meta.url===`file://${process.argv[1]}`&&process.argv[3]!=='--gate-model'){
  const campaign=process.argv[2]??'semver-control-v1',runs=JSON.parse(await readFile(resolve(root,`reports/${campaign}.json`),'utf8')).runs;
  const table=[...new Set(runs.map(r=>r.arm))].map(a=>summarize(a,plain(runs,a)));
  table.push(summarize('replay: luna-repro, escalate to sol if repro not established',replay(runs)));
  table.push(summarize('replay: luna, escalate to sol if not completed',replay(runs,{cheap:'luna'})));
  console.table(table);
  console.log('cheap-family pooled pass per task (luna,state,prune,state-prune,repro):',JSON.stringify(cheapFamily(runs,['luna','luna-state','luna-prune','luna-state-prune','luna-repro'])));
}
if(import.meta.url===`file://${process.argv[1]}`&&process.argv[3]==='--gate-model'){
  const [p,alpha,beta,c,s]=[1/3,0.19,0.17,0.0048,0.0549];
  console.table([0.005,0.01,0.02].map(g=>({g,...gateModel({p,alpha,beta,g,c,s})})).concat([{g:'sol solo',usd:s,pass:1}]));
  // Measured on 18 Haiku picomatch attempts (docs/GATE-EVAL.md addenda); $ still semver-control, g invented.
  const m=11/18;
  console.table([['symptom',6/7],['contract',1/7]].map(([gate,a])=>({gate,...gateModel({p:m,alpha:a,beta:0,g:0.01,c,s})})));
}
