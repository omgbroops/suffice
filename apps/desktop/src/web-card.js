import {decorateActivitySummary} from './activity-groups.js';
// Compact chat cards for web tool calls: URL, title, size, tokens saved. Details come from the crawl tool's result; upstream tools fall back to what the text shows.
export const WEB_TOOLS={web_search:['Searching the web','Searched the web','Search'],fetch_content:['Fetching page','Fetched page','Fetch'],get_search_content:['Reading search results','Read search results','Read'],crawl_to_markdown:['Crawling to markdown','Crawled to markdown','Crawl']};
export const isWebTool=name=>Object.hasOwn(WEB_TOOLS,name);
const kb=n=>n<1024?`${n} B`:n<1048576?`${(n/1024).toFixed(n<10240?1:0)} KB`:`${(n/1048576).toFixed(1)} MB`;
const k=n=>n>=1000?`${(n/1000).toFixed(n<10000?1:0)}k`:String(n);
const input=part=>{try{return JSON.parse(part.text||'{}');}catch{return {};}};
export function webFacts(part,output,details){
 const args=input(part),target=args.url||args.urls?.[0]||args.query||args.queries?.[0]||'';
 const heading=output.match(/^#{1,3} (.+)$/m)?.[1]||output.match(/^Title: (.+)$/m)?.[1]||'';
 const sources=part.name==='web_search'?new Set(output.match(/https?:\/\/[^\s)>\]]+/g)||[]).size:0;
 const facts={target:String(target).replace(/^https?:\/\//,'').replace(/\/$/,''),title:details?.title||heading,bytes:details?.markdownBytes??(output?new Blob([output]).size:0),saved:details?.savedTokens||0,pages:details?.pages||0,sources};
 return facts;
}
export function createWebCard(part){
 const widget=document.createElement('details');widget.className='thread-detail tool-widget web-card';
 const summary=document.createElement('summary');
 const body=document.createElement('div');body.className='tool-widget-body';
 const output=document.createElement('pre');output.className='tool-output';body.append(output);widget.append(summary,body);
 function update(text,error=false,pending=false,result){
  const [active,done]=WEB_TOOLS[part.name],label=pending?active:done,facts=webFacts(part,text,result?.details);
  decorateActivitySummary(summary,label);summary.dataset.label=label;
  summary.querySelector('.web-card-facts')?.remove();
  const card=document.createElement('span');card.className='web-card-facts';
  const row=(cls,value)=>{if(!value)return;const s=document.createElement('span');s.className=cls;s.textContent=value;card.append(s);};
  row('web-card-url',facts.target);row('web-card-title',facts.title&&facts.title!==facts.target?facts.title:'');
  const meta=[];if(!pending&&!error&&facts.bytes)meta.push(kb(facts.bytes));if(facts.pages>1)meta.push(`${facts.pages} pages`);if(facts.sources)meta.push(`${facts.sources} sources`);if(facts.saved)meta.push(`${k(facts.saved)} tokens saved`);if(error)meta.push('Failed');
  row('web-card-meta',meta.join(' · '));
  summary.append(card);
  output.hidden=!text;output.textContent=text;widget.dataset.status=error?'error':pending?'pending':'completed';
  widget.dispatchEvent(new Event('activity-label-change',{bubbles:true}));
 }
 update(part.output||'',part.isError,!part.done);return {element:widget,update};
}
