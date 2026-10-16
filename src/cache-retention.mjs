import {createHash} from 'node:crypto';
const digest=s=>createHash('sha256').update(s).digest('hex');
/** Replace only historical read-only result bodies. Every message and call/result edge remains. */
export function retainContext(messages,{batches,state,archive,threshold=18000,recent=2}={}){
  const size=JSON.stringify(messages).length;
  const results=messages.map((m,i)=>({m,i})).filter(({m})=>m.role==='toolResult'&&m.toolName==='codemode');
  const protectedIds=new Set([results[0]?.i,...results.slice(-recent).map(x=>x.i)]);
  const telemetry={inputCharacters:size,replaced:[],removedCharacters:0,active:false};
  if(size<=threshold)return {messages,telemetry};
  // Fail open if any call/result association is malformed or historical calls are incomplete.
  const pending=new Set();
  for(const m of messages){
    if(m.role==='assistant')for(const c of m.content??[])if(c.type==='toolCall'){if(pending.has(c.id))return {messages,telemetry:{...telemetry,reason:'duplicate_call'}};pending.add(c.id);}
    if(m.role==='toolResult'&&!pending.delete(m.toolCallId))return {messages,telemetry:{...telemetry,reason:'orphan_result'}};
  }
  const output=messages.map((m,i)=>{
    const names=[...(batches?.get(m.toolCallId)??[])];
    if(protectedIds.has(i)||m.role!=='toolResult'||m.toolName!=='codemode'||!names.length||!names.every(n=>['file_read','search','files','symbols','symbol_read','symbol_references'].includes(n)))return m;
    const raw=JSON.stringify(m.content);if(raw.length<1200)return m;
    const key=`retained:${m.toolCallId}`;archive.set(key,{message:structuredClone(m),editCount:null,revisionNotice:'Read-time revision unknown; conservatively stale after edits.',sha256:digest(raw)});
    const notice={kind:'recoverable_read_observation',reference:key,sha256:digest(raw),originalCharacters:raw.length,
      instruction:'Use evidence_read(reference) for exact evidence. Historic source observations may be stale after any edit; reread current source to verify.',
      objectiveAndRequirements:'Original user messages and assistant reasoning remain above in full.',workState:state,
      staleSourceNotice:state.editCount>0?'Potentially stale source; current edit revision differs from initial observations.':'No edits recorded yet; freshness must still be verified before editing.'};
    const content=[{type:'text',text:JSON.stringify(notice)}];
    if(JSON.stringify(content).length>=raw.length)return m;
    telemetry.replaced.push({index:i,reference:key,sha256:digest(raw),originalCharacters:raw.length});telemetry.removedCharacters+=raw.length-JSON.stringify(content).length;
    return {...m,content};
  });
  telemetry.active=telemetry.replaced.length>0;return {messages:output,telemetry};
}
