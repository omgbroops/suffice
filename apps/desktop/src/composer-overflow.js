export function connectComposerOverflow(form){
 const row=form.querySelector('.composer-toolbar');let frame;
 const update=()=>{frame=0;delete form.dataset.compactAccess;delete form.dataset.compactModel;
  const width=()=>[...row.children].reduce((sum,child)=>sum+child.getBoundingClientRect().width,0)+parseFloat(getComputedStyle(row).columnGap||0);
  if(width()>row.clientWidth)form.dataset.compactAccess='true';
  if(width()>row.clientWidth)form.dataset.compactModel='true';
 };
 const schedule=()=>{if(!frame)frame=requestAnimationFrame(update);};
 new ResizeObserver(schedule).observe(form);new MutationObserver(schedule).observe(row,{childList:true,subtree:true,characterData:true});schedule();
}
