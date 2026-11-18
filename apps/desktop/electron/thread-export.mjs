// Clean-room thread export: Markdown and self-contained HTML from a saved thread ({title,cwd,branch,messages}).
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const fence=(text,lang='')=>{const n=Math.max(3,...[...String(text).matchAll(/`+/g)].map(m=>m[0].length+1));const f='`'.repeat(n);return `${f}${lang}\n${text}\n${f}`;};
const resultText=parts=>(parts||[]).map(p=>{const t=p.text||'';try{const d=JSON.parse(t);return typeof d.output==='string'?d.output:JSON.stringify(d,null,2);}catch{return t;}}).filter(Boolean).join('\n\n');
const inputOf=part=>{if(part.text){try{return JSON.parse(part.text);}catch{return part.text;}}return part.arguments??part.input??{};};
const lines=(prefix,text)=>String(text).split('\n').map(l=>prefix+l).join('\n');
// Edits become a unified-style diff block; shortcut: old/new text pairs only, no context lines.
export function diffOf(input){
 if(!input||typeof input!=='object')return '';
 const pairs=[];const add=e=>{const a=e.old_string??e.oldText??e.old_str,b=e.new_string??e.newText??e.new_str;if(typeof a==='string'&&typeof b==='string')pairs.push([a,b]);};
 add(input);if(Array.isArray(input.edits))input.edits.forEach(add);
 const file=input.path||input.file_path||input.file||'file';
 return pairs.length?`--- ${file}\n+++ ${file}\n`+pairs.map(([a,b])=>`@@\n${lines('-',a)}\n${lines('+',b)}`).join('\n'):'';
}
// Pairs each toolCall with its toolResult; returns [{role,text,tools:[{name,input,diff,output,isError}]}] in order.
export function normalize(messages){
 const calls=[],out=[];
 for(const m of messages||[]){
  if(m.role==='toolResult'){const c=calls.find(c=>m.toolCallId&&c.id===m.toolCallId)||calls.find(c=>!c.done&&c.name===m.toolName);if(c){c.output=resultText(m.content);c.isError=!!m.isError;c.done=true;}continue;}
  if(!['user','assistant'].includes(m.role))continue;
  const entry={role:m.role,text:'',tools:[]};
  for(const p of m.content||[]){
   if(p.type==='text'&&p.text)entry.text+=(entry.text?'\n\n':'')+p.text;
   else if(p.type==='image')entry.text+=(entry.text?'\n\n':'')+'[image]';
   else if(p.type==='toolCall'){const input=inputOf(p),t={id:p.id,name:p.name||'tool',input,diff:diffOf(input),output:'',isError:false,done:false};calls.push(t);entry.tools.push(t);}
  }
  if(entry.text||entry.tools.length)out.push(entry);
 }
 return out;
}
const inputText=i=>typeof i==='string'?i:JSON.stringify(i,null,2);
const who=r=>r==='user'?'You':'Assistant';
export function toMarkdown(thread){
 const head=[`# ${thread.title||'Untitled thread'}`,[thread.cwd&&`Project: \`${thread.cwd}\``,thread.branch&&`Branch: \`${thread.branch}\``].filter(Boolean).join('  \n')].filter(Boolean).join('\n\n');
 const body=normalize(thread.messages).map(e=>[`## ${who(e.role)}`,e.text,...e.tools.map(t=>`<details>\n<summary>${esc(t.name)}${t.isError?' (error)':''}</summary>\n\n${fence(inputText(t.input),'json')}\n${t.diff?'\n'+fence(t.diff,'diff')+'\n':''}${t.output?'\n'+fence(t.output)+'\n':''}\n</details>`)].filter(Boolean).join('\n\n'));
 return [head,...body].join('\n\n')+'\n';
}
const CSS=`:root{color-scheme:light dark;--bg:#fff;--fg:#1c1b19;--mute:#76716a;--line:#e4e0d8;--card:#f6f3ee;--add:#1a7f37;--del:#cf222e}@media(prefers-color-scheme:dark){:root{--bg:#161512;--fg:#ece8e1;--mute:#9a948a;--line:#2d2b27;--card:#201e1b;--add:#56d364;--del:#ff7b72}}body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.6 ui-sans-serif,system-ui,sans-serif}main{max-width:760px;margin:0 auto;padding:40px 20px 80px}h1{font-size:24px;margin:0 0 4px}.meta{color:var(--mute);font-size:13px;margin:0 0 28px}section{margin:0 0 22px}h2{font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:var(--mute);margin:0 0 6px}.text{white-space:pre-wrap;overflow-wrap:anywhere}.user .text{background:var(--card);border-radius:12px;padding:10px 14px}details{margin:8px 0;border:1px solid var(--line);border-radius:10px;padding:6px 12px}summary{cursor:pointer;color:var(--mute);font-size:13px}pre{overflow:auto;background:var(--card);border-radius:8px;padding:10px;font:12.5px/1.5 ui-monospace,Menlo,monospace;margin:8px 0}.add{color:var(--add)}.del{color:var(--del)}.err summary{color:var(--del)}`;
const diffHtml=d=>d.split('\n').map(l=>`<span class="${l.startsWith('+')&&!l.startsWith('+++')?'add':l.startsWith('-')&&!l.startsWith('---')?'del':''}">${esc(l)}</span>`).join('\n');
export function toHtml(thread){
 const title=esc(thread.title||'Untitled thread'),meta=[thread.cwd,thread.branch].filter(Boolean).map(esc).join(' · ');
 const sections=normalize(thread.messages).map(e=>`<section class="${e.role}"><h2>${who(e.role)}</h2>${e.text?`<div class="text">${esc(e.text)}</div>`:''}${e.tools.map(t=>`<details${t.isError?' class="err"':''}><summary>${esc(t.name)}${t.isError?' (error)':''}</summary><pre>${esc(inputText(t.input))}</pre>${t.diff?`<pre class="diff">${diffHtml(t.diff)}</pre>`:''}${t.output?`<pre>${esc(t.output)}</pre>`:''}</details>`).join('')}</section>`).join('\n');
 return `<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><style>${CSS}</style></head><body><main><h1>${title}</h1><p class="meta">${meta}</p>\n${sections}\n</main></body></html>\n`;
}
export const fileName=(thread,ext)=>`${(thread.title||'thread').replace(/[^\w.-]+/g,'-').replace(/^-+|-+$/g,'').slice(0,60)||'thread'}.${ext}`;
