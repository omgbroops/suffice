import {icon} from './ui.js';

export const isInterruption=error=>/(?:Task stopped: cancelled|^Cancelled$|^Response aborted$)/i.test(error?.message||'');
export function transcriptDivider(kind='compacted'){
 const node=document.createElement('div');node.className='thread-divider';node.setAttribute('role','status');
 node.update=(next,automatic=false)=>{node.dataset.kind=next;node.setAttribute('aria-busy',String(next==='compacting'));node.innerHTML=icon(next==='interrupted'?'pause':'context');const label=document.createElement('span');label.textContent=next==='interrupted'?'Interrupted':next==='compacting'?'Compacting context':automatic?'Context automatically compacted':'Context compacted';node.append(label);};
 node.update(kind);return node;
}
