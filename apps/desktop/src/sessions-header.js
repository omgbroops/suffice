import {threadViewState as viewState} from './thread-view-state.js';
import {setSessionTools} from './workspace-tools.js';
import './sessions-header.css';

// The session caption is the normal thread header: its text is the title, the island (workspace-tools) carries ring, mode toggle and panel toggle.
export const viewId=id=>'session-'+id;
export const storedTitle=id=>viewState.read(viewId(id)).sidebar?.title||'';

export function connectSessionHeader(header,{current,renamed}){
 let from=null;
 header.addEventListener('focus',()=>{const id=current();from=id?{id,title:header.textContent}:null;});
 // Capture: runs before threads-ui's keydown, which blurs synchronously on Escape.
 header.addEventListener('keydown',e=>{if(e.key==='Escape'&&from)header.textContent=from.title;},true);
 // Chromium keeps a stale layout after contenteditable edits: the ellipsis is not drawn until the box is laid out again.
 header.addEventListener('blur',()=>{header.scrollLeft=0;header.style.display='none';void header.offsetHeight;header.style.display='';const e=from;from=null;if(!e||e.id!==current())return;
  const title=header.textContent.replace(/\s+/g,' ').trim().slice(0,200);if(!title){header.textContent=e.title;return;}if(title===e.title)return;
  viewState.updateFor(viewId(e.id),{sidebar:{...viewState.read(viewId(e.id)).sidebar,title}});renamed(e.id,title);});
 return {
  select(id){viewState.select(id);},
  // Never unselect a thread the normal chat selected after us.
  deselect(){if(String(viewState.id||'').startsWith('session-'))viewState.select(null);setSessionTools(null);},
  paint({title,mode,onMode}){if(document.activeElement!==header)header.textContent=title;header.className='thread-header';setSessionTools({kind:'chat',mode,onMode});},
  paintImport({title,onResume}){header.textContent=title;header.className='thread-header';setSessionTools({kind:'import',onResume});},
  usage(meta){
   const pct=meta?.contextUsedPct,u=meta?.usage,ok=Number.isFinite;
   document.dispatchEvent(new CustomEvent('suffice-session-usage',{detail:meta?{windowPercent:ok(pct)?pct:undefined,windowTokens:u?.inputTokens,totalTokens:ok(u?.inputTokens)?u.inputTokens+(u.outputTokens||0):undefined}:null}));
  },
 };
}
