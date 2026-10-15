// Post-campaign receipt audit. This does not modify the frozen actor or use a model.
import {readFile,writeFile,readdir,stat,statfs} from 'node:fs/promises';
import {resolve} from 'node:path';
import {isDeepStrictEqual as equal} from 'node:util';
import {hash} from '../src/workspace.mjs';
import {frameContent,decodeSource} from '../src/source-frames.mjs';
import {accountEvents} from './audit-benchmark-receipts.mjs';

const dir=resolve('.suffice/source-presentation-v2');
const read=p=>readFile(p,'utf8').then(JSON.parse);
const manifest=await read(resolve(dir,'manifest.json'));
const failures=[];
const check=(value,description)=>{if(!value)failures.push(description);};
const contentText=cs=>cs.filter(c=>c.type==='text').map(c=>c.text).join('\n');
const approximate=(a,b)=>Math.abs(a-b)<1e-9;
for(const[p,h]of Object.entries(manifest.inputs)){
 check(hash(await readFile(p))===h,'working input: '+p);
 check(hash(await readFile(resolve(dir,'frozen-source',p)))===h,'archived input: '+p);
}
const names=(await readdir(dir)).filter(n=>/^\d{3}-/.test(n)).sort();
check(names.length<=manifest.schedule.length,'within frozen schedule');
const schemas=new Set(),instructions=new Set(),users={},rows=[],costs={A:{},B:{}};
let applied=0,sourceObjects=0,savedCharacters=0,requests=0;
for(const[index,name]of names.entries()){
 const start=failures.length,run=resolve(dir,name),r=await read(resolve(run,'result.json'));
 check(equal(manifest.schedule[index],Object.fromEntries(['task','repetition','arm','pair'].map(k=>[k,r[k]]))),name+': schedule order');
 const es=(await readFile(resolve(run,'worker/events.jsonl'),'utf8')).trim().split('\n').filter(Boolean).map(JSON.parse);
 const live=(await readFile(resolve(run,'worker/events.live.jsonl'),'utf8')).trim().split('\n').filter(Boolean).map(JSON.parse);
 check(equal(es,live),name+': live event preservation');
 const a=accountEvents(es),w=await read(resolve(run,'worker.json')),tr=await read(resolve(run,'worker/transcript.json'));
 check(Object.keys(a.usage).every(k=>approximate(a.usage[k],r.usage[k])&&approximate(a.usage[k],w.usage[k])),name+': event cost and usage sums');
 check(approximate(r.knownEstimatedUsd,a.usage.estimatedApiUsd),name+': known cost');
 check((a.unknown||w.usageCostUnknown)===(r.totalEstimatedUsd===null),name+': missing cost classification');
 check(r.totalEstimatedUsd===null||approximate(r.totalEstimatedUsd,a.usage.estimatedApiUsd),name+': total cost');
 const prs=es.filter(e=>e.type==='provider_request');requests+=prs.length;
 check(prs.length>0&&prs.every(p=>p.model===manifest.model.model&&p.reasoning?.effort===manifest.model.effort),name+': actual requested model and effort');
 for(const p of prs){schemas.add(p.toolsHash);instructions.add(p.instructionsHash);(users[r.task]??=new Set()).add(p.userHash);}
 const ps=es.filter(e=>e.type==='presentation');let wire=true;
 for(const p of ps){
  const artifact=await read(resolve(run,'worker',`presentation-${p.id}.json`));
  const computed=frameContent(artifact.originalContent),original=contentText(artifact.originalContent),framed=contentText(artifact.framedContent);
  check(equal(computed.content,artifact.framedContent)&&equal(computed.rows,artifact.rows),name+': recomputed presentation '+p.id);
  check(hash(original)===p.originalHash&&hash(framed)===p.framedHash,name+': presentation hashes '+p.id);
  check(p.originalChars===original.length&&p.framedChars===framed.length&&p.sourceObjects===artifact.rows.length,name+': presentation counts '+p.id);
  check(p.arm===r.arm&&artifact.arm===r.arm&&p.applied===(r.arm==='B'),name+': arm isolation '+p.id);
  for(const row of artifact.rows)check(row.framed.length<row.original.length&&equal(decodeSource(row.framed),JSON.parse(row.original)),name+': exact source and metadata roundtrip '+p.id);
  const expected=r.arm==='B'?artifact.framedContent:artifact.originalContent;
  const toolResult=tr.find(m=>m.role==='toolResult'&&m.toolCallId===p.callId);
  check(!!toolResult&&equal(toolResult.content,expected),name+': final transcript presentation '+p.id);
  const expectedHash=hash(contentText(expected));
  const seen=prs.some(pr=>pr.toolOutputHashes.includes(expectedHash));wire&&=seen;
  check(seen,name+': presentation on provider wire '+p.id);
  if(p.applied){applied++;sourceObjects+=artifact.rows.length;savedCharacters+=original.length-framed.length;}
 }
 check(r.presentation.wireVerified===wire,name+': independently recomputed wire receipt');
 check(r.presentation.appliedOutputs===ps.filter(p=>p.applied).length,name+': activation count');
 check(es.filter(e=>e.type==='assistant').length===r.turns,name+': durable assistant turn count');
 for(const e of es.filter(e=>e.type==='assistant'))for(const[k,v]of Object.entries(e.usage?.cost??{}))if(k!=='total')costs[r.arm][k]=(costs[r.arm][k]??0)+v;
 rows.push({id:name,passed:failures.length===start,providerRequests:prs.length,assistantEvents:a.assistantEvents,failedEvents:a.failedEvents,fullCostKnown:r.totalEstimatedUsd!==null,presentations:ps.length,appliedOutputs:ps.filter(p=>p.applied).length});
}
check(schemas.size===1,'common tool schemas');check(instructions.size===1,'common system instructions');
check(Object.values(users).every(s=>s.size===1),'common initial user prompt per task');
check(applied>0,'treatment activated');
let artifactBytes=0;async function size(p){for(const e of await readdir(p,{withFileTypes:true})){const child=resolve(p,e.name);if(e.isDirectory())await size(child);else if(e.isFile())artifactBytes+=(await stat(child)).size;else check(false,'unexpected link in campaign');}}await size(dir);
const disk=await statfs('.');
check(artifactBytes<=manifest.limits.maxArtifactBytes,'campaign artifact disk bound');
const output={at:new Date().toISOString(),postHoc:true,method:'Recompute from raw durable events, presentation artifacts and final transcript; validate both archived and current frozen inputs. No model calls or actor changes.',passed:failures.length===0,failures,attempts:rows.length,scheduleComplete:names.length===manifest.schedule.length,requests,appliedOutputs:applied,sourceObjects,savedCharacters,costComponents:costs,parity:{schemaVariants:schemas.size,instructionVariants:instructions.size,userPromptVariantsByTask:Object.fromEntries(Object.entries(users).map(([k,s])=>[k,s.size]))},artifactBytes,freeDiskBytes:disk.bavail*disk.bsize,rows};
await writeFile('reports/source-presentation-v2/receipt-audit.json',JSON.stringify(output,null,2)+'\n');
console.log(JSON.stringify(output));if(!output.passed)process.exitCode=1;
