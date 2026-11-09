import {readFile,readdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
const root=resolve(import.meta.dirname,'../reports/repository-intelligence-eval-v2'),directory=resolve(root,process.argv[2]??'luna-xhigh-isolated-v2','main');
const manifest=JSON.parse(await readFile(resolve(directory,'manifest.json'),'utf8'));let amendment;try{amendment=JSON.parse(await readFile(resolve(directory,'operational-amendment.json'),'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
const digest=bytes=>createHash('sha256').update(bytes).digest('hex'),sourceMismatches=[];
for(const [path,original]of Object.entries(manifest.inputs)){const expected=path==='scripts/intelligence-eval.mjs'?(amendment?.newRunnerHash??original):original;if(digest(await readFile(resolve(import.meta.dirname,'..',path)))!==expected)sourceMismatches.push(path);}
const expected=new Set(manifest.blocks.flat().map(r=>[r.task,r.arm,r.repetition,Boolean(r.diagnostic)].join('|'))),seen=new Set(),duplicates=[],unexpected=[],models={},efforts={},tiers={},costRates={};let responses=0,unknownCost=0;
const rows=[];for(const file of await readdir(directory))if(/-r\d+\.json$/.test(file))rows.push(JSON.parse(await readFile(resolve(directory,file),'utf8')));
for(const row of rows){const key=[row.task,row.arm,row.repetition,Boolean(row.diagnostic)].join('|');if(seen.has(key))duplicates.push(key);if(!expected.has(key))unexpected.push(key);seen.add(key);if(row.totalEstimatedUsd===null)unknownCost++;
  let data;try{data=await readFile(resolve(directory,row.runId+'.events.jsonl'));}catch(e){if(e.code!=='ENOENT')throw e;try{data=gunzipSync(await readFile(resolve(directory,row.runId+'.events.jsonl.gz')));}catch{continue;}}
  for(const e of data.toString('utf8').trim().split('\n').map(JSON.parse)){
    if(e.type==='provider_usage'){responses++;for(const [map,value]of [[models,e.model??'unreported'],[efforts,e.reasoning?.effort??'unreported'],[tiers,e.serviceTier??'unreported']])map[value]=(map[value]??0)+1;}
    if(e.type==='assistant'&&e.usage)for(const part of ['input','output','cacheRead','cacheWrite'])if(e.usage[part]>0&&Number.isFinite(e.usage.cost?.[part])){const rate=(e.usage.cost[part]*1e6/e.usage[part]).toFixed(6);costRates[part]??={};costRates[part][rate]=(costRates[part][rate]??0)+1;}
  }
}
const missingGitRoots=rows.filter(r=>!r.workspaceGit?.head||!r.workspaceGit?.root?.replaceAll('\\','/').endsWith('/workspace')).map(r=>r.runId),inconsistentStartingHeads=[];
for(const task of new Set(rows.map(r=>r.task))){const heads=new Set(rows.filter(r=>r.task===task).map(r=>r.workspaceGit?.head).filter(Boolean));if(heads.size>1)inconsistentStartingHeads.push(task);}
const result={scheduledPrimary:144,primaryRecorded:rows.filter(r=>!r.diagnostic).length,diagnosticRecorded:rows.filter(r=>r.diagnostic).length,scheduledTotal:expected.size,missing:[...expected].filter(k=>!seen.has(k)),duplicates,unexpected,sourceMismatches,missingGitRoots,inconsistentStartingHeads,responses,models,efforts,tiers,observedCatalogRatesPerMillion:costRates,unknownCostRuns:unknownCost};
await writeFile(resolve(root,'audit.json'),JSON.stringify(result,null,2));console.log(JSON.stringify({...result,missing:result.missing.length}));
if(duplicates.length||unexpected.length||sourceMismatches.length||missingGitRoots.length||inconsistentStartingHeads.length||Object.keys(models).some(k=>k!=='gpt-6-luna')||Object.keys(efforts).some(k=>k!=='xhigh'))process.exitCode=1;
