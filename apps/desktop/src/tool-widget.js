import {actionTitle} from './action-display.js';
import {decorateActivitySummary} from './activity-groups.js';
export function toolOutput(result){
 if(!result)return '';
 if(typeof result==='string')return result;
 const parts=Array.isArray(result.content)?result.content:[];
 return parts.map(part=>{const text=part.text||'';try{const value=JSON.parse(text);return typeof value.output==='string'?value.output:text;}catch{return text;}}).filter(Boolean).join('\n\n');
}
export function createToolWidget(part){
 const widget=document.createElement('details');widget.className='thread-detail tool-widget';
 const summary=document.createElement('summary');summary.textContent=actionTitle(part);
 const body=document.createElement('div');body.className='tool-widget-body';
 const input=document.createElement('pre');input.className='tool-input';
 let value=part.text||'';try{const data=JSON.parse(value);value=data.code||data.command||JSON.stringify(data,null,2);}catch{}
 input.textContent=value;input.hidden=!value;
 const output=document.createElement('pre');output.className='tool-output';output.textContent=part.output||'';output.hidden=!part.output;
 body.append(input,output);widget.append(summary,body);
 widget.addEventListener('toggle',()=>{if(widget.open&&value)void import('./code-highlight.js').then(({colorCode})=>colorCode(input,part.name==='codemode'?'input.js':part.name==='bash'?'input.sh':'input.json')).catch(()=>{});});
 function update(text,error=false,pending=false){decorateActivitySummary(summary,actionTitle({...part,done:!pending,output:text}));const pinned=output.scrollHeight-output.scrollTop-output.clientHeight<48;output.hidden=!text;output.textContent=text;widget.dataset.status=error?'error':pending?'pending':'completed';if(pinned)output.scrollTop=output.scrollHeight;widget.dispatchEvent(new Event('activity-label-change',{bubbles:true}));}
 update(part.output||'',part.isError,!part.done);return {element:widget,update};
}
