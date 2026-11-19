// One prompt for every open comment, and the parser for the agent's structured reply.
export const OUTCOMES={fixed:'fixed',skipped:'skipped',noop:'noop','no change needed':'noop','no-change-needed':'noop',no_change_needed:'noop','no change':'noop',no_change:'noop'};
export function renderPrompt(items){
 const blocks=items.map(item=>`[${item.id}] ${item.file}:${item.line??'?'}\n${item.excerpt?'```diff\n'+item.excerpt+'\n```\n':''}Comment: ${item.text}`);
 return `Address every review comment below in this single turn. Edit the files as needed.
After you finish, end your reply with ONLY a JSON array, one item per comment id, no prose after it: [{"id": "<id>", "outcome": "fixed" | "skipped" | "no change needed"}]. Use "fixed" only if you changed code for that comment, "skipped" if you chose not to act on it, "no change needed" if the code is already right.

${blocks.join('\n\n')}`;
}
// Returns [{id,outcome}] for known ids only. Throws when no usable array is found; the caller keeps the cards in 'sent'.
export function parseOutcomes(text,ids){
 const source=String(text||''),end=source.lastIndexOf(']');
 if(end<0)throw new Error('The agent did not return outcomes');
 const known=new Set(ids);
 for(let start=source.lastIndexOf('[',end);start>=0;start=start?source.lastIndexOf('[',start-1):-1){
  let list;try{list=JSON.parse(source.slice(start,end+1));}catch{continue;}
  if(!Array.isArray(list))continue;
  const found=[];for(const item of list){const outcome=OUTCOMES[String(item?.outcome||'').toLowerCase().trim()];if(item&&known.has(item.id)&&outcome)found.push({id:item.id,outcome});}
  if(found.length)return found;
 }
 throw new Error('The agent did not return outcomes');
}
