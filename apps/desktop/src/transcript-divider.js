import {icon} from './ui.js';

export const isInterruption=error=>/(?:Task stopped: cancelled|^Cancelled$|^Response aborted$)/i.test(error?.message||'');
export function transcriptDivider(kind='compacted'){
 const node=document.createElement('div');node.className='thread-divider';node.setAttribute('role','status');
 node.update=(next,automatic=false)=>{node.dataset.kind=next;node.setAttribute('aria-busy',String(next==='compacting'));node.innerHTML=next==='new'?'':icon(next==='interrupted'?'pause':'context');const label=document.createElement('span');label.textContent=next==='new'?'New':next==='interrupted'?'Interrupted':next==='compacting'?'Compacting context':automatic?'Automatically compacted the conversation':'Compacted the conversation';node.append(label);};
 node.update(kind);return node;
}
