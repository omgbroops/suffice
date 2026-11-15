// Render the canonical projection without exposing compacted summaries as chat messages.
export function transcriptMessages(projection){
 const reasons=new Map(projection.entries.filter(({sourceEntry:e})=>e.type==='custom'&&e.customType==='suffice:compaction').map(({sourceEntry:e})=>[e.data?.entryId,e.data?.reason]));
 const output=[];
 for(const {sourceEntry:entry,messages} of projection.entries){
  if(entry.type==='compaction'){
   if(messages.length)output.push({role:'status',kind:'compacted',automatic:reasons.has(entry.id)&&reasons.get(entry.id)!=='manual',content:[]});
  }else if(entry.type==='custom'&&entry.customType==='suffice:interrupted'){
   if(output.at(-1)?.kind!=='interrupted')output.push({role:'status',kind:'interrupted',content:[]});
  }else{
   output.push(...messages);
   if(messages.at(-1)?.role==='assistant'&&messages.at(-1)?.stopReason==='aborted')output.push({role:'status',kind:'interrupted',content:[]});
  }
 }
 return output;
}
