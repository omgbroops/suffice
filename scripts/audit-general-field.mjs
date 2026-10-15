import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {ROOT} from './general-execution.mjs';
import {verifyGeneral} from './freeze-general.mjs';
const DIR=resolve(ROOT,'.suffice/general-field-pilot-v1'),REPORT=resolve(ROOT,'reports/general-field-pilot-v1');
const json=p=>readFile(p,'utf8').then(JSON.parse),sha=x=>createHash('sha256').update(x).digest('hex');
await verifyGeneral();const manifest=await json(resolve(DIR,'manifest.json')),rows=[];
for(const item of manifest.schedule){
 const run=resolve(DIR,item.id);let result;try{result=await json(resolve(run,'result.json'));}catch(e){if(e.code==='ENOENT')continue;throw e;}
 const events=(await readFile(resolve(run,'worker/events.live.jsonl'),'utf8')).trim().split('\n').filter(Boolean).map(JSON.parse);
 const replies=events.filter(e=>e.type==='assistant'),requests=events.filter(e=>e.type==='provider_request'),startup=events.find(e=>e.type==='startup'),rates=startup.model.cost;
 const sums={input:0,cacheRead:0,cacheWrite:0,output:0,totalTokens:0,estimatedApiUsd:0};
 for(const reply of replies){for(const k of ['input','cacheRead','cacheWrite','output','totalTokens'])sums[k]+=reply.usage[k]??0;sums.estimatedApiUsd+=reply.usage.cost.total;}
 const calculated=(sums.input*rates.input+sums.cacheRead*rates.cacheRead+sums.cacheWrite*rates.cacheWrite+sums.output*rates.output)/1e6;
 const usageMatches=Object.keys(sums).every(k=>Math.abs(sums[k]-result.usage[k])<1e-8),priceMatches=Math.abs(calculated-sums.estimatedApiUsd)<1e-8;
 const raw=[...new Map(events.filter(e=>e.type==='provider_usage').map(e=>[e.responseId,e])).values()];
 const rawInput=raw.reduce((n,e)=>n+(e.usage.input_tokens??0),0),rawOutput=raw.reduce((n,e)=>n+(e.usage.output_tokens??0),0),rawCached=raw.reduce((n,e)=>n+(e.usage.input_tokens_details?.cached_tokens??0),0);
 const rawMatches=raw.length===replies.length&&rawInput===sums.input+sums.cacheRead+sums.cacheWrite&&rawOutput===sums.output&&rawCached===sums.cacheRead;
 const modelMatches=requests.every(e=>e.model==='gpt-6.1-sol'&&e.reasoning.effort==='low'),tools=item.arm==='suffice'?requests.every(e=>e.tools.length===1&&e.tools[0].name==='codemode'):JSON.stringify(startup.activeTools)===JSON.stringify(['read','bash','edit','write']);
 const prompt=await json(resolve(run,'prompt.json')),promptMatches=prompt.sha256===manifest.prompts[item.task].sha256&&sha(prompt.text)===prompt.sha256;
 const execution=await json(resolve(run,'worker/execution.json'));
 const patch=await json(resolve(run,'patch.json'));const grader=resolve(DIR,'evaluation','attempt-'+item.id);
 const patchMatches=await Promise.all(patch.filter(p=>!/^tests?\//.test(p.path)).map(async p=>p.after!==null&&sha(await readFile(resolve(grader,p.path)))===sha(Buffer.from(p.after,'base64'))));
 rows.push({id:item.id,usageMatches,priceMatches,rawMatches,rawResponses:raw.length,assistantResponses:replies.length,requestCount:requests.length,modelMatches,tools,promptMatches,patchReplayBytesMatch:patchMatches.every(Boolean),costComponents:{fresh:sums.input*rates.input/1e6,cached:sums.cacheRead*rates.cacheRead/1e6,output:sums.output*rates.output/1e6},boundary:'Public workspace + own receipts + pinned runtime + authentication; no evaluator/reference mount',mountedGitMetadata:execution.args.filter((x,i,a)=>a[i-1]==='--ro-bind'&&x.endsWith('/.git')),passed:usageMatches&&priceMatches&&rawMatches&&modelMatches&&tools&&promptMatches&&patchMatches.every(Boolean)});
}
await mkdir(REPORT,{recursive:true});const report={at:new Date().toISOString(),rows,complete:rows.length===manifest.schedule.length,passed:rows.length>0&&rows.every(r=>r.passed),scope:'Independent arithmetic from finalized events and raw provider usage, exact model/effort/tool declarations, public prompt hashes, and submitted-versus-graded production bytes. Engineering/evaluator inference is outside benchmark costs.'};
await writeFile(resolve(REPORT,'receipt-audit.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));if(!report.passed)process.exitCode=1;
