import {initial,reduce,title,impact,ago} from './rewind-model.js';
import {getThreadDirectory} from './thread-directory.js';
const el=(tag,cls,text)=>{const node=document.createElement(tag);if(cls)node.className=cls;if(text!=null)node.textContent=text;return node;};
// Mounts the rewind timeline into the right panel body. `valid()` says whether this mount is still the current one.
export async function mountRewind(body,{api,id,valid}){
 let st=initial(),convo=false;const root=el('div','rewind');body.replaceChildren(root);
 const running=()=>['working','approval'].includes(getThreadDirectory().threads.find(t=>t.id===id)?.status);
 const send=e=>{st=reduce(st,e);draw();};
 function draw(){
  const had=root.contains(document.activeElement)?document.activeElement.dataset?.id:null;root.replaceChildren();
  if(!st.loaded){root.append(el('p','panel-inline-note','Loading…'));return;}
  if(!st.git){const e=el('div','panel-empty');e.append(el('p','','No Git repository'),el('p','panel-empty-detail','Rewind saves your files with Git. Run git init in this project to turn it on.'));root.append(e);return;}
  if(!st.items.length){const e=el('div','panel-empty');e.append(el('p','','No checkpoints yet'),el('p','panel-empty-detail','Each turn saves your files first. Send a message to start the timeline.'));root.append(e);return;}
  const head=el('div','rewind-head');head.append(el('span','rewind-title','Rewind'),el('span','rewind-count',st.items.length+(st.items.length===1?' checkpoint':' checkpoints')));
  const list=el('div','rewind-rail');list.setAttribute('role','listbox');list.setAttribute('aria-label','Checkpoints, newest first');list.tabIndex=-1;
  const now=el('div','rewind-now');now.append(el('span','rewind-dot'),el('span','rewind-now-label','Now'));list.append(now);
  for(const c of st.items){
   const row=el('button','rewind-item');row.type='button';row.dataset.id=c.id;row.dataset.kind=c.kind;row.setAttribute('role','option');row.setAttribute('aria-selected',String(c.id===st.selected));row.tabIndex=c.id===st.selected?0:-1;
   const text=el('span','rewind-text');text.append(el('span','rewind-name',title(c)),el('span','rewind-label',c.label),el('span','rewind-meta',`${ago(c.time)} · ${c.vsNow.files?c.vsNow.files+(c.vsNow.files===1?' file ':' files '):'No changes '}`));
   if(c.vsNow.names?.length)text.lastChild.title=c.vsNow.names.join('\n')+(c.vsNow.files>c.vsNow.names.length?`\n+${c.vsNow.files-c.vsNow.names.length} more`:'');
   if(c.vsNow.files){const m=text.lastChild;const a=el('span','thread-added','+'+c.vsNow.added),r=el('span','thread-removed','−'+c.vsNow.removed);m.append(a,document.createTextNode(' '),r);}
   row.append(el('span','rewind-dot'),text);row.addEventListener('click',()=>send({type:'select',id:c.id}));list.append(row);
  }
  const keys={ArrowDown:1,ArrowUp:-1,Home:'first',End:'last'};
  list.addEventListener('keydown',ev=>{if(ev.key in keys){ev.preventDefault();send({type:'move',delta:keys[ev.key]});}else if(ev.key==='Enter'&&!running()){ev.preventDefault();send({type:'ask'});}});
  // Scrub: drag along the rail to move through checkpoints.
  list.addEventListener('pointermove',ev=>{if(ev.buttons!==1)return;const item=document.elementFromPoint(ev.clientX,ev.clientY)?.closest('.rewind-item');if(item&&item.dataset.id!==st.selected)send({type:'select',id:item.dataset.id});});
  const scroll=el('div','rewind-scroll');scroll.append(list);
  root.append(head,scroll,detail());
  const target=root.querySelector(`[data-id="${CSS.escape(had||'')}"]`)||root.querySelector('.rewind-item[aria-selected="true"]');
  if(had)target?.focus({preventScroll:true});root.querySelector('.rewind-item[aria-selected="true"]')?.scrollIntoView?.({block:'nearest'});
 }
 function detail(){
  const c=st.items.find(x=>x.id===st.selected),box=el('div','rewind-detail');box.setAttribute('role','group');box.setAttribute('aria-live','polite');
  if(!c)return box;
  const busy=st.phase==='rewinding',block=running();
  if(st.phase==='idle'||st.phase==='done'){
   if(st.phase==='done'&&st.restored)box.append(el('p','rewind-line',`Restored ${st.restored.files} ${st.restored.files===1?'file':'files'} to ${st.restored.kind==='end'?'after':'before'} turn ${st.restored.turn??'?'}.`),el('p','rewind-note','Your earlier files are saved as the selected checkpoint. Rewind to it to undo.'));
   else box.append(el('p','rewind-line',impact(c)));
   const go=el('button','rewind-button','Rewind to here');go.type='button';go.disabled=block||!c.vsNow.files;go.addEventListener('click',()=>send({type:'ask'}));
   box.append(go);if(block)box.append(el('p','rewind-note','Wait for this turn to finish.'));
   return box;
  }
  box.append(el('p','rewind-line',`Rewind to “${title(c)}”?`),el('p','rewind-note',`${impact(c)}. Files you changed since will be replaced, and a checkpoint of them is saved first.`));
  if(st.phase==='failed')box.append(el('p','rewind-error',`Rewind did not finish. ${String(st.error||'').replace(/[.\s]*$/,'')}. Nothing was changed.`));
  const row=el('div','rewind-actions');
  const yes=el('button','rewind-button rewind-button--primary',busy?'Rewinding…':st.phase==='failed'?'Try again':'Rewind');yes.type='button';yes.disabled=busy;
  const no=el('button','rewind-button','Cancel');no.type='button';no.disabled=busy;no.addEventListener('click',()=>send({type:'cancel'}));
  yes.addEventListener('click',async()=>{send({type:'start'});try{const res=await api.rewindRestore({threadId:id,checkpoint:c.id});const fresh=await api.rewindList(id);if(!valid())return;send({type:'ok',res:{...res,checkpoints:fresh.checkpoints}});document.dispatchEvent(new CustomEvent('suffice-rewind-restored'));if(convo&&c.turn)document.dispatchEvent(new CustomEvent('suffice-fork-thread',{detail:{id,turn:c.turn,kind:c.kind}}));}catch(error){send({type:'fail',message:error.message||'Unknown error.'});}});
  const lab=el('label','rewind-note'),chat=el('input');chat.type='checkbox';chat.checked=convo;chat.disabled=busy||!c.turn;chat.addEventListener('change',()=>{convo=chat.checked;});lab.append(chat,document.createTextNode(' Also restore the conversation to this turn (opens it as a new thread)'));
  box.append(lab);
  row.append(no,yes);box.append(row);return box;
 }
 root.addEventListener('keydown',ev=>{if(ev.key==='Escape'&&st.phase==='confirming'){ev.stopPropagation();send({type:'cancel'});}});
 draw();
 try{const res=await api.rewindList(id);if(valid())send({type:'load',res});}catch(error){if(valid()){root.replaceChildren(el('div','panel-empty')).firstChild.append(el('p','',"Couldn’t load the timeline"),el('p','panel-empty-detail',error.message));}}
}
