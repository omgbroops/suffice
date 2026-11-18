import {icon} from './ui.js';
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const clean=error=>error?.message?.replace(/^Error invoking remote method '[^']+': (?:Error: )?/,'')||'Could not complete this action';
const TRIGGERS=[['daily','Every day'],['hourly','Every hour'],['cron','Custom schedule'],['push','On git push'],['file','On file change']];
const EFFORTS=['low','medium','high','xhigh','max'];

const clock=time=>new Date(time).toLocaleTimeString([],{hour:'numeric',minute:'2-digit'});
// Next runs read as "Today 9:00 AM"; past runs as "5 min ago".
export function whenNext(time,now=Date.now()){
 const day=value=>{const d=new Date(value);return new Date(d.getFullYear(),d.getMonth(),d.getDate()).getTime();},gap=Math.round((day(time)-day(now))/864e5);
 if(gap<=0)return 'Today '+clock(time);if(gap===1)return 'Tomorrow '+clock(time);
 return (gap<7?new Date(time).toLocaleDateString([],{weekday:'short'}):new Date(time).toLocaleDateString([],{month:'short',day:'numeric'}))+' '+clock(time);
}
export function whenAgo(time,now=Date.now()){
 const minutes=Math.max(0,Math.round((now-time)/6e4));if(minutes<1)return 'Just now';if(minutes<60)return minutes+' min ago';
 const hours=Math.round(minutes/60);if(hours<24)return hours+(hours===1?' hour ago':' hours ago');
 return new Date(time).toLocaleDateString([],{month:'short',day:'numeric'})+' '+clock(time);
}
export function describe(trigger){
 if(trigger.kind==='daily')return 'Every day at '+trigger.time;
 if(trigger.kind==='hourly')return 'Every hour at :'+String(trigger.minute).padStart(2,'0');
 if(trigger.kind==='cron')return 'Schedule '+trigger.cron;
 return trigger.kind==='push'?'When you push':'When files change';
}
export function lastRunText(item,now=Date.now()){
 const run=item.lastRun;if(item.running||run?.status==='running')return {text:'Running now',tone:'live'};
 if(!run)return {text:'Never run',tone:''};
 return run.status==='error'?{text:'Last run '+whenAgo(run.at,now)+' failed: '+(run.error||'unknown error'),tone:'bad'}:{text:'Last run '+whenAgo(run.at,now),tone:''};
}
export function nextRunText(item,now=Date.now()){
 if(!item.enabled)return 'Paused';
 if(item.nextRun)return 'Next run '+whenNext(item.nextRun,now);
 return item.trigger.kind==='push'?'Waiting for a push':'Waiting for file changes';
}

