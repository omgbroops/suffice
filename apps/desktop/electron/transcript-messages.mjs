import {createMessagePresentation} from './message-presentation.mjs';
// Render checkpoints in chronological display order without exposing private summaries.
export function transcriptMessages(projection,journal=projection.entries.map(entry=>entry.sourceEntry)){
 const reasons=new Map(projection.entries.filter(({sourceEntry:e})=>e.type==='custom'&&e.customType==='suffice:compaction').map(({sourceEntry:e})=>[e.data?.entryId,e.data?.reason]));
 const order=new Map(journal.map((entry,index)=>[entry,index]));
 const checkpoints=projection.entries.filter(entry=>entry.sourceEntry.type==='compaction'&&entry.messages.length).map(({sourceEntry:entry})=>({entry,at:order.get(entry)}));
 const output=[],present=createMessagePresentation(journal);
 const checkpoint=entry=>output.push({role:'status',kind:'compacted',automatic:reasons.has(entry.id)&&reasons.get(entry.id)!=='manual',content:[]});
 for(const {sourceEntry:entry,messages} of projection.entries){
  if(entry.type==='compaction')continue;
  while(checkpoints.length&&checkpoints[0].at<order.get(entry))checkpoint(checkpoints.shift().entry);
  if(entry.type==='custom'&&entry.customType==='suffice:interrupted'){
   if(output.at(-1)?.kind!=='interrupted')output.push({role:'status',kind:'interrupted',content:[]});
  }else{
   output.push(...present(entry,messages).map(message=>({...message,entryId:entry.id})));
   if(messages.at(-1)?.role==='assistant'&&messages.at(-1)?.stopReason==='aborted')output.push({role:'status',kind:'interrupted',content:[]});
  }
 }
 for(const {entry} of checkpoints)checkpoint(entry);
 return output;
}
