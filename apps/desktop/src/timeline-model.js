// Timeline state: pure, no DOM. Saves come from GET /v1/apps/{id}/timeline; the view in cloud-timeline.js draws them.
const num=n=>Number.isFinite(n)?n:0;
// destructive arrives as {what,rows} or, from older servers, a plain sentence.
const dest=d=>!d?null:typeof d==='string'?{what:d,rows:null}:{what:d.what||'data',rows:Number.isFinite(d.rows)?d.rows:null};
const kb=b=>{const a=Math.abs(b);return `${b<0?'−':'+'}${a>=1e6?(a/1e6).toFixed(1)+' MB':a>=1e3?Math.round(a/1e3)+' kB':a+' B'}`;};
// Newest first. The contract only carries sizes, so code and database changes fall back to a size delta from the save before it.
export function normalize(res){
 const saves=[...(res?.saves||[])].sort((a,b)=>Date.parse(b.created_at)-Date.parse(a.created_at)||0);
 return {head:res?.head??null,saves:saves.map((s,i)=>{
  const prev=saves[i+1];
  return {id:s.save_id,name:s.name||'Untitled save',at:Date.parse(s.created_at),
   code:s.changes?{files:s.changes.files,added:s.changes.added,removed:s.changes.removed,summary:s.changes.summary||''}:null,
   codeDelta:prev?num(s.code_bytes)-num(prev.code_bytes):null,
   dbRows:Number.isFinite(s.db?.rows_changed)?s.db.rows_changed:null,dbDelta:prev?num(s.db_bytes)-num(prev.db_bytes):null,
   destructive:dest(s.db?.destructive),tests:s.tests||null,first:!prev};
 })};
}
export function codeText(s){
 if(s.code)return s.code.files?`${s.code.files} ${s.code.files===1?'file':'files'}, +${s.code.added} −${s.code.removed}`:'No code changes';
 return s.first?'First save':s.codeDelta?`Code ${kb(s.codeDelta)}`:'No code changes';
}
export function dbText(s){
 if(s.dbRows!==null)return s.dbRows?`${s.dbRows.toLocaleString('en-US')} ${s.dbRows===1?'row':'rows'} changed`:'No database changes';
 return s.first?'Empty database':s.dbDelta?`Database ${kb(s.dbDelta)}`:'No database changes';
}
export const testText=s=>!s.tests?'Tests not run':s.tests.status==='passed'?'Tests passed':`Tests failed${s.tests.failed_step?' at '+s.tests.failed_step:''}`;
// What rewinding to `id` discards: every save newer than it.
export function impact(saves,id){
 const i=saves.findIndex(s=>s.id===id),gone=i<0?[]:saves.slice(0,i);
 const sum=k=>gone.reduce((n,s)=>n+(s.code?.[k]||0),0);
 return {gone:gone.length,files:sum('files'),added:sum('added'),removed:sum('removed'),rows:gone.reduce((n,s)=>n+(s.dbRows||0),0),
  sized:gone.some(s=>s.dbRows===null&&s.dbDelta),destructive:gone.filter(s=>s.destructive).map(s=>s.destructive.what)};
}
// Direction of each destructive migration relative to the target. Older than the target: it already ran, its data stays gone.
// Newer than the target: the rewind undoes it and the data returns.
export function migrations(saves,id,clock){
 const i=saves.findIndex(s=>s.id===id),out=[];if(i<0)return out;
 const lost=d=>d.what+(d.rows?` (${d.rows.toLocaleString('en-US')} rows)`:'');
 saves.forEach((s,j)=>{if(!s.destructive)return;const d=s.destructive;
  if(j<i)out.push(`Brings back ${lost(d)} dropped at ${clock(s.at)}.`);
  else{const keep=saves[j+1];out.push(`${lost(d)} was dropped at ${clock(s.at)} and stays gone. ${keep?`The newest save that still has it is ${clock(keep.at)}, ${keep.name}.`:'No save still has it.'}`);}
 });
 return out;
}
// A rewind to the newest save changes nothing, so the button is not offered there.
export const canRewind=s=>!!s.selected&&s.saves.length>0&&s.saves[0].id!==s.selected&&s.saves.some(x=>x.id===s.selected);
// phase: idle -> confirming -> rewinding -> done | failed. Events: load, move, select, ask, cancel, start, ok, fail.
export const initial=()=>({saves:[],head:null,selected:null,phase:'idle',error:'',loaded:false});
export function reduce(s,e){
 const ids=s.saves.map(x=>x.id);
 switch(e.type){
  case 'load':{const n=normalize(e.res);return {...s,saves:n.saves,head:n.head,loaded:true,selected:n.saves.some(x=>x.id===s.selected)?s.selected:n.saves[0]?.id??null};}
  case 'move':{if(!ids.length||s.phase==='rewinding')return s;const i=Math.min(ids.length-1,Math.max(0,(ids.indexOf(s.selected)<0?0:ids.indexOf(s.selected))+e.delta));return {...s,selected:ids[i],phase:s.phase==='confirming'?'idle':s.phase,error:s.phase==='failed'?'':s.error};}
  case 'select':return ids.includes(e.id)&&s.phase!=='rewinding'?{...s,selected:e.id,phase:'idle',error:''}:s;
  case 'ask':return s.selected&&s.phase!=='rewinding'?{...s,phase:'confirming',error:''}:s;
  case 'cancel':return s.phase==='confirming'||s.phase==='failed'?{...s,phase:'idle'}:s;
  case 'start':return s.phase==='confirming'||s.phase==='failed'?{...s,phase:'rewinding'}:s;
  case 'ok':{const n=normalize(e.res);return {...s,saves:n.saves,head:n.head,phase:'done',error:'',selected:n.head&&n.saves.some(x=>x.id===n.head)?n.head:s.selected};}
  case 'fail':return s.phase==='rewinding'?{...s,phase:'failed',error:e.message}:s;
 }
 return s;
}
