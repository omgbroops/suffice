const el=(tag,cls,text)=>{const node=document.createElement(tag);if(cls)node.className=cls;if(text!=null)node.textContent=text;return node;};
const empty=(a,b)=>{const e=el('div','panel-empty');e.append(el('p','',a));if(b)e.append(el('p','panel-empty-detail',b));return e;};
// Boxes tab: pick a cloud box, scrub its checkpoints, restore one in place or fork a new box from it. Reuses the rewind rail styles.
export async function mountBoxes(body,{api,valid}){
 const root=el('div','rewind boxes');body.replaceChildren(root);
 const st={boxes:null,box:null,cks:[],ck:null,phase:'idle',note:'',error:''};
 const run=async fn=>{st.error='';try{await fn();}catch(e){st.error=e.message||'Unknown error.';st.phase='idle';}if(valid())draw();};
 const pickBox=id=>run(async()=>{st.box=id;st.ck=null;st.phase='idle';st.note='';st.cks=await api.boxesCheckpoints(id);st.ck=st.cks[st.cks.length-1]?.id??null;});
 const rows=(items,sel,cls,onPick,label)=>{
  const list=el('div',cls);list.setAttribute('role','listbox');list.setAttribute('aria-label',label);
  for(const x of items){const row=el('button','rewind-item');row.type='button';row.dataset.id=x.id;row.setAttribute('role','option');row.setAttribute('aria-selected',String(x.id===sel));row.tabIndex=x.id===sel?0:-1;
   const t=el('span','rewind-text');t.append(el('span','rewind-name',x.name),el('span','rewind-meta',[x.state,x.created&&new Date(x.created).toLocaleString()].filter(Boolean).join(' · ')||x.id));
   row.append(el('span','rewind-dot'),t);row.addEventListener('click',()=>onPick(x.id));list.append(row);}
  list.addEventListener('keydown',ev=>{const i=items.findIndex(x=>x.id===sel),d={ArrowDown:1,ArrowUp:-1}[ev.key],n=ev.key==='Home'?items[0]:ev.key==='End'?items[items.length-1]:d&&items[i+d];if(!d&&!n)return;ev.preventDefault();if(n)onPick(n.id);});
  return list;
 };
 function draw(){
  const had=root.contains(document.activeElement)?document.activeElement.dataset?.id:null;root.replaceChildren();
  if(st.boxes===null){root.append(el('p','panel-inline-note','Loading…'));return;}
  if(!st.connected){root.append(empty('Boxes are not connected','Set SUFFICE_BOXES_URL and SUFFICE_BOXES_TOKEN, or add boxes.json with baseUrl and token to your Suffice home.'));return;}
  if(!st.boxes.length){root.append(empty('No boxes yet','Create a box and it appears here with its checkpoints.'));return;}
  const head=el('div','rewind-head');head.append(el('span','rewind-title','Boxes'),el('span','rewind-count',st.boxes.length+(st.boxes.length===1?' box':' boxes')));
  const scroll=el('div','rewind-scroll');scroll.append(rows(st.boxes,st.box,'rewind-rail boxes-list',pickBox,'Boxes'));
  if(st.box){
   const h=el('div','rewind-head');h.append(el('span','rewind-title','Checkpoints'),el('span','rewind-count',st.cks.length));scroll.append(h);
   if(st.cks.length){const rail=rows([...st.cks].reverse(),st.ck,'rewind-rail boxes-checkpoints',id=>{st.ck=id;st.phase='idle';st.note='';draw();},'Checkpoints, newest first');scroll.append(rail);}
   else scroll.append(empty('No checkpoints yet','Checkpoint this box from an agent run to build its timeline.'));
  }
  root.append(head,scroll,detail());
  (root.querySelector(`[data-id="${CSS.escape(had||'')}"]`))?.focus({preventScroll:true});
 }
 function detail(){
  const box=el('div','rewind-detail');box.setAttribute('role','group');box.setAttribute('aria-live','polite');
  const c=st.cks.find(x=>x.id===st.ck);if(!c)return box;
  const busy=st.phase==='working';
  if(st.note)box.append(el('p','rewind-line',st.note));
  if(st.error)box.append(el('p','rewind-error',st.error.replace(/[.\s]*$/,'')+'. Nothing was changed.'));
  if(st.phase==='confirming'||busy){
   box.append(el('p','rewind-line',`Restore “${c.name}”?`),el('p','rewind-note','The box returns to this checkpoint. Its current state is kept as a checkpoint first.'));
   const row=el('div','rewind-actions'),no=el('button','rewind-button','Cancel'),yes=el('button','rewind-button rewind-button--primary',busy?'Restoring…':'Restore');no.type=yes.type='button';no.disabled=yes.disabled=busy;
   no.addEventListener('click',()=>{st.phase='idle';draw();});
   yes.addEventListener('click',()=>{st.phase='working';draw();run(async()=>{const r=await api.boxesRestore({id:st.box,checkpoint:c.id});st.cks=r.checkpoints;st.ck=st.cks[st.cks.length-1]?.id??null;st.phase='idle';st.note=`Restored to “${c.name}”.`;});});
   row.append(no,yes);box.append(row);return box;
  }
  const row=el('div','rewind-actions'),fork=el('button','rewind-button','Fork box'),res=el('button','rewind-button rewind-button--primary','Restore…');fork.type=res.type='button';
  res.addEventListener('click',()=>{st.phase='confirming';st.note='';draw();});
  fork.addEventListener('click',()=>{const name=c.name;st.note='';run(async()=>{const made=await api.boxesFork({id:st.box,checkpoint:c.id});st.boxes=(await api.boxesList()).boxes;st.note=`Forked “${name}” into ${made.name}.`;});});
  row.append(fork,res);box.append(row);return box;
 }
 draw();
 // Poll so boxes created or removed elsewhere show up; the loop ends when the panel is gone.
 const poll=async()=>{await new Promise(r=>setTimeout(r,4000));if(!valid())return;try{const r=await api.boxesList();if(!valid())return;if(st.phase!=='working'&&JSON.stringify([r.connected,r.boxes])!==JSON.stringify([st.connected,st.boxes])){st.connected=r.connected;st.boxes=r.boxes;if(st.box&&!r.boxes.some(b=>b.id===st.box)){st.box=null;st.cks=[];st.ck=null;st.phase='idle';}if(!st.box&&r.boxes.length)await pickBox(r.boxes[0].id);else draw();}}catch{}poll();};
 try{const r=await api.boxesList();if(!valid())return;st.connected=r.connected;st.boxes=r.boxes;if(r.boxes.length)await pickBox(r.boxes[0].id);else draw();poll();}
 catch(e){if(valid())root.replaceChildren(empty('Couldn’t load boxes',e.message));}
}
