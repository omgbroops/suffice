import {format} from '../../../packages/backend/src/tui/usage.mjs';
import {threadViewState as viewState} from './thread-view-state.js';

// Composer footer: tokens in/out, context and cost of the open thread, formatted by the backend usage meter.
export function connectUsageMeter({api,form}){
 const meter=document.createElement('div');meter.className='usage-meter';meter.setAttribute('role','status');meter.setAttribute('aria-label','Thread usage');meter.hidden=true;form.append(meter);
 let revision=0;
 const paint=usage=>{
  if(!usage||!Number.isFinite(usage.inputTokens)){meter.hidden=true;return;}
  meter.textContent=format({inputTokens:usage.inputTokens,outputTokens:usage.outputTokens||0,contextUsedPct:usage.windowPercent??undefined,costUsd:usage.cost??undefined}).join(' · ');meter.hidden=false;
 };
 async function refresh(){const id=viewState.id,version=++revision;if(!id||String(id).startsWith('session-')){meter.hidden=true;return;}try{const usage=await api.usage(id);if(version===revision)paint(usage);}catch{/* keep the last reading */}}
 api.onEvent(event=>{if(event.event==='usage'&&(!event.threadId||event.threadId===viewState.id)){revision++;paint(event.usage);}});
 viewState.subscribe(event=>{if(event.type==='select'||event.type==='adopt')void refresh();});
 document.addEventListener('suffice:usage-change',()=>void refresh());
 void refresh();
}
