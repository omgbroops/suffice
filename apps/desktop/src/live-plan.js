// Live plan card: TodoWrite ({todos:[{content,status,activeForm}]}) and update_plan ({plan:[{step,status}]}) tool calls render as a ticking checklist.
const NAME=/^(todo_?write|update_?plan|todo|plan)$/i;
export function parsePlan(name,input){
 if(!NAME.test(String(name||'').replace(/[^a-z_]/gi,'')))return null;
 const list=input?.todos||input?.plan||input?.items;if(!Array.isArray(list)||!list.length)return null;
 return list.map(i=>({text:String(i.content||i.step||i.text||i.title||'').trim(),active:String(i.activeForm||'').trim(),state:/complete|done/i.test(i.status)?'done':/progress|active|running/i.test(i.status)?'active':'todo'})).filter(i=>i.text);
}
export function createLivePlan(){
 const el=document.createElement('details');el.className='live-plan';el.hidden=true;el.open=true;
 const summary=document.createElement('summary');const count=document.createElement('span');count.className='live-plan-count';const now=document.createElement('span');now.className='live-plan-now';summary.append(count,now);
 const list=document.createElement('ul');list.className='live-plan-list';el.append(summary,list);
 let touched=false,previous=[];summary.addEventListener('click',()=>{touched=true;});
 return {element:el,update(items){
  const done=items.filter(i=>i.state==='done').length,active=items.find(i=>i.state==='active');
  el.hidden=false;el.dataset.state=done===items.length?'done':'running';
  count.textContent=`${done} of ${items.length} done`;now.textContent=active?(active.active||active.text):'';
  list.replaceChildren(...items.map((item,i)=>{const li=document.createElement('li');li.dataset.state=item.state;
   if(item.state==='done'&&previous[i]&&previous[i]!=='done')li.classList.add('just-done');
   const box=document.createElement('span');box.className='live-plan-box';box.innerHTML='<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M2.5 6.4l2.4 2.4 4.6-5.2"/></svg>';
   const label=document.createElement('span');label.textContent=item.state==='active'&&item.active?item.active:item.text;li.append(box,label);return li;}));
  previous=items.map(i=>i.state);
  if(!touched&&el.dataset.state==='done')el.open=false;
 }};
}
