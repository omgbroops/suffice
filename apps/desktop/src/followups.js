// Next-step chips after a finished run: derived from tool calls only, no model call.
const EDIT=/edit|write|patch|replace/i,SHELL=/bash|shell|terminal/i,TEST=/\b(test|pytest|vitest|jest|mocha|spec)\b/i;
const commandOf=input=>String(input?.command??input?.cmd??'');
export function deriveFollowups(tools=[],failed=false){
 const edited=tools.some(t=>EDIT.test(t.name)&&!t.isError),errored=failed||tools.some(t=>t.isError);
 const tested=tools.some(t=>SHELL.test(t.name)&&TEST.test(commandOf(t.input)));
 if(errored)return ['Fix the error','Explain what failed'];
 if(edited)return tested?['Commit this','Explain the diff','Review for bugs']:['Run the tests','Commit this','Explain the diff'];
 if(tools.length)return ['Summarize what you found','Go deeper'];
 return [];
}
export function renderFollowups(node,before,chips,onPick){
 node.querySelectorAll('.thread-followups').forEach(e=>e.remove());if(!chips.length)return null;
 const row=document.createElement('div');row.className='thread-followups';row.setAttribute('role','group');row.setAttribute('aria-label','Suggested next steps');
 chips.forEach((text,i)=>{const chip=document.createElement('button');chip.type='button';chip.className='followup-chip';chip.textContent=text;if(!i){const hint=document.createElement('kbd');hint.textContent='Tab';chip.append(hint);}chip.addEventListener('click',()=>onPick(text));row.append(chip);});
 node.insertBefore(row,before);return row;
}
