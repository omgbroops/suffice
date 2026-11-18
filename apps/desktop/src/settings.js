import {openAccentPicker} from './accent-color-picker.js';
import {connectOverlayScrollbar} from './overlay-scrollbar.js';
import {fadeGlassContent} from './glass-content-motion.js';
import {mountWallpaperSettings} from './wallpaper-settings.js';
import {mountResourceSettings} from './resource-settings.js';
import {mountUsageSettings} from './usage-settings.js';
import {mountAutomationSettings} from './automations-settings.js';
import {mountEnvironmentSettings} from './environment-settings.js';
import {setProjectGroupExpanded} from './project-group-motion.js';
import {createProviderConnectModal} from './provider-connect-modal.js';
import {icon} from './ui.js';
import {settingsSections} from './settings-data.js';
import {createMenu} from './menu.js';
import {connectScrollEdges} from './components/ui/scroll-edges.js';
import './settings.css';
import {preference,savePreference,supportedSettings,previewBackgroundDimming,previewSurfaceOpacity} from './settings-preferences.js';
import {backgroundPresets} from './backgrounds/presets.js';
import {providerIcon} from './provider-icons.js';
import {threadViewState} from './thread-view-state.js';
import {getThreadDirectory} from './thread-directory.js';
import {themeGalleryHtml,effectiveMode} from './theme-gallery.js';

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
 connectScrollEdges(scroll);connectScrollEdges(nav);connectOverlayScrollbar(nav);
 let closeAccent=()=>{};
 const positions=new Map();let selected='general',active=false,previousFocus,underlay=[],currentSelect,wasCollapsed=false,providers=[];
 const value=row=>row.id==='background'?(localStorage.getItem('suffice-background')||'horizon'):preference(row.id,row.id==='mode'?(localStorage.getItem('suffice-theme')==='light'?'Light':'Dark'):row.value);
 const api=window.sufficeDesktop,connectionModal=createProviderConnectModal(api);let modelQuery='',modelWrites=Promise.resolve(),catalogStatus='';const collapsedModels=new Set();
 const providerSection=settingsSections.find(section=>section.id==='providers'),modelsSection=settingsSections.find(section=>section.id==='models'),modelDefaults=modelsSection.groups[0];
 const backgroundRow=settingsSections.find(section=>section.id==='appearance').groups.flatMap(group=>group.rows).find(row=>row.id==='background');backgroundRow.options=Object.keys(backgroundPresets);
 let wallpaperControls;function syncWallpaper(){wallpaperControls?.destroy();wallpaperControls=null;const anchor=content.querySelector('[data-select=background]')?.closest('.settings-option');if(anchor&&localStorage.getItem('suffice-background')==='custom')wallpaperControls=mountWallpaperSettings(anchor,{onError:showConnectionMessage});}
 document.addEventListener('suffice-preference',event=>{if(event.detail.id==='background')syncWallpaper();});
 const display=(row,current)=>row.id==='background'?backgroundPresets[current]?.label||current:row.id==='default-model'?row.labels?.[current]||current:current;
 async function commit(row,next){try{if(row.id==='worktree-location'&&next==='Custom location'&&!await api.settingsAction('worktree-location'))return false;await savePreference(row.id,next);}catch(error){showConnectionMessage(error.message||'Could not save this setting.');return false;}return true;}
 async function refreshProviders(){try{
  providers=await api.providers();
  const row=p=>({id:p.id,label:p.name||p.id,logo:providerIcon(p.id),type:'provider'});
  providerSection.groups=[{title:'Connected',rows:providers.filter(p=>p.connected).map(row),empty:'No providers connected'},{title:'Available',rows:providers.filter(p=>!p.connected).map(row),empty:'All providers connected'}];
  const models=await api.models(),modelRow=modelDefaults.rows.find(row=>row.id==='default-model');modelRow.options=['Last used',...models.map(model=>model.provider+'|'+model.id)];modelRow.labels=Object.fromEntries(models.map(model=>[model.provider+'|'+model.id,model.name]));
  const groups=providers.filter(p=>p.connected).map(p=>({id:p.id,title:p.name||p.id,logo:row(p).logo,models:true,empty:'No models available',rows:models.filter(model=>model.provider===p.id).map(model=>({id:model.provider+'|'+model.id,label:model.name,type:'model'}))}));
  modelsSection.groups=[...(groups.length?groups:[{title:'Models',rows:[],empty:'Connect a provider to choose models'}]),modelDefaults];
  if(active&&['models','providers'].includes(selected))render();
 }catch{if(active)showConnectionMessage('Could not load providers and models. Try reopening settings.');}}

 function control(row){
  const current=value(row),label=escape(row.label);
  if(['toggle','select','segment','themes','gallery','palette','action'].includes(row.type)&&!supportedSettings.has(row.id))return '<span class="settings-unavailable">Not available yet</span>';
  switch(row.type){
   case 'range':return `<label class="settings-dim-slider"><input type="range" min="${row.min??0}" max="${row.max??80}" step="1" value="${Number(current)}" style="--dim-progress:${(Number(current)-(row.min??0))/((row.max??80)-(row.min??0))*100}%" data-range="${row.id}" aria-label="${label}"><output>${Number(current)}%</output></label>`;
   case 'archived-thread':return `<div class="archived-thread-actions"><button type="button" class="provider-dialog-button" data-restore-thread="${escape(row.threadId)}" aria-label="Restore ${label}">Restore</button><button type="button" class="button" data-delete-thread="${escape(row.threadId)}" aria-label="Delete ${label}">${icon('trash')}</button></div>`;
   case 'model':return `<button type="button" class="settings-switch" role="switch" aria-label="${label}" aria-checked="${!preference('disabled-models',[]).includes(row.id)}" data-model="${escape(row.id)}"><span></span></button>`;
   case 'toggle':return `<button type="button" class="settings-switch" role="switch" aria-label="${label}" aria-checked="${!!current}" data-value="${row.id}"><span></span></button>`;
   case 'select':return `<button type="button" class="settings-select" aria-label="${label}" aria-haspopup="menu" aria-expanded="false" data-select="${row.id}"><span>${escape(display(row,current))}</span>${icon('chevron')}</button>`;
   case 'segment':return `<div class="settings-segment" role="group" aria-label="${label}"><span class="settings-segment-indicator"></span>${row.options.map(option=>`<button type="button" aria-pressed="${option===current}" data-segment="${row.id}" data-option="${escape(option)}">${escape(option)}</button>`).join('')}</div>`;
   case 'themes':return `<div class="settings-themes" role="group" aria-label="${label}">${row.options.map(option=>`<button type="button" class="settings-theme" data-theme-tile="${option.toLowerCase()}" aria-pressed="${option===current}" data-segment="${row.id}" data-option="${escape(option)}"><span class="settings-theme-preview" aria-hidden="true"><i></i><i></i><i></i></span><span class="settings-theme-name">${escape(option)}</span></button>`).join('')}</div>`;
   case 'palette':return `<div class="settings-palette" role="group" aria-label="${label}">${accents.map(color=>`<button type="button" aria-label="${color}" aria-pressed="${color===current}" style="--swatch:${color}" data-segment="${row.id}" data-option="${color}"></button>`).join('')}<button type="button" class="custom-accent" aria-label="Custom accent color" title="Custom accent color" aria-haspopup="dialog" aria-expanded="false" aria-pressed="${!accents.includes(current)}" style="${!accents.includes(current)?'--custom-accent:'+escape(current):''}" data-custom-accent>${icon('plus')}</button></div>`;
   case 'keys':if(row.label==='Send message')return `<span class="settings-keys">${preference('send','Enter').split(' + ').map(key=>`<kbd>${escape(key)}</kbd>`).join('')}</span>`;if(row.label==='Send in background'&&preference('send','Enter')!=='Enter')return '<span class="settings-readonly">Send menu</span>';return `<span class="settings-keys">${String(current).split(' ').map(key=>`<kbd>${escape(key)}</kbd>`).join('')}</span>`;
   case 'avatar':return `<div class="settings-avatar-row"><span class="settings-avatar">${localStorage.getItem('suffice-avatar')?`<img alt="" src="${localStorage.getItem('suffice-avatar')}">`:'S'}</span><button type="button" class="settings-select settings-configure" data-avatar-pick>Change</button><input type="file" accept="image/*" hidden data-avatar-file></div>`;
   case 'provider':return `<button type="button" class="settings-select settings-configure provider-connect-button" data-provider="${row.id}" aria-label="Configure ${label}">${providers.find(p=>p.id===row.id)?.connected?'Connected':'Connect'}${icon('chevron')}</button>`;
   case 'action':return `<button type="button" class="settings-select settings-configure" data-settings-action="${row.id}">${escape(current)}</button>`;
   default:return `<span class="settings-readonly">${escape(current)}</span>`;
  }
 }
 function render(animate=false){
  closeAccent();menu.close();const query=search.value.trim().toLowerCase();
  settingsSections.find(section=>section.id==='archived').groups=[{title:'Archived threads',empty:'No archived threads',rows:getThreadDirectory().threads.filter(thread=>threadViewState.read(thread.id).sidebar?.archived).map(thread=>({type:'archived-thread',threadId:thread.id,label:threadViewState.read(thread.id).sidebar?.title||thread.title,detail:thread.project||'No project'}))}];
  const matches=(section,row)=>`${section.title} ${row.label} ${row.detail||''}`.toLowerCase().includes(query);
  let category='';nav.innerHTML=settingsSections.filter(section=>!query||section.title.toLowerCase().includes(query)||section.groups.some(group=>group.rows.some(row=>matches(section,row)))).map(section=>{
   const heading=category!==section.category?`<div class="settings-nav-label">${section.category}</div>`:'';category=section.category;
   return `${heading}<button type="button" class="settings-nav-item" data-section="${section.id}" aria-current="${!query&&section.id===selected?'page':'false'}">${icon(section.icon)}${section.title}</button>`;
  }).join('');
  const sections=query?settingsSections:[settingsSections.find(section=>section.id===selected)];
  content.innerHTML=sections.map(section=>{
   const groups=section.groups.map(group=>({...group,rows:group.rows.filter(row=>(!row.whenGlass||preference('glass',true))&&(!query||matches(section,row)))})).filter(group=>group.rows.length||(group.empty&&(!query||section.title.toLowerCase().includes(query))));
   if(!groups.length)return '';
   return `<section class="settings-section" aria-labelledby="settings-title-${section.id}"><div class="settings-title-row"><h1 id="settings-title-${section.id}">${section.title}</h1>${['models','providers'].includes(section.id)?`<button type="button" class="settings-catalog-refresh" data-refresh-models aria-label="Refresh models" title="Refresh models">${icon('refresh')}</button>`:''}</div>${section.subtitle?`<p class="settings-subtitle">${escape(section.subtitle)}</p>`:''}${['models','providers'].includes(section.id)?`<p class="settings-catalog-status" role="status">${escape(catalogStatus)}</p>`:''}${section.id==='models'?`<label class="settings-model-search">${icon('search')}<input type="search" aria-label="Search models in settings" placeholder="Search models" value="${escape(modelQuery)}"></label>`:''}${groups.map(group=>`<section class="settings-group${group.models?' settings-model-group':''}" aria-label="${escape(group.title)}"><h2>${group.models?`<button type="button" class="settings-provider-pill" data-model-group="${escape(group.id)}" aria-expanded="${!collapsedModels.has(group.id)}" aria-controls="models-group-${escape(group.id)}">`:''}${group.logo?`<img class="settings-provider-icon" src="./providers/${group.logo}.svg" alt="">`:''}${escape(group.title)}${group.models?`${icon('chevron','model-group-chevron')}</button>`:''}</h2><div ${group.models?`id="models-group-${escape(group.id)}" class="settings-model-group-body" ${collapsedModels.has(group.id)?'hidden inert':''}`:'class="settings-group-body"'}><div class="settings-card">${!group.rows.length?`<p class="settings-group-empty">${escape(group.empty)}</p>`:''}${group.rows.map(row=>row.type==='gallery'?themeGalleryHtml(preference('palette','default'),effectiveMode()):`<div class="settings-option${row.type==='themes'?' settings-option--stack':''}"><div class="settings-option-copy">${row.logo?`<img class="settings-provider-icon" src="./providers/${row.logo}.svg" alt="">`:row.type==='provider'?`<span class="settings-provider-placeholder" aria-hidden="true">${escape(row.label.charAt(0))}</span>`:''}<div><span class="settings-option-label">${escape(row.label)}</span>${row.detail?`<p>${escape(row.detail)}</p>`:''}</div></div>${control(row)}</div>`).join('')}</div></div></section>`).join('')}</section>`;
  }).join('')||'<div class="settings-empty">No settings found</div>';
  syncWallpaper();for(const section of sections){mountResourceSettings(content,section.id,api);mountUsageSettings(content,section.id,api);mountAutomationSettings(content,section.id,api);mountEnvironmentSettings(content,section.id,api);}filterModels();for(const group of main.querySelectorAll('.settings-segment'))positionIndicator(group,false);
 }
 function filterModels(){const query=modelQuery.toLowerCase().trim();for(const group of content.querySelectorAll('.settings-model-group')){let count=0;for(const row of group.querySelectorAll('.settings-option')){row.hidden=!row.textContent.toLowerCase().includes(query)&&!row.querySelector('[data-model]').dataset.model.toLowerCase().includes(query);if(!row.hidden)count++;}group.hidden=!!query&&!count;const toggle=group.querySelector('[data-model-group]'),body=group.querySelector('.settings-model-group-body');if(query&&count){body.hidden=false;body.inert=false;toggle.setAttribute('aria-expanded','true');}else if(toggle){const collapsed=collapsedModels.has(toggle.dataset.modelGroup);body.hidden=collapsed;body.inert=collapsed;toggle.setAttribute('aria-expanded',String(!collapsed));}}}
 main.addEventListener('change',async event=>{const file=event.target.matches('[data-avatar-file]')&&event.target.files[0];if(!file)return;try{const bitmap=await createImageBitmap(file),size=128,c=document.createElement('canvas');c.width=c.height=size;const k=Math.max(size/bitmap.width,size/bitmap.height);c.getContext('2d').drawImage(bitmap,(size-bitmap.width*k)/2,(size-bitmap.height*k)/2,bitmap.width*k,bitmap.height*k);localStorage.setItem('suffice-avatar',c.toDataURL('image/jpeg',.85));document.dispatchEvent(new CustomEvent('suffice-avatar'));render();}catch{showConnectionMessage('Could not read that image');}});
 main.addEventListener('input',event=>{if(event.target.matches('.settings-model-search input')){modelQuery=event.target.value;filterModels();}});
 main.addEventListener('click',event=>{const restore=event.target.closest('[data-restore-thread]');if(!restore)return;const id=restore.dataset.restoreThread;threadViewState.updateFor(id,{sidebar:{...threadViewState.read(id).sidebar,archived:false}});render();});
 main.addEventListener('click',event=>{const button=event.target.closest('[data-delete-thread]');if(button)document.dispatchEvent(new CustomEvent('suffice-delete-thread',{detail:{id:button.dataset.deleteThread}}));});
 document.addEventListener('suffice-thread-deleted',()=>{if(active&&selected==='archived')render();});
 threadViewState.subscribe(event=>{if(active&&selected==='archived'&&event.changed?.includes('sidebar'))render();});
 main.addEventListener('input',event=>{const input=event.target;if(!input.matches('[data-range]'))return;(input.dataset.range==='surface-opacity'?previewSurfaceOpacity:previewBackgroundDimming)(input.value);input.style.setProperty('--dim-progress',(Number(input.value)-Number(input.min))/(Number(input.max)-Number(input.min))*100+'%');input.nextElementSibling.value=input.value+'%';});
 main.addEventListener('change',event=>{if(event.target.matches('[data-range]'))void commit({id:event.target.dataset.range},Number(event.target.value));});
 const findRow=id=>settingsSections.flatMap(section=>section.groups.flatMap(group=>group.rows)).find(row=>row.id===id);
 async function handleClick(event){
  const custom=event.target.closest('[data-custom-accent]');if(custom){closeAccent();closeAccent=openAccentPicker(custom,{value:preference('accent',accents[0]),onSave:async color=>{const saved=await commit({id:'accent'},color);if(saved){for(const sibling of custom.parentElement.querySelectorAll('button'))sibling.setAttribute('aria-pressed',String(sibling===custom));custom.style.setProperty('--custom-accent',color);}return saved;}});return;}
  const refreshButton=event.target.closest('[data-refresh-models]');if(refreshButton){refreshButton.disabled=true;refreshButton.setAttribute('aria-busy','true');catalogStatus='Refreshing…';try{const result=await api.refreshModels();catalogStatus=result.offline?'Offline · using saved models':result.aborted?'Refresh timed out · using saved models':result.failedProviders?.length?'Some providers could not refresh':'';await refreshProviders();render();}catch{catalogStatus='Could not refresh · using saved models';render();}finally{refreshButton.disabled=false;}return;}
  const pick=event.target.closest('[data-avatar-pick]');if(pick){pick.parentElement.querySelector('[data-avatar-file]').click();return;}
  if(event.target.closest('.settings-back')){close();return;}
  const section=event.target.closest('[data-section]');if(section){positions.set(selected,scroll.scrollTop);selected=section.dataset.section;search.value='';render(true);scroll.scrollTop=positions.get(selected)||0;return;}
  const groupToggle=event.target.closest('[data-model-group]');if(groupToggle){const id=groupToggle.dataset.modelGroup,expanded=groupToggle.getAttribute('aria-expanded')!=='true';expanded?collapsedModels.delete(id):collapsedModels.add(id);groupToggle.setAttribute('aria-expanded',String(expanded));setProjectGroupExpanded(document.getElementById(groupToggle.getAttribute('aria-controls')),expanded);return;}
  const model=event.target.closest('[data-model]');if(model){model.disabled=true;const key=model.dataset.model;modelWrites=modelWrites.catch(()=>{}).then(async()=>{const disabled=new Set(preference('disabled-models',[]));disabled.has(key)?disabled.delete(key):disabled.add(key);try{await savePreference('disabled-models',[...disabled]);model.setAttribute('aria-checked',String(!disabled.has(key)));}catch(error){showConnectionMessage(error.message);}finally{model.disabled=false;}});return;}
  const toggle=event.target.closest('[data-value]');if(toggle){const row=findRow(toggle.dataset.value),next=!value(row);if(await commit(row,next)){toggle.setAttribute('aria-checked',String(next));if(row.id==='glass'){render();content.querySelector('[data-value=glass]')?.focus({preventScroll:true});}}return;}
  const card=event.target.closest('[data-theme-card]');if(card){if(await commit({id:'palette'},card.dataset.themeCard)){render();content.querySelector(`[data-theme-card="${card.dataset.themeCard}"]`)?.focus({preventScroll:true});}return;}
  const segment=event.target.closest('[data-segment]');if(segment){if(await commit(findRow(segment.dataset.segment),segment.dataset.option)){for(const sibling of segment.parentElement.querySelectorAll('button'))sibling.setAttribute('aria-pressed',String(sibling===segment));positionIndicator(segment.parentElement,true);}return;}
  const select=event.target.closest('[data-select]');if(select){const row=findRow(select.dataset.select);currentSelect={row,button:select};menu.open(select,row.options.map((option,index)=>({label:display(row,option),selected:option===value(row),action:String(index)})),row.label);return;}
  const provider=event.target.closest('[data-provider]');if(provider){const p=providers.find(p=>p.id===provider.dataset.provider);currentSelect=null;menu.open(provider,[...p.methods.map(method=>({label:method.name,action:`login:${p.id}:${method.id}`})),...(p.credential?[{label:'Disconnect',action:`logout:${p.id}`}]:[])],p.name);return;}
  const dataAction=event.target.closest('[data-settings-action]');if(dataAction){try{const result=await api.settingsAction(dataAction.dataset.settingsAction);if(result)showConnectionMessage(dataAction.dataset.settingsAction==='export'?`Exported ${result.count} conversations`:'Cached previews cleared');}catch{showConnectionMessage('Could not complete this action');}return;}
 }
 root.addEventListener('click',handleClick);main.addEventListener('click',handleClick);
 popup.addEventListener('click',async event=>{event.stopPropagation();const target=event.target.closest('[data-menu-action]');if(!target)return;const action=target.dataset.menuAction;menu.close(true);if(action.startsWith('login:')){const [,provider,type]=action.split(':');connectionModal.open(providers.find(p=>p.id===provider)?.name||provider);try{await api.providerLogin({provider,type});connectionModal.close();await refreshProviders();document.dispatchEvent(new Event('suffice-models-refresh'));}catch(error){if(connectionModal.isOpen)showConnectionMessage(error.message?.replace(/^Error invoking remote method '[^']+': (?:Error: )?/,'').replace(/^Error: /,'')||'Could not connect to the provider. Please try again.');}return;}if(action.startsWith('logout:')){try{await api.providerLogout(action.slice(7));await refreshProviders();document.dispatchEvent(new Event('suffice-models-refresh'));}catch{showConnectionMessage('Could not disconnect provider.');}return;}if(currentSelect){const {row,button}=currentSelect;if(await commit(row,row.options[Number(action)]))button.querySelector('span').textContent=display(row,value(row));}});
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
 api.onEvent?.(event=>{if(event.event!=='models_changed')return;const result=event.catalog;catalogStatus=result?.failedProviders?.length?'Some providers could not refresh':result?.aborted?'Refresh timed out · using saved models':'';if(active&&['models','providers'].includes(selected))void refreshProviders();});
 const motion=()=>!preference('reduced-motion',false)&&!matchMedia('(prefers-reduced-motion: reduce)').matches;
 const slide=(element,from,to)=>element.animate([{opacity:to===0?0:1,transform:`translateX(${from}px)`},{opacity:to===0?1:0,transform:`translateX(${to}px)`}],{duration:150,easing:'cubic-bezier(.2,.8,.2,1)'}).finished.catch(()=>{});
 function outgoing(element,direction){
  if(!motion()||!element.getBoundingClientRect().height)return;
  const sidebar=document.querySelector('.sidebar'),bounds=element.getBoundingClientRect(),parent=sidebar.getBoundingClientRect(),ghost=document.createElement('div'),clone=element.cloneNode(true);
  ghost.className='settings-swap-ghost';ghost.inert=true;ghost.setAttribute('aria-hidden','true');Object.assign(ghost.style,{left:`${bounds.left-parent.left}px`,top:`${bounds.top-parent.top}px`,width:`${bounds.width}px`,height:`${bounds.height}px`});clone.hidden=false;if(clone.classList.contains('settings-page'))clone.classList.replace('settings-page','settings-page-ghost');for(const node of [clone,...clone.querySelectorAll('[id]')])node.removeAttribute('id');clone.style.margin='0';clone.style.height='100%';ghost.append(clone);sidebar.append(ghost);slide(ghost,0,direction).finally(()=>ghost.remove());
 }
 async function open(section){
  selected=settingsSections.some(item=>item.id===section)?section:'general';search.value='';if(active){render();return;}active=true;previousFocus=document.activeElement;wasCollapsed=document.body.classList.contains('sidebar-collapsed');void refreshProviders();
  underlay=[...document.querySelectorAll('.new-session,.session-section,.home,.thread-transcript,.thread-header,.workspace-tools,.right-sidebar')].map(element=>({element,inert:element.inert}));for(const {element} of underlay)element.inert=true;
  if(!wasCollapsed)outgoing(document.querySelector('.session-section'),-9);
  document.body.classList.remove('sidebar-collapsed');document.documentElement.classList.add('settings-open');root.hidden=false;main.hidden=false;back.innerHTML=icon('home');back.setAttribute('aria-label','Back to chats');render();nav.querySelector('[aria-current=page]')?.focus({preventScroll:true});
  if(motion()){slide(root,9,0);fadeGlassContent(content);}
 }
 async function close(){
  if(!active)return;active=false;closeAccent();menu.close();outgoing(root,9);
  connectionModal.close();
  root.hidden=true;main.hidden=true;back.innerHTML=icon('gear');back.setAttribute('aria-label','Settings');document.documentElement.classList.remove('settings-open');document.body.classList.toggle('sidebar-collapsed',preference('sidebar-collapsed',wasCollapsed));for(const {element,inert} of underlay)element.inert=inert;previousFocus?.focus({preventScroll:true});if(motion())slide(document.querySelector('.session-section'),-9,0);
 }
 return {open,close,get isOpen(){return active;}};
}
