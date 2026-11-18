// Rewind timeline state. Ported from the neon timeline reducer (desktop-thread-details), without the cloud/db fields.
// phase: idle -> confirming -> rewinding -> done | failed. Events: load, move, select, ask, cancel, start, ok, fail.
export const initial=()=>({git:true,items:[],selected:null,phase:'idle',error:'',loaded:false,restored:null});
// Newest first, as drawn: the list from the backend is oldest first.
const order=list=>[...list].reverse();
export function reduce(s,e){
 const ids=s.items.map(x=>x.id);
 switch(e.type){
  case 'load':{const items=order(e.res?.checkpoints||[]);return {...s,git:e.res?.git!==false,items,loaded:true,phase:s.phase==='rewinding'?s.phase:'idle',selected:items.some(x=>x.id===s.selected)?s.selected:items[0]?.id??null};}
  case 'move':{if(!ids.length||s.phase==='rewinding')return s;const at=ids.indexOf(s.selected),i=e.delta==='first'?0:e.delta==='last'?ids.length-1:Math.min(ids.length-1,Math.max(0,(at<0?0:at)+e.delta));return {...s,selected:ids[i],phase:'idle',error:''};}
  case 'select':return ids.includes(e.id)&&s.phase!=='rewinding'?{...s,selected:e.id,phase:'idle',error:''}:s;
  case 'ask':return s.selected&&s.phase!=='rewinding'?{...s,phase:'confirming',error:''}:s;
  case 'cancel':return s.phase==='confirming'||s.phase==='failed'?{...s,phase:'idle',error:''}:s;
  case 'start':return s.phase==='confirming'||s.phase==='failed'?{...s,phase:'rewinding'}:s;
  case 'ok':{const items=order(e.res?.checkpoints||s.items),safety=items.find(x=>x.ref===e.res?.safety);return {...s,items,phase:'done',error:'',restored:{turn:e.res?.restored??null,files:e.res?.files??0,safety:safety?.id??null},selected:safety?.id??items[0]?.id??null};}
  case 'fail':return s.phase==='rewinding'?{...s,phase:'failed',error:e.message}:s;
  default:return s;
 }
}
export const title=c=>c.kind==='rewind'?c.label:`Before turn ${c.turn??'?'}`;
export const impact=c=>c.vsNow.files?`${c.vsNow.files} ${c.vsNow.files===1?'file':'files'} will change`:'Matches your files now';
export function ago(time,now=Date.now()){const s=Math.max(0,Math.round((now-time)/1000));return s<45?'just now':s<3600?Math.round(s/60)+' min ago':s<86400?Math.round(s/3600)+' h ago':Math.round(s/86400)+' d ago';}
