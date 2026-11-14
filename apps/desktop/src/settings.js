import {setProjectGroupExpanded} from './project-group-motion.js';
import {createProviderConnectModal} from './provider-connect-modal.js';
import {icon} from './ui.js';
import {settingsSections} from './settings-data.js';
import {createMenu} from './menu.js';
import {connectScrollEdges} from './components/ui/scroll-edges.js';
import './settings.css';
import {preference,savePreference,supportedSettings} from './settings-preferences.js';
import {backgroundPresets} from './backgrounds/presets.js';

const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const accents=['#7b9ed5','#a995d6','#d799aa','#d59c77','#c5b56f','#7cb59b'];

// Shared preferences back every editable control.
export function createSettings(){
 const root=document.createElement('section');root.className='settings-page';root.hidden=true;root.setAttribute('aria-label','Settings');
 root.innerHTML=`<div class="settings-nav"><label class="settings-search">${icon('search')}<input type="search" placeholder="Search settings" aria-label="Search settings"><kbd>Ctrl F</kbd></label><nav aria-label="Settings sections"></nav></div><section class="settings-main" aria-label="Settings content"><div class="settings-page-heading"></div><div class="settings-scroll"><div class="settings-content"></div></div></section>`;
 const main=root.querySelector('.settings-main');main.hidden=true;
 document.querySelector('.sidebar').append(root);document.querySelector('.workspace').append(main);
 const popup=document.createElement('div');popup.className='popover settings-select-menu';popup.hidden=true;document.body.append(popup);
 const menu=createMenu(popup),nav=root.querySelector('nav'),search=root.querySelector('input'),content=main.querySelector('.settings-content'),scroll=main.querySelector('.settings-scroll');
 const back=document.querySelector('[data-action="settings"]');
 connectScrollEdges(scroll);connectScrollEdges(nav);
 const positions=new Map();let selected='general',active=false,previousFocus,underlay=[],currentSelect,wasCollapsed=false,providers=[];
 const value=row=>row.id==='background'?(localStorage.getItem('suffice-background')||'lake'):preference(row.id,row.id==='mode'?(localStorage.getItem('suffice-theme')==='light'?'Light':'Dark'):row.value);
 const api=window.sufficeDesktop,connectionModal=createProviderConnectModal(api);let modelQuery='',modelWrites=Promise.resolve();const collapsedModels=new Set();
 const providerSection=settingsSections.find(section=>section.id==='providers'),modelsSection=settingsSections.find(section=>section.id==='models'),modelDefaults=modelsSection.groups[0];
 const backgroundRow=settingsSections.find(section=>section.id==='appearance').groups[0].rows.find(row=>row.id==='background');backgroundRow.options=Object.keys(backgroundPresets);
 const display=(row,current)=>row.id==='background'?backgroundPresets[current]?.label||current:row.id==='default-model'?row.labels?.[current]||current:current;
 async function commit(row,next){try{if(row.id==='worktree-location'&&next==='Custom location'&&!await api.settingsAction('worktree-location'))return false;await savePreference(row.id,next);}catch(error){showConnectionMessage(error.message||'Could not save this setting.');return false;}return true;}
 async function refreshProviders(){try{
  providers=await api.providers();const marks={'openai-codex':'openai',google:'gemini','google-vertex':'gemini'},assets=['openai','anthropic','azure','cohere','deepseek','gemini','groq','mistral','ollama','openrouter','xai'];
  const row=p=>({id:p.id,label:p.name||p.id,logo:marks[p.id]||(assets.includes(p.id)?p.id:null),type:'provider'});
  providerSection.groups=[{title:'Connected',rows:providers.filter(p=>p.connected).map(row),empty:'No providers connected'},{title:'Available',rows:providers.filter(p=>!p.connected).map(row),empty:'All providers connected'}];
  const models=await api.models(),modelRow=modelDefaults.rows.find(row=>row.id==='default-model');modelRow.options=['Last used',...models.map(model=>model.provider+'|'+model.id)];modelRow.labels=Object.fromEntries(models.map(model=>[model.provider+'|'+model.id,model.name]));
  const groups=providers.filter(p=>p.connected).map(p=>({id:p.id,title:p.name||p.id,logo:row(p).logo,models:true,empty:'No models available',rows:models.filter(model=>model.provider===p.id).map(model=>({id:model.provider+'|'+model.id,label:model.name,type:'model'}))}));
  modelsSection.groups=[...(groups.length?groups:[{title:'Models',rows:[],empty:'Connect a provider to choose models'}]),modelDefaults];
  if(active&&['models','providers'].includes(selected))render();
 }catch{if(active)showConnectionMessage('Could not load providers and models. Try reopening settings.');}}

 function control(row){
  const current=value(row),label=escape(row.label);
  if(['toggle','select','segment','palette','action'].includes(row.type)&&!supportedSettings.has(row.id))return '<span class="settings-unavailable">Not available yet</span>';
  switch(row.type){
   case 'model':return `<button type="button" class="settings-switch" role="switch" aria-label="${label}" aria-checked="${!preference('disabled-models',[]).includes(row.id)}" data-model="${escape(row.id)}"><span></span></button>`;
   case 'toggle':return `<button type="button" class="settings-switch" role="switch" aria-label="${label}" aria-checked="${!!current}" data-value="${row.id}"><span></span></button>`;
   case 'select':return `<button type="button" class="settings-select" aria-label="${label}" aria-haspopup="menu" aria-expanded="false" data-select="${row.id}"><span>${escape(display(row,current))}</span>${icon('chevron')}</button>`;
   case 'segment':return `<div class="settings-segment" role="group" aria-label="${label}"><span class="settings-segment-indicator"></span>${row.options.map(option=>`<button type="button" aria-pressed="${option===current}" data-segment="${row.id}" data-option="${escape(option)}">${escape(option)}</button>`).join('')}</div>`;
   case 'palette':return `<div class="settings-palette" role="group" aria-label="${label}">${accents.map(color=>`<button type="button" aria-label="${color}" aria-pressed="${color===current}" style="--swatch:${color}" data-segment="${row.id}" data-option="${color}"></button>`).join('')}</div>`;
   case 'keys':if(row.label==='Send message')return `<span class="settings-keys">${preference('send','Enter').split(' + ').map(key=>`<kbd>${escape(key)}</kbd>`).join('')}</span>`;if(row.label==='Send in background'&&preference('send','Enter')!=='Enter')return '<span class="settings-readonly">Send menu</span>';return `<span class="settings-keys">${String(current).split(' ').map(key=>`<kbd>${escape(key)}</kbd>`).join('')}</span>`;
   case 'provider':return `<button type="button" class="settings-select settings-configure provider-connect-button" data-provider="${row.id}" aria-label="Configure ${label}">${providers.find(p=>p.id===row.id)?.connected?'Connected':'Connect'}${icon('chevron')}</button>`;
   case 'action':return `<button type="button" class="settings-select settings-configure" data-settings-action="${row.id}">${escape(current)}</button>`;
   default:return `<span class="settings-readonly">${escape(current)}</span>`;
  }
 }
 function render(animate=false){
  menu.close();const query=search.value.trim().toLowerCase();
  const matches=(section,row)=>`${section.title} ${row.label} ${row.detail||''}`.toLowerCase().includes(query);
  let category='';nav.innerHTML=settingsSections.filter(section=>!query||section.groups.some(group=>group.rows.some(row=>matches(section,row)))).map(section=>{
   const heading=category!==section.category?`<div class="settings-nav-label">${section.category}</div>`:'';category=section.category;
   return `${heading}<button type="button" class="settings-nav-item" data-section="${section.id}" aria-current="${!query&&section.id===selected?'page':'false'}">${icon(section.icon)}${section.title}</button>`;
  }).join('');
  const sections=query?settingsSections:[settingsSections.find(section=>section.id===selected)];
  content.innerHTML=sections.map(section=>{
   const groups=section.groups.map(group=>({...group,rows:group.rows.filter(row=>!query||matches(section,row))})).filter(group=>group.rows.length||(!query&&group.empty));
   if(!groups.length)return '';
   return `<section class="settings-section" aria-labelledby="settings-title-${section.id}"><h1 id="settings-title-${section.id}">${section.title}</h1>${section.id==='models'?`<label class="settings-model-search">${icon('search')}<input type="search" aria-label="Search models in settings" placeholder="Search models" value="${escape(modelQuery)}"></label>`:''}${groups.map(group=>`<section class="settings-group${group.models?' settings-model-group':''}" aria-label="${escape(group.title)}"><h2>${group.models?`<button type="button" class="settings-provider-pill" data-model-group="${escape(group.id)}" aria-expanded="${!collapsedModels.has(group.id)}" aria-controls="models-group-${escape(group.id)}">`:''}${group.logo?`<img class="settings-provider-icon" src="./providers/${group.logo}.svg" alt="">`:''}${escape(group.title)}${group.models?`${icon('chevron','model-group-chevron')}</button>`:''}</h2><div ${group.models?`id="models-group-${escape(group.id)}" class="settings-model-group-body" ${collapsedModels.has(group.id)?'hidden inert':''}`:'class="settings-group-body"'}><div class="settings-card">${!group.rows.length?`<p class="settings-group-empty">${escape(group.empty)}</p>`:''}${group.rows.map(row=>`<div class="settings-option"><div class="settings-option-copy">${row.logo?`<img class="settings-provider-icon" src="./providers/${row.logo}.svg" alt="">`:row.type==='provider'?`<span class="settings-provider-placeholder" aria-hidden="true">${escape(row.label.charAt(0))}</span>`:''}<div><span class="settings-option-label">${escape(row.label)}</span>${row.detail?`<p>${escape(row.detail)}</p>`:''}</div></div>${control(row)}</div>`).join('')}</div></div></section>`).join('')}</section>`;
  }).join('')||'<div class="settings-empty">No settings found</div>';
  filterModels();for(const group of main.querySelectorAll('.settings-segment'))positionIndicator(group,false);
 }
 function filterModels(){const query=modelQuery.toLowerCase().trim();for(const group of content.querySelectorAll('.settings-model-group')){let count=0;for(const row of group.querySelectorAll('.settings-option')){row.hidden=!row.textContent.toLowerCase().includes(query)&&!row.querySelector('[data-model]').dataset.model.toLowerCase().includes(query);if(!row.hidden)count++;}group.hidden=!!query&&!count;const toggle=group.querySelector('[data-model-group]'),body=group.querySelector('.settings-model-group-body');if(query&&count){body.hidden=false;body.inert=false;toggle.setAttribute('aria-expanded','true');}else if(toggle){const collapsed=collapsedModels.has(toggle.dataset.modelGroup);body.hidden=collapsed;body.inert=collapsed;toggle.setAttribute('aria-expanded',String(!collapsed));}}}
 main.addEventListener('input',event=>{if(event.target.matches('.settings-model-search input')){modelQuery=event.target.value;filterModels();}});
 const findRow=id=>settingsSections.flatMap(section=>section.groups.flatMap(group=>group.rows)).find(row=>row.id===id);
 async function handleClick(event){
  if(event.target.closest('.settings-back')){close();return;}
  const section=event.target.closest('[data-section]');if(section){positions.set(selected,scroll.scrollTop);selected=section.dataset.section;search.value='';render(true);scroll.scrollTop=positions.get(selected)||0;return;}
  const groupToggle=event.target.closest('[data-model-group]');if(groupToggle){const id=groupToggle.dataset.modelGroup,expanded=groupToggle.getAttribute('aria-expanded')!=='true';expanded?collapsedModels.delete(id):collapsedModels.add(id);groupToggle.setAttribute('aria-expanded',String(expanded));setProjectGroupExpanded(document.getElementById(groupToggle.getAttribute('aria-controls')),expanded);return;}
  const model=event.target.closest('[data-model]');if(model){model.disabled=true;const key=model.dataset.model;modelWrites=modelWrites.catch(()=>{}).then(async()=>{const disabled=new Set(preference('disabled-models',[]));disabled.has(key)?disabled.delete(key):disabled.add(key);try{await savePreference('disabled-models',[...disabled]);model.setAttribute('aria-checked',String(!disabled.has(key)));}catch(error){showConnectionMessage(error.message);}finally{model.disabled=false;}});return;}
  const toggle=event.target.closest('[data-value]');if(toggle){const row=findRow(toggle.dataset.value),next=!value(row);if(await commit(row,next))toggle.setAttribute('aria-checked',String(next));return;}
  const segment=event.target.closest('[data-segment]');if(segment){if(await commit(findRow(segment.dataset.segment),segment.dataset.option)){for(const sibling of segment.parentElement.querySelectorAll('button'))sibling.setAttribute('aria-pressed',String(sibling===segment));positionIndicator(segment.parentElement,true);}return;}
  const select=event.target.closest('[data-select]');if(select){const row=findRow(select.dataset.select);currentSelect={row,button:select};menu.open(select,row.options.map((option,index)=>({label:display(row,option),selected:option===value(row),action:String(index)})),row.label);return;}
  const provider=event.target.closest('[data-provider]');if(provider){const p=providers.find(p=>p.id===provider.dataset.provider);currentSelect=null;menu.open(provider,[...p.methods.map(method=>({label:method.name,action:`login:${p.id}:${method.id}`})),...(p.credential?[{label:'Disconnect',action:`logout:${p.id}`}]:[])],p.name);return;}
  const dataAction=event.target.closest('[data-settings-action]');if(dataAction){try{const result=await api.settingsAction(dataAction.dataset.settingsAction);if(result)showConnectionMessage(dataAction.dataset.settingsAction==='export'?`Exported ${result.count} conversations`:'Cached previews cleared');}catch{showConnectionMessage('Could not complete this action');}return;}
 }
 root.addEventListener('click',handleClick);main.addEventListener('click',handleClick);
 popup.addEventListener('click',async event=>{event.stopPropagation();const target=event.target.closest('[data-menu-action]');if(!target)return;const action=target.dataset.menuAction;menu.close(true);if(action.startsWith('login:')){const [,provider,type]=action.split(':');connectionModal.open(providers.find(p=>p.id===provider)?.name||provider);try{await api.providerLogin({provider,type});connectionModal.close();await refreshProviders();document.dispatchEvent(new Event('suffice-models-refresh'));}catch{if(connectionModal.isOpen)showConnectionMessage('Connection cancelled or unsuccessful. Try again.');}return;}if(action.startsWith('logout:')){try{await api.providerLogout(action.slice(7));await refreshProviders();document.dispatchEvent(new Event('suffice-models-refresh'));}catch{showConnectionMessage('Could not disconnect provider.');}return;}if(currentSelect){const {row,button}=currentSelect;if(await commit(row,row.options[Number(action)]))button.querySelector('span').textContent=display(row,value(row));}});
 function positionIndicator(group,animate){const button=group.querySelector('[aria-pressed=true]'),indicator=group.querySelector('.settings-segment-indicator');if(!button||!indicator)return;const before=indicator.getBoundingClientRect();indicator.style.left=button.offsetLeft+'px';indicator.style.width=button.offsetWidth+'px';if(animate&&!preference('reduced-motion',false)&&!matchMedia('(prefers-reduced-motion:reduce)').matches){const after=indicator.getBoundingClientRect();indicator.getAnimations().forEach(a=>a.cancel());indicator.animate([{transform:`translateX(${before.left-after.left}px) scaleX(${before.width/after.width})`},{transform:`translateX(${(before.left-after.left)*.35}px) scaleX(1.08)`,offset:.5},{transform:'translateX(0) scaleX(1)'}],{duration:220,easing:getComputedStyle(group).getPropertyValue('--ease-out').trim()});}}
 new ResizeObserver(()=>main.querySelectorAll('.settings-segment').forEach(group=>positionIndicator(group,false))).observe(main);
 function showConnectionMessage(message,cancel=false){connectionModal.message(message,cancel);}
 search.addEventListener('input',()=>{render();scroll.scrollTop=0;});
 document.addEventListener('keydown',event=>{
  if(!active||event.defaultPrevented||connectionModal.isOpen)return;
  if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='f'){event.preventDefault();event.stopPropagation();search.focus();search.select();}
  if(event.key==='Escape'&&(popup.hidden||popup.inert)){event.stopPropagation();if(search.value){search.value='';render();search.focus();}else close();}
  if(event.target.closest('nav')&&['ArrowDown','ArrowUp','Home','End'].includes(event.key)){event.preventDefault();const items=[...nav.querySelectorAll('button')],index=items.indexOf(document.activeElement);items[event.key==='Home'?0:event.key==='End'?items.length-1:(index+(event.key==='ArrowDown'?1:-1)+items.length)%items.length]?.focus();}
 });
 const motion=()=>!preference('reduced-motion',false)&&!matchMedia('(prefers-reduced-motion: reduce)').matches;
 const slide=(element,from,to)=>element.animate([{opacity:to===0?0:1,transform:`translateX(${from}px)`},{opacity:to===0?1:0,transform:`translateX(${to}px)`}],{duration:150,easing:'cubic-bezier(.2,.8,.2,1)'}).finished.catch(()=>{});
 function outgoing(element,direction){
  if(!motion()||!element.getBoundingClientRect().height)return;
  const sidebar=document.querySelector('.sidebar'),bounds=element.getBoundingClientRect(),parent=sidebar.getBoundingClientRect(),ghost=document.createElement('div'),clone=element.cloneNode(true);
  ghost.className='settings-swap-ghost';ghost.inert=true;ghost.setAttribute('aria-hidden','true');Object.assign(ghost.style,{left:`${bounds.left-parent.left}px`,top:`${bounds.top-parent.top}px`,width:`${bounds.width}px`,height:`${bounds.height}px`});clone.hidden=false;if(clone.classList.contains('settings-page'))clone.classList.replace('settings-page','settings-page-ghost');for(const node of [clone,...clone.querySelectorAll('[id]')])node.removeAttribute('id');clone.style.margin='0';clone.style.height='100%';ghost.append(clone);sidebar.append(ghost);slide(ghost,0,direction).finally(()=>ghost.remove());
 }
 async function open(){
  if(active)return;active=true;previousFocus=document.activeElement;wasCollapsed=document.body.classList.contains('sidebar-collapsed');void refreshProviders();
  underlay=[...document.querySelectorAll('.new-session,.session-section,.home,.thread-transcript,.thread-header,.workspace-tools,.right-sidebar')].map(element=>({element,inert:element.inert}));for(const {element} of underlay)element.inert=true;
  if(!wasCollapsed)outgoing(document.querySelector('.session-section'),-9);
  document.body.classList.remove('sidebar-collapsed');document.documentElement.classList.add('settings-open');root.hidden=false;main.hidden=false;back.innerHTML=icon('home');back.setAttribute('aria-label','Back to chats');render();nav.querySelector('[aria-current=page]')?.focus({preventScroll:true});
  if(motion()){slide(root,9,0);content.animate([{opacity:0},{opacity:1}],{duration:180,easing:'ease-out'});}
 }
 async function close(){
  if(!active)return;active=false;menu.close();outgoing(root,9);
  connectionModal.close();
  root.hidden=true;main.hidden=true;back.innerHTML=icon('gear');back.setAttribute('aria-label','Settings');document.documentElement.classList.remove('settings-open');if(wasCollapsed)document.body.classList.add('sidebar-collapsed');for(const {element,inert} of underlay)element.inert=inert;previousFocus?.focus({preventScroll:true});if(motion())slide(document.querySelector('.session-section'),-9,0);
 }
 return {open,close,get isOpen(){return active;}};
}
