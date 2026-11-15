// Parent-side cached replay. No API, embedding or model calls.
import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
const root=resolve(import.meta.dirname,'..');
const branch=resolve(root,'../suffice-experiments/nemotron-retrieval');
const state=resolve(branch,'.suffice/nemotron');
const hash=x=>createHash('sha256').update(x).digest('hex');
const json=async p=>JSON.parse(await readFile(p,'utf8'));
const freeze=await json(resolve(state,'offline-v2-freeze.json'));
const saved=await json(resolve(branch,'reports/NEMOTRON-OFFLINE-V2.json'));
const errors=[];let frozenFiles=0,vectorReferences=0;
for(const [p,h] of Object.entries(freeze.files)){
  for(const target of [resolve(branch,p),resolve(state,'frozen-v2',p)])
    if(hash(await readFile(target))!==h)errors.push({kind:'input_hash',path:p});
  frozenFiles++;
}
if(errors.length)throw Error('Frozen input mismatch before cached replay');
const {build,rank,pack,policy}=await import(pathToFileURL(resolve(branch,'experiments/nemotron/policy-v2.mjs')));
const cacheKey=(text,mode)=>hash(JSON.stringify({model:policy.model,mode,dimensions:policy.dimensions,text}));
const receiptIds=new Set();
async function vector(text,mode){
  const key=cacheKey(text,mode),v=await json(resolve(state,'vectors-v2',key+'.json'));
  if(v.inputHash!==key||v.vector.length!==2048||v.vector.some(x=>!Number.isFinite(x)))errors.push({kind:'vector',key});
  receiptIds.add(v.receiptId);vectorReferences++;return v.vector;
}
// Recompute coverage separately from the ranker's coverage implementation.
function regionCoverage(selected,labels){
  const lines=new Set(),covered=new Set();
  for(const f of labels.files)for(const match of (f.patch??'').matchAll(/@@ -(\d+)(?:,(\d+))? \+\d+(?:,\d+)? @@/g)){
    const start=Number(match[1]),count=Number(match[2]??1);
    for(let line=start;line<start+count;line++){
      const key=f.path+':'+line;lines.add(key);
      if(selected.some(s=>s.path===f.path&&line>=s.start&&line<=s.end))covered.add(key);
    }
  }
  return {hunkLines:lines.size,coveredLines:covered.size,hunkCoverage:lines.size?covered.size/lines.size:null};
}
const checked=[];
for(const t of saved.tasks){
  const files=await Promise.all(t.sourcePaths.map(async path=>({path,source:await readFile(resolve(state,'corpus',t.id,path),'utf8')})));
  const index=build(files);
  const vs=await Promise.all(index.units.map(u=>vector(`${u.path}:${u.start}-${u.end}\n${u.text}`,'passage')));
  const qv=await vector(t.query,'query');
  const labels=await json(resolve(state,'labels',t.id+'.json'));
  for(const ceiling of policy.budgets)for(const arm of policy.arms){
    const p=pack(rank(index,t.query,arm,vs,qv),ceiling);
    const prior=saved.results.find(r=>r.task===t.id&&r.arm===arm&&r.ceiling===ceiling);
    const artifact=await json(resolve(state,'packets-v2',`${t.id}-${arm}-${ceiling}.json`));
    const coverage=regionCoverage(p.selected,labels);
    const matches=JSON.stringify(p)===JSON.stringify(artifact)&&
      JSON.stringify(p.selected)===JSON.stringify(prior.selected)&&p.estimatedTokens===prior.estimatedTokens&&
      Object.entries(coverage).every(([k,v])=>prior[k]===v)&&p.estimatedTokens<=ceiling;
    if(!matches)errors.push({kind:'packet_or_coverage',task:t.id,arm,ceiling});
    checked.push({task:t.id,arm,ceiling,matches,...coverage,estimatedUnits:p.estimatedTokens});
  }
}
const receipts=[];
for(const id of [...receiptIds].sort((a,b)=>a-b)){
  const r=await json(resolve(state,`receipt-${id}.json`));
  const valid=r.status===200&&policy.allowedReturnedModels.includes(r.model)&&r.usage?.cost===0&&r.dimensions===2048;
  if(!valid)errors.push({kind:'provider_receipt',id});
  receipts.push({id,kind:r.kind,inputType:r.inputType,status:r.status,model:r.model,dimensions:r.dimensions,tokens:r.usage?.total_tokens,cost:r.usage?.cost,latencyMs:r.latencyMs,valid});
}
const supplementary=[];
for(const path of ['src/workspace.mjs','package.json','bun.lock']){
  const current=await readFile(resolve(branch,path),'utf8');
  const base=spawnSync('git',['show','37fb5e2:'+path],{cwd:branch,encoding:'utf8',windowsHide:true});
  const unchanged=base.status===0&&current.replaceAll('\r\n','\n')===base.stdout.replaceAll('\r\n','\n');
  if(!unchanged)errors.push({kind:'supplementary_base_diff',path});
  supplementary.push({path,sha256:hash(Buffer.from(current)),unchangedFromBaseIgnoringCRLF:unchanged,originalFreezeIncludes:Object.hasOwn(freeze.files,path)});
}
const result={at:new Date().toISOString(),kind:'parent cached rank replay and independent region-metric calculation',modelCalls:0,embeddingRequests:0,valid:errors.length===0,errors,frozenFiles,vectorReferences,uniqueReceiptIds:[...receiptIds].sort((a,b)=>a-b),receipts,packets:checked.length,checks:checked,supplementary,node:process.version,originalReportHash:hash(await readFile(resolve(branch,'reports/NEMOTRON-OFFLINE-V2.json'))),limitations:['Replays saved vectors; cannot independently reproduce provider inference without new calls.','Coverage labels are old-side diff-hunk context, not semantic sufficiency.','Five queries are researcher paraphrases, not blind issue queries.','Supplementary imports/dependency locks were not in original freeze; checked against original base now.']};
await writeFile(resolve(root,'reports/nemotron-offline-parent-audit.json'),JSON.stringify(result,null,2));
console.log(JSON.stringify({valid:result.valid,errors,frozenFiles,vectorReferences,packets:checked.length,receiptIds:result.uniqueReceiptIds,supplementary}));
if(errors.length)process.exitCode=1;
