import './spotlight-history.css';
// Cmd+K "History" scope: full-text search over chats other agents keep on disk. The rows come from the backend (history.find); opening one reads the session in the chat renderer.
const AGENTS={'claude-code':'Claude Code',codex:'Codex',opencode:'OpenCode','claude-desktop':'Claude Desktop',cursor:'Cursor'};
const base=p=>String(p||'').split('/').filter(Boolean).pop()||'';
const api=()=>window.sufficeDesktop?.sessions?.history;
export const historyAvailable=()=>!!api()?.search;
export const searchHistory=query=>api().search({query});
export function historyItem(h){return {id:'history:'+h.source+':'+h.path,scope:'history',title:h.title,history:h,run:()=>document.dispatchEvent(new CustomEvent('suffice-open-history',{detail:h}))};}
// Snippet with the query terms in <mark>, built as nodes (never innerHTML).
function marked(text,query){const out=document.createDocumentFragment(),terms=query.toLowerCase().split(/\s+/).filter(Boolean);
 if(!terms.length){out.append(text);return out;}
 const re=new RegExp('('+terms.map(t=>t.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('|')+')','gi');
 text.split(re).forEach((part,i)=>{if(i%2){const m=document.createElement('mark');m.textContent=part;out.append(m);}else if(part)out.append(part);});return out;}
export function fillHistoryRow(el,content,item,query,span){const h=item.history;el.classList.add('spotlight-history');
 if(h.snippet){const s=span('spotlight-result-detail spotlight-snippet','');s.append(marked(h.snippet,query));content.append(s);}
 const meta=span('spotlight-project spotlight-history-meta',[AGENTS[h.source]||h.source,base(h.cwd)].filter(Boolean).join(' · '));meta.title=h.cwd||'';
 const age=span('spotlight-age thread-age','');age.dataset.modified=String(h.updatedAt);age.dataset.started='';
 el.append(content,meta,age);}
