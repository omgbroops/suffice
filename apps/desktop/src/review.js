import {icon} from './ui.js';
// Review agent: runs the reviewer on the current diff and keeps findings per thread for inline annotations.
const results=new Map();
export const reviewFor=id=>results.get(id);
export const findingsFor=(id,path)=>(results.get(id)?.findings||[]).filter(finding=>finding.path===path);
const changed=()=>document.dispatchEvent(new Event('suffice-review-updated'));
export async function runReview(api,id){
 if(!id||results.get(id)?.state==='running')return;
 const selection=document.querySelector('.composer')?.modelSelection;
 if(!selection?.model||!selection.provider||selection.provider==='cli'){results.set(id,{state:'error',error:'Pick a model in the composer first',findings:[]});changed();return;}
 results.set(id,{state:'running',findings:[]});changed();
 try{const {findings}=await api.review({model:selection.model,provider:selection.provider,effort:selection.effort||'low'});results.set(id,{state:'done',findings});try{await api.reviewImport({threadId:id,findings});}catch{/* findings stay plain notes */}}
 catch(error){results.set(id,{state:'error',error:error.message.replace(/^Error invoking remote method '[^']+': (Error: )?/,''),findings:[]});}
 changed();
}
// The fix goes through the real composer so it follows the same queue/steer/model rules as a typed message.
export function applyFix(finding){
 const form=document.querySelector('.composer'),prompt=form?.querySelector('#prompt');if(!prompt)return false;
 prompt.value=`Fix this review finding in ${finding.path} at line ${finding.line} (${finding.severity}): ${finding.message}${finding.fix?`\nSuggested fix: ${finding.fix}`:''}`;
 prompt.dispatchEvent(new Event('input',{bubbles:true}));form.requestSubmit();return true;
}
export function noteNode(finding){
 const note=document.createElement('div');note.className='review-note';note.dataset.severity=finding.severity;note.setAttribute('role','note');
 const chip=document.createElement('span');chip.className='review-severity';chip.textContent=finding.severity;
 const body=document.createElement('div');body.className='review-body';const message=document.createElement('p');message.className='review-message';message.textContent=finding.message;body.append(message);
 if(finding.fix){const fix=document.createElement('p');fix.className='review-fix';fix.textContent=finding.fix;body.append(fix);}
 const apply=document.createElement('button');apply.type='button';apply.className='button button--subtle review-apply';apply.textContent='Apply fix';apply.setAttribute('aria-label',`Apply fix: ${finding.message.slice(0,60)}`);
 apply.addEventListener('click',()=>{if(applyFix(finding)){apply.textContent='Sent';apply.disabled=true;}});
 note.append(chip,body,apply);return note;
}
export function reviewButton(id,api){
 const state=reviewFor(id),button=document.createElement('button');button.type='button';button.className='button button--subtle review-button';button.setAttribute('aria-label','Review changes');
 button.innerHTML=`${icon('tick')}<span></span>`;
 const status=button.querySelector('span');status.setAttribute('role','status');
 let strip=null;
 if(state?.state==='running'){button.disabled=true;button.setAttribute('aria-busy','true');status.textContent='Reviewing…';}
 else if(state?.state==='error'){strip=document.createElement('div');strip.className='review-status review-strip';strip.setAttribute('role','status');strip.textContent=state.error;}
 else if(state?.state==='done')status.textContent=state.findings.length?`${state.findings.length} finding${state.findings.length===1?'':'s'}`:'No issues found';
 if(status.textContent)status.className='review-status';else status.textContent='Review changes';button.title='Review changes';
 button.addEventListener('click',()=>void runReview(api,id));return [button,strip];
}
// Counts on the changed-file rows tell which files carry findings without opening each one.
export function decorateRows(list,id){
 const counts=new Map();for(const {path} of reviewFor(id)?.findings||[])counts.set(path,(counts.get(path)||0)+1);
 for(const row of list.querySelectorAll('.change-row')){row.querySelector('.review-badge')?.remove();const count=counts.get(row.dataset.path);if(!count)continue;const badge=document.createElement('span');badge.className='review-badge';badge.textContent=count;badge.title=`${count} review finding${count===1?'':'s'}`;row.append(badge);}
}