export function mountAutomationSettings(content,section,api){
 if(section!=='automations')return;
 const host=content.querySelector('#settings-title-automations')?.closest('.settings-section');if(!host)return;for(const group of host.querySelectorAll('.settings-group'))group.remove();
 mountAutomations(host,api);
}
// Shared by the Settings section and the Scheduled sidebar page.
export function mountAutomations(host,api){
 const status=document.createElement('p');status.className='resource-status';status.role='status';
 const card=document.createElement('div');card.className='settings-card automation-card';host.append(status,card);
 const fail=error=>{status.textContent=clean(error);};
 const button=(text,fn,cls='')=>{const b=document.createElement('button');b.type='button';b.className='settings-select settings-configure '+cls;b.textContent=text;b.onclick=async()=>{b.disabled=true;status.textContent='';try{await fn();}catch(e){fail(e);}finally{b.disabled=false;}};return b;};
 const switchFor=(item)=>{const b=document.createElement('button');b.type='button';b.className='settings-switch';b.role='switch';b.setAttribute('aria-label','Enable '+item.name);b.setAttribute('aria-checked',String(item.enabled));b.innerHTML='<span></span>';b.onclick=async()=>{try{await api.toggleAutomation({id:item.id,enabled:!item.enabled});}catch(e){fail(e);}};return b;};

 async function edit(item){
  const [projects,models]=await Promise.all([api.projects(),api.models().catch(()=>[])]);
  if(!projects.length)throw new Error('Add a project first. Automations run inside a project folder.');
  const t=item?.trigger||{kind:'daily',time:'09:00'},dialog=document.createElement('dialog');dialog.className='provider-dialog resource-dialog automation-dialog';dialog.setAttribute('aria-label',item?'Edit automation':'New automation');
  const options=(list,selected)=>list.map(([value,label])=>`<option value="${esc(value)}"${value===selected?' selected':''}>${esc(label)}</option>`).join('');
  const modelKey=item?.model?item.provider+'|'+item.model:'';
  dialog.innerHTML=`<form><header><h2>${item?'Edit automation':'New automation'}</h2><button type="button" data-close aria-label="Close">${icon('close')}</button></header><div class="provider-dialog-body">
   <label class="resource-field">Name<input name="name" maxlength="80" required placeholder="Morning dependency check" value="${esc(item?.name)}"></label>
   <div class="automation-pair"><label class="resource-field">Project<select name="project">${options(projects.map(p=>[p.path,p.name]),item?.project||projects[0].path)}</select></label>
   <label class="resource-field">Runs<select name="kind">${options(TRIGGERS,t.kind)}</select></label></div>
   <label class="resource-field" data-when="daily">Time<input name="time" type="time" value="${esc(t.time||'09:00')}"></label>
   <label class="resource-field" data-when="hourly">Minute past the hour<input name="minute" type="number" min="0" max="59" value="${esc(t.minute??0)}"></label>
   <label class="resource-field" data-when="cron">Cron (minute hour day month weekday)<input name="cron" spellcheck="false" placeholder="0 9 * * 1-5" value="${esc(t.cron||'')}"></label>
   <p class="automation-note" data-when="push">Starts when a git push from this project updates a remote branch.</p>
   <p class="automation-note" data-when="file">Starts when files in this project change. Checked every 30 seconds, at most once a minute.</p>
   <div class="automation-pair"><label class="resource-field">Model<select name="model"><option value="">Default model</option>${models.map(m=>`<option value="${esc(m.provider+'|'+m.id)}"${m.provider+'|'+m.id===modelKey?' selected':''}>${esc(m.name||m.id)}</option>`).join('')}</select></label>
   <label class="resource-field">Effort<select name="effort">${options(EFFORTS.map(e=>[e,e==='xhigh'?'Extra high':e[0].toUpperCase()+e.slice(1)]),item?.effort||'medium')}</select></label></div>
   <label class="resource-field">Prompt<textarea name="prompt" rows="5" required placeholder="Check for outdated dependencies and open a summary.">${esc(item?.prompt)}</textarea></label>
   <p role="status" class="automation-error"></p></div>
   <footer class="provider-dialog-footer"><button type="button" class="provider-dialog-button" data-close>Cancel</button><button type="submit" class="provider-dialog-button provider-dialog-primary">${item?'Save':'Create'}</button></footer></form>`;
  const form=dialog.querySelector('form'),kind=form.elements.kind,error=dialog.querySelector('.automation-error');
  const sync=()=>{for(const el of dialog.querySelectorAll('[data-when]'))el.hidden=el.dataset.when!==kind.value;};sync();kind.onchange=sync;
  const close=()=>{dialog.close();dialog.remove();};for(const b of dialog.querySelectorAll('[data-close]'))b.onclick=close;
  dialog.addEventListener('cancel',()=>dialog.remove());
  form.onsubmit=async event=>{event.preventDefault();const f=form.elements,[provider,...rest]=f.model.value.split('|'),k=kind.value;
   const trigger={kind:k,...(k==='daily'?{time:f.time.value}:{}),...(k==='hourly'?{minute:Number(f.minute.value)}:{}),...(k==='cron'?{cron:f.cron.value}:{})};
   try{await api.saveAutomation({id:item?.id,name:f.name.value,project:f.project.value,prompt:f.prompt.value,trigger,effort:f.effort.value,...(provider?{provider,model:rest.join('|')}:{})});close();}catch(e){error.textContent=clean(e);}};
  document.body.append(dialog);dialog.showModal();form.elements.name.focus();
 }

 function draw(items){
  if(!host.isConnected)return;card.replaceChildren();
  const head=document.createElement('div');head.className='settings-option';head.innerHTML='<div class="settings-option-copy"><div><span class="settings-option-label">Scheduled prompts</span><p>Start a thread in a project on a schedule, after a git push, or when files change.</p></div></div>';
  const actions=document.createElement('div');actions.className='resource-actions';actions.append(button('New automation',()=>edit(null),'resource-primary'));head.append(actions);card.append(head);
  if(!items.length){const empty=document.createElement('p');empty.className='settings-group-empty';empty.textContent='No automations yet. Create one to run a saved prompt on its own.';card.append(empty);return;}
  for(const item of items){
   const last=lastRunText(item),el=document.createElement('div');el.className='settings-option automation-row';el.dataset.automation=item.id;
   const project=item.project.split(/[\\/]/).filter(Boolean).pop();
   el.dataset.tile='';el.innerHTML=`<div class="settings-option-copy"><span class="settings-tile" aria-hidden="true">${icon('calendar')}</span><div><span class="settings-option-label">${esc(item.name)}</span><p>${esc(describe(item.trigger))} · ${esc(project)}${item.model?' · '+esc(item.model):''}</p><p class="automation-times"><span class="automation-last" data-tone="${last.tone}">${esc(last.text)}</span><span>${esc(nextRunText(item))}</span></p></div></div>`;
   const actions=document.createElement('div');actions.className='resource-actions';
   actions.append(button('Run now',()=>api.runAutomation(item.id)),button('Edit',()=>edit(item)),button('Delete',()=>api.removeAutomation(item.id)),switchFor(item));
   el.append(actions);card.append(el);
  }
 }
 const load=()=>api.automations().then(draw).catch(fail);load();
 const off=api.onEvent?.(event=>{if(!host.isConnected){off?.();return;}if(event.event==='automations_changed')void load();});
}
