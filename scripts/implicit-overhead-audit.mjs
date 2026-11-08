import {readFile,writeFile,readdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {countTokens,TOKENIZER} from '../packages/cli/src/implicit/tokens.mjs';
const root=resolve(import.meta.dirname,'..'),directory=resolve(root,'reports/semantic-graph-v2');
const graphNames=new Set(['semantic_symbols','symbol_dependencies','symbol_callers','impact_analysis','affected_tests']);
const records=[];
for(const entry of await readdir(directory,{withFileTypes:true})){
  if(!entry.isDirectory()||!/^\d/.test(entry.name))continue;
  const dir=resolve(directory,entry.name),events=(await readFile(resolve(dir,'events.jsonl'),'utf8')).trim().split('\n').map(JSON.parse),messages=JSON.parse(await readFile(resolve(dir,'transcript.json'),'utf8')),result=JSON.parse(await readFile(resolve(dir,'result.json'),'utf8'));
  const seen=new Set(),sourceLines=new Set();let observations=0,exactRepeated=0,repeatedSource=0,cumulativeObservations=0,retained=0,afterFirstEditGenerations=0;
  let edited=false;
  for(const message of messages){
    if(message.role==='assistant'){cumulativeObservations+=retained;if(edited)afterFirstEditGenerations++;}
    if(message.role!=='toolResult')continue;
    const text=message.content?.filter(c=>c.type==='text').map(c=>c.text).join('\n')??'',n=countTokens(text);observations+=n;retained+=n;
    if(seen.has(text))exactRepeated+=n;seen.add(text);
  }
  const firstEdit=events.findIndex(e=>e.type==='activated_edit');
  afterFirstEditGenerations=events.slice(firstEdit<0?events.length:firstEdit).filter(e=>e.type==='assistant').length;
  let graphTokens=0,relationshipOccurrences=0,repeatedRelationships=0;const relationships=new Set();
  for(const event of events){
    if(event.type==='tool_result'&&graphNames.has(event.name))graphTokens+=countTokens(JSON.stringify(event.data));
    if(event.type==='tool_result'&&event.name==='file_read')for(const line of event.data.text.split('\n')){const k=event.data.path+':'+line;if(sourceLines.has(k))repeatedSource+=countTokens(line);sourceLines.add(k);}
    if(event.type==='tool_result'&&graphNames.has(event.name)){
      const walk=v=>{if(!v||typeof v!=='object')return;if(v.from&&v.to&&v.kind){const k=JSON.stringify([v.from,v.kind,v.to,v.location]);relationshipOccurrences++;if(relationships.has(k))repeatedRelationships++;relationships.add(k);}for(const x of Object.values(v))if(x&&typeof x==='object')Array.isArray(x)?x.forEach(walk):walk(x);};walk(event.data);
    }
  }
  records.push({id:entry.name,arm:result.arm,provider:result.totals,instructionsTokens:countTokens(events.find(e=>e.type==='startup').systemPrompt),observationTokens:observations,exactRepeatedObservationTokens:exactRepeated,repeatedSourceLineTokens:repeatedSource,graphResultTokens:graphTokens,relationshipOccurrences,repeatedRelationships,cumulativeObservationReplayTokens:cumulativeObservations,afterFirstEditGenerations,initialInvestigation:result.initialInvestigation,graphLocalMs:result.graph.toolLatencyMs});
}
const groups=Object.fromEntries([...new Set(records.map(r=>r.arm))].map(arm=>{const rows=records.filter(r=>r.arm===arm),metrics={};for(const key of ['instructionsTokens','observationTokens','exactRepeatedObservationTokens','repeatedSourceLineTokens','graphResultTokens','relationshipOccurrences','repeatedRelationships','cumulativeObservationReplayTokens','afterFirstEditGenerations','graphLocalMs'])metrics[key]=rows.reduce((n,r)=>n+r[key],0)/rows.length;return [arm,{attempts:rows.length,mean:metrics}];}));
const output={tokenizer:TOKENIZER,method:'Named BPE counts over recorded text, not provider serialization. Cumulative replay counts each completed tool observation in every later assistant generation; caches can discount that replay. Exact repeats use whole text equality; source repeats require path+numbered-line equality. Relationship duplicates retain source location, ignore result envelopes/revision. Categories overlap and are not an additive causal decomposition. Provider usage remains authoritative; reasoning attribution and counterfactual extra generations are unidentifiable.',groups,records};
await writeFile(resolve(root,'reports/implicit-previous-overhead.json'),JSON.stringify(output,null,2));console.log(JSON.stringify(groups,null,2));
