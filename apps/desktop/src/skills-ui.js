import {threadViewState as store} from './thread-view-state.js';
// Skills attached to the composer's thread. Held in memory per thread (shortcut: lost on reload, persist via view state if wanted).
export function connectSkills({form,toast}){
 const api=window.sufficeDesktop,tray=document.createElement('div');tray.className='skill-chips';tray.hidden=true;tray.setAttribute('aria-label','Attached skills');
 form.querySelector('.attachment-tray').after(tray);
 let key=store.id||'new',library=[];const sets=new Map();const current=()=>sets.get(key)||new Set();
 const refresh=async()=>{try{library=await api.skills();}catch(e){toast(e.message);}return library;};
 function render(){
  const ids=[...current()].filter(id=>library.some(s=>s.id===id));
  tray.hidden=!ids.length;
  tray.replaceChildren(...ids.map(id=>{const s=library.find(x=>x.id===id),chip=document.createElement('span'),x=document.createElement('button');chip.className='skill-chip';chip.textContent=s.name;x.type='button';x.className='skill-chip-remove';x.setAttribute('aria-label','Remove skill '+s.name);x.textContent='×';x.onclick=()=>toggle(id);chip.append(x);return chip;}));
 }
 function toggle(id){const next=new Set(current());next.has(id)?next.delete(id):next.add(id);sets.set(key,next);render();}
 store.subscribe(event=>{
  if(event.type==='adopt'){const next=event.id;if(next&&next!==key){sets.set(next,current());sets.delete('new');key=next;}return;}
  if(event.type==='select'){key=event.id||'new';render();}
 });
 form.skills={
  toggle,
  ids:()=>library.length?[...current()].filter(id=>library.some(s=>s.id===id)):[],
  async items(){await refresh();render();const on=current();return [...library.map(s=>({label:s.name,detail:s.description||undefined,action:'skill:'+s.id,selected:on.has(s.id)})),{label:'Manage skills',action:'skills:manage',separator:library.length>0}];}
 };
 void refresh().then(render);
}
