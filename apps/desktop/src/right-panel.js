import {preference} from './settings-preferences.js';
import {icon} from './ui.js';
import {createCollectionNavigation} from './components/ui/collection-navigation.js';
import {createPanelEditor} from './panel-editor.js';
import {showPopover,hidePopover,keyboardInteraction} from './popover-motion.js';
import {threadViewState as store} from './thread-view-state.js';
import {mountRewind} from './rewind-view.js';
import {mountBoxes} from './boxes-view.js';
import {reviewFor,findingsFor,reviewButton,decorateRows} from './review.js';
import {loadReview} from './review-ui.js';
import {renderFileTree,renderChanges,renderCode,textElement} from './panel-content.js';
import {renderPullRequest} from './pr-review.js';

const options={files:{label:'Files',icon:'files'},changes:{label:'Changes',icon:'changes'},rewind:{label:'Rewind',icon:'rewind'},boxes:{label:'Boxes',icon:'server'},pr:{label:'Pull request',icon:'merge'},terminal:{label:'Terminal',icon:'terminal'}};
export function panelIconButton(label,glyph){const button=document.createElement('button');button.type='button';button.className='button button--ghost';button.setAttribute('aria-label',label);button.title=label;button.innerHTML=icon(glyph);return button;}
const textNode=textElement;
export function connectRightPanel({sidebar,resize,toggle,api}){
 document.addEventListener('suffice-preference',event=>{if(event.detail.id==='wrap-lines'||event.detail.id==='diff-layout'){const patch=event.detail.id==='wrap-lines'?{wrap:event.detail.value}:{diffLayout:event.detail.value.toLowerCase()};store.update({files:{...store.state.files,...(event.detail.id==='wrap-lines'?patch:{})},changes:{...store.state.changes,...patch}});mounted=null;if(store.state.panelOpen)void load();}});
 document.addEventListener('suffice-open-file',event=>{if(!store.id)return;const path=event.detail.path;store.update({panelOpen:true,tabs:store.state.tabs.includes('files')?store.state.tabs:[...store.state.tabs,'files'],activeTab:'files',files:{...store.state.files,file:path,scroll:0}});});
 const header=document.createElement('div');header.className='right-panel-header';
 const tabs=document.createElement('div');tabs.className='right-panel-tabs';tabs.setAttribute('role','tablist');tabs.setAttribute('aria-label','Right panel tabs');
 const add=panelIconButton('Add panel tab','plus');add.setAttribute('aria-expanded','false');add.setAttribute('aria-haspopup','menu');
 const menu=document.createElement('div');menu.className='popover panel-tab-menu';menu.hidden=true;menu.setAttribute('role','menu');menu.setAttribute('aria-label','Panel options');document.body.append(menu);
 const body=document.createElement('section');body.id='right-panel-content';body.className='right-panel-content';
 const svgButton=(label,paths)=>{const button=panelIconButton(label,'plus');button.innerHTML=`<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;return button;};
 const expand=svgButton('Expand panel','<path d="M14 4h6v6M10 20H4v-6M20 4l-7 7M4 20l7-7"/>');expand.setAttribute('aria-pressed','false');
 const collapse=svgButton('Collapse panel','<path d="m13 6 6 6-6 6M5 6l6 6-6 6"/>');
 const actions=document.createElement('div');actions.className='right-panel-actions';actions.append(expand,collapse);
 header.append(tabs,add,actions);sidebar.append(header,body);
 let restoreWidth=null;
 expand.addEventListener('click',()=>{const root=document.documentElement.style;if(restoreWidth===null){restoreWidth=root.getPropertyValue('--right-panel-width');root.setProperty('--right-panel-width',`${Math.max(360,Math.min(960,innerWidth-document.querySelector('.sidebar').getBoundingClientRect().width-376))}px`);}else{if(restoreWidth)root.setProperty('--right-panel-width',restoreWidth);else root.removeProperty('--right-panel-width');restoreWidth=null;}expand.setAttribute('aria-pressed',String(restoreWidth!==null));expand.title=expand.ariaLabel=restoreWidth!==null?'Restore panel width':'Expand panel';});
 collapse.addEventListener('click',()=>{if(store.id)store.update({panelOpen:false});});
 let version=0,scrollTimer,refreshTimer,focusFilter=false,directoryThread=null,tabSignature='',mounted=null,terminalsPromise;
 const directories=new Map();
 let prData=null,prThread=null;const prView={tab:'overview',file:null}; // shortcut: sub-tab is not persisted across restarts
 const drawPr=focus=>renderPullRequest(body,prData,{view:{...prView,focus},onView:({focus:f,...patch})=>{Object.assign(prView,patch);drawPr(f);},onRefresh:()=>void load(),onOpen:url=>void api.openExternal(url).catch(()=>{})});
 const terminalViews=()=>terminalsPromise??=import('./terminal-view.js').then(({createTerminalViews})=>createTerminalViews({api,onLabel:(threadId,id,label)=>{if(store.id===threadId&&store.state.tabs.includes(id)&&store.state.terminals[id]?.label!==label)store.update({terminals:{...store.state.terminals,[id]:{...store.state.terminals[id],label}}});}}));
 const terminalTab=type=>type?.startsWith('terminal:');
 const optionFor=type=>terminalTab(type)?{label:store.state.terminals[type]?.label||'Terminal',icon:'terminal'}:options[type];
 api.onClearCache?.(()=>{directories.clear();mounted=null;if(store.state.panelOpen)void load();});
 document.addEventListener('suffice-preference',event=>{if(['hidden-files','gitignored','file-sort'].includes(event.detail.id)){directories.clear();mounted=null;if(store.state.panelOpen)void load();}});
 document.addEventListener('suffice-rewind-restored',()=>{directories.clear();mounted=null;});
 const refreshPanel=()=>{directories.clear();mounted=null;void load();};
 document.addEventListener('suffice-review-updated',()=>{mounted=null;if(store.state.panelOpen)void load();});
 function closeMenu(){menuNavigation.reset();hidePopover(menu);add.setAttribute('aria-expanded','false');}
 function activate(type){const current=store.state;if(type==='terminal'){const ordinal=Math.max(Number(current.terminalSequence)||0,...Object.values(current.terminals).map(value=>Number(value.ordinal)||0))+1;type='terminal:'+crypto.randomUUID();store.update({terminalSequence:ordinal,terminals:{...current.terminals,[type]:{ordinal,label:ordinal===1?'Terminal':'Terminal '+ordinal}},tabs:[...current.tabs,type],activeTab:type});closeMenu();return;}store.update({tabs:current.tabs.includes(type)?current.tabs:[...current.tabs,type],activeTab:type});closeMenu();}
 function close(type){const current=store.state,remaining=current.tabs.filter(tab=>tab!==type),metadata={...current.terminals};if(terminalTab(type)){const threadId=store.id;delete metadata[type];if(terminalsPromise)void terminalsPromise.then(terminals=>terminals.close(threadId,type));else void api.terminalClose({threadId,id:type}).catch(()=>{});}store.update({...(remaining.length===0&&preference('close-panel',false)?{panelOpen:false}:{}),terminals:metadata,tabs:remaining,activeTab:current.activeTab===type?remaining[Math.max(0,current.tabs.indexOf(type)-1)]??null:current.activeTab});}
 function choices(container){for(const [type,option] of Object.entries(options)){const button=document.createElement('button');button.type='button';button.className='menu-item';if(container.getAttribute('role')==='menu')button.setAttribute('role','menuitem');button.innerHTML=icon(option.icon);button.append(textNode('span','',option.label));button.addEventListener('click',()=>activate(type));container.append(button);}}
 const menuNavigation=createCollectionNavigation(menu);
 const tabNavigation=createCollectionNavigation(tabs,{items:()=>tabs.querySelectorAll('[role=tab]'),orientation:'horizontal',tabStop:true,key:element=>element.dataset.tabValue,preferred:element=>element.getAttribute('aria-selected')==='true',onNavigate:element=>store.update({activeTab:element.dataset.tabValue})});
 choices(menu);
 add.addEventListener('click',()=>{if(add.getAttribute('aria-expanded')==='true'){closeMenu();return;}showPopover(menu);const r=add.getBoundingClientRect();menu.style.left=`${Math.max(8,Math.min(r.left,innerWidth-menu.offsetWidth-8))}px`;menu.style.top=`${r.bottom+6}px`;menu.style.setProperty('--popover-origin','top left');add.setAttribute('aria-expanded','true');if(keyboardInteraction())menu.querySelector('button')?.focus();});
 document.addEventListener('pointerdown',event=>{if(!menu.contains(event.target)&&!add.contains(event.target))closeMenu();});
 menu.addEventListener('keydown',event=>{if(event.key==='Escape'){closeMenu();add.focus();}menuNavigation.keydown(event);});
 tabs.addEventListener('keydown',event=>{if(event.key==='Delete'){event.preventDefault();close(store.state.activeTab);return;}tabNavigation.keydown(event);});
 function drawTabs(){
  const signature=JSON.stringify([store.state.tabs,store.state.activeTab,store.state.terminals]);if(signature===tabSignature)return;tabSignature=signature;
  const refocus=tabs.contains(document.activeElement);add.hidden=store.state.tabs.length===0;tabs.replaceChildren();
  for(const type of store.state.tabs){const option=optionFor(type),active=store.state.activeTab===type,wrap=document.createElement('div');wrap.className='panel-tab';wrap.dataset.active=String(active);
   const tab=document.createElement('button');tab.className='panel-tab-select';tab.dataset.tabValue=type;tab.type='button';tab.setAttribute('role','tab');tab.setAttribute('aria-label',option.label);tab.id='panel-tab-'+type;tab.setAttribute('aria-selected',String(active));tab.setAttribute('aria-controls',body.id);tab.tabIndex=active?0:-1;
   const mark=document.createElement('span');mark.className='panel-tab-icon';mark.innerHTML=icon(option.icon);tab.append(mark,textNode('span','panel-tab-label',option.label));tab.addEventListener('click',()=>store.update({activeTab:type}));
   const dismiss=panelIconButton(`Close ${option.label} tab`,'close');dismiss.classList.add('panel-tab-close');dismiss.tabIndex=active?0:-1;dismiss.addEventListener('click',()=>close(type));wrap.addEventListener('auxclick',event=>{if(event.button===1){event.preventDefault();close(type);}});wrap.append(tab,dismiss);tabs.append(wrap);
  }tabNavigation.sync();if(refocus)tabs.querySelector('[aria-selected="true"]')?.focus({preventScroll:true});
 }
 function message(title,detail='',retry=false){body.replaceChildren();const empty=document.createElement('div');empty.className='panel-empty';empty.append(textNode('p','',title));if(detail)empty.append(textNode('p','panel-empty-detail',detail));if(retry){const button=document.createElement('button');button.type='button';button.className='button button--subtle';button.textContent='Try again';button.addEventListener('click',()=>void load());empty.append(button);}body.append(empty);}
 function patchView(type,patch){store.update({[type]:{...store.state[type],...patch}});}
 async function loadPreview(record,view,request){
  const {editor,type,id,changed}=record,{scroller}=editor,key=JSON.stringify([view.file,view.wrap,view.diffLayout]);
  const valid=()=>request===version&&store.id===id&&mounted===record&&store.state.panelOpen;
  if(record.previewKey===key)return;
  editor.setPreview(view);editor.select(view.file);scroller.setAttribute('aria-busy','false');
  // Comments, Accept/Reject and the Send footer live in the main process; cards repaint from that state.
  const repaint=()=>{if(!valid())return;view.scroll=scroller.scrollTop;record.previewKey=null;void load();};
  const review=type==='changes'?await loadReview({api,threadId:id,file:view.file,preview:scroller.parentElement,change:repaint,refresh:()=>{if(store.id===id){view.scroll=scroller.scrollTop;refreshPanel();}}}):null;if(!valid())return;
  const entry=changed?.entries.find(entry=>entry.path===view.file);
  if(type==='changes')editor.bar.querySelector('.panel-path').textContent=view.file||(changed.git?`${changed.entries.length} changed files`:'No Git repository');
  if(!view.file){record.previewKey=key;if(type==='files')editor.empty();return;}
  if(type==='changes'&&!entry){patchView(type,{file:null,scroll:0});return;}
  try{
   let result=record.cache.get(view.file);
   if(!result){scroller.append(textNode('p','panel-inline-note','Loading…'));scroller.setAttribute('aria-busy','true');result=type==='files'?api.file(view.file):api.diff(view.file);record.cache.set(view.file,result);}
   result=await result;if(!valid())return;record.cache.set(view.file,result);scroller.replaceChildren();
   if(entry)editor.bar.querySelector('.panel-path').dataset.kind=entry.status==='??'||entry.status.includes('A')?'added':entry.status.includes('D')?'deleted':'modified';
   renderCode(scroller,{...result,...(entry?{added:entry.added,removed:entry.removed,binary:entry.binary||result.binary}:{})},type==='changes',{...view,annotations:type==='changes'?(review?review.unplaced(findingsFor(id,view.file)):findingsFor(id,view.file)):[],review});record.previewKey=key;scroller.scrollTop=view.scroll||0;
  }catch(error){record.cache.delete(view.file);if(!valid())return;scroller.replaceChildren();if(type==='changes'&&/no longer has changes|ENOENT|no such file|does not exist|not a file/i.test(error.message))patchView(type,{file:null,scroll:0});else scroller.append(textNode('p','panel-inline-note',error.message));}
  finally{if(valid())scroller.setAttribute('aria-busy','false');}
 }
 async function load(){
  clearTimeout(scrollTimer);
  const request=++version,state=store.state,type=state.activeTab,id=store.id;
  if(!id||!state.panelOpen)return;drawTabs();body.dataset.terminal=String(terminalTab(type));
  if(!type){body.removeAttribute('role');body.removeAttribute('aria-labelledby');body.removeAttribute('aria-busy');body.replaceChildren();const launcher=document.createElement('div');launcher.className='panel-launcher';choices(launcher);body.append(launcher);return;}
  body.setAttribute('role','tabpanel');body.setAttribute('aria-labelledby','panel-tab-'+type);body.setAttribute('aria-busy','true');
  if(terminalTab(type)){try{const terminals=await terminalViews();if(request!==version||id!==store.id||!store.state.panelOpen)return;await terminals.mount(body,id,type,state.terminals[type]?.ordinal);}catch(error){if(request===version&&id===store.id)message('Could not open terminal',error.message,true);}finally{if(request===version)body.setAttribute('aria-busy','false');}return;}
  if(type==='rewind'){mounted=null;await mountRewind(body,{api,id,valid:()=>request===version&&id===store.id&&store.state.panelOpen});if(request===version)body.setAttribute('aria-busy','false');return;}
  if(type==='boxes'){mounted=null;await mountBoxes(body,{api,valid:()=>request===version&&id===store.id&&store.state.panelOpen});if(request===version)body.setAttribute('aria-busy','false');return;}
  if(type==='pr'){
   mounted=null;if(prThread!==id){prThread=id;prData=null;Object.assign(prView,{tab:'overview',file:null});}
   const keep=body.querySelector('.pq-view')?.scrollTop,focused=body.contains(document.activeElement)&&document.activeElement.matches('.pq-tab');
   if(prData){drawPr(focused);if(keep)body.querySelector('.pq-view').scrollTop=keep;}else message('Loading…');
   try{const data=await api.prReview();if(request!==version||id!==store.id||!store.state.panelOpen)return;const now=body.querySelector('.pq-view')?.scrollTop??keep,nowFocus=focused||(body.contains(document.activeElement)&&document.activeElement.matches('.pq-tab'));prData=data;drawPr(nowFocus);if(now)body.querySelector('.pq-view').scrollTop=now;}catch(error){if(request===version&&id===store.id)message('Couldn’t load the pull request',error.message,true);}finally{if(request===version)body.setAttribute('aria-busy','false');}
   return;
  }
  const focusedPath=body.contains(document.activeElement)?document.activeElement.dataset.path:null;
  const view=state[type],layoutKey=JSON.stringify([id,type,view.directory,view.filterOpen,view.explorerOpen,view.expanded]);
  if(mounted?.layoutKey===layoutKey&&mounted.editor.shell.isConnected){await loadPreview(mounted,view,request);if(request===version)body.setAttribute('aria-busy','false');return;}
  if(!body.querySelector('.panel-scroll')||mounted&&[mounted.id,mounted.type].join(':')!==[id,type].join(':'))message('Loading…');
  const valid=()=>request===version&&id===store.id&&store.state.panelOpen;
  try{
   if(directoryThread!==id){directories.clear();directoryThread=id;}
   const expanded=view.expanded??[];
   const [root,changed]=await Promise.all([directories.has('')?directories.get(''):api.files(''),type==='changes'?api.changes():null]);
   if(!valid())return;directories.set('',root);
   if(type==='files')await Promise.all(expanded.filter(path=>!directories.has(path)).map(async path=>{try{const value=await api.files(path);if(valid())directories.set(path,value);}catch{}}));
   if(!valid())return;
   const openFile=path=>patchView(type,{file:path,scroll:0,recent:[path,...(store.state[type].recent||[]).filter(value=>value!==path)].slice(0,8)});
   const editor=createPanelEditor({body,type,view,project:root.project,onPatch:patch=>patchView(type,patch),onTab:activate,onRefresh:refreshPanel,onOpen:openFile,review:type==='changes'?reviewButton(id,api):null});
   const {scroller,list}=editor;mounted={id,type,editor,changed,layoutKey,cache:new Map(),previewKey:null};
   if(type==='files'){
    editor.filter(renderFileTree(list,{directories,expanded,onFolder:path=>patchView(type,{expanded:expanded.includes(path)?expanded.filter(value=>value!==path):[...expanded,path]}),onFile:openFile}));if(!root.entries.length)list.append(textNode('p','panel-inline-note','Empty folder'));
   }else editor.filter(renderChanges(list,{entries:changed.entries,collapsed:view.collapsed??[],onGroup:folder=>{const collapsed=store.state.changes.collapsed??[];patchView(type,{collapsed:collapsed.includes(folder)?collapsed.filter(value=>value!==folder):[...collapsed,folder]});},onFile:openFile}));
   if(type==='changes')decorateRows(list,id);
   editor.select(view.file);
   scroller.addEventListener('scroll',()=>{clearTimeout(scrollTimer);scrollTimer=setTimeout(()=>{if(mounted?.editor===editor&&store.id===id)patchView(type,{scroll:scroller.scrollTop});},120);},{passive:true});
   list.scrollTop=view.treeScroll||0;list.addEventListener('scroll',()=>{if(mounted?.editor===editor&&store.id===id)patchView(type,{treeScroll:list.scrollTop});},{passive:true});
   if(editor.input&&(focusFilter||!focusedPath)){focusFilter=false;queueMicrotask(()=>editor.input.focus({preventScroll:true}));}
   if(focusedPath)list.querySelector(`[data-path="${CSS.escape(focusedPath)}"]`)?.focus({preventScroll:true});
   await loadPreview(mounted,view,request);
  }catch(error){if(valid())message('Couldn’t load '+options[type].label.toLowerCase(),error.message,true);}
  finally{if(valid())body.setAttribute('aria-busy','false');}
 }
 function sync(event){
  const visible=!!store.id&&store.state.panelOpen;toggle.style.display=store.id?'':'none';if(event?.changed?.includes('terminals'))drawTabs();
  document.body.classList.toggle('right-panel-open',visible);sidebar.inert=!visible;sidebar.setAttribute('aria-hidden',String(!visible));toggle.setAttribute('aria-expanded',String(visible));
  if(event?.type==='select'||event?.type==='adopt'){
   const width=store.state.panelWidth;if(Number.isFinite(width))document.documentElement.style.setProperty('--right-panel-width',`${Math.max(260,Math.min(960,innerWidth-document.querySelector('.sidebar').getBoundingClientRect().width-376,Math.max(360,width)))}px`);else document.documentElement.style.removeProperty('--right-panel-width');
   resize.setAttribute('aria-valuenow',String(Math.round(sidebar.getBoundingClientRect().width)));closeMenu();
  }
  if(!store.id)closeMenu();if(!event||event.type!=='update'||event.changedView||event.changed.some(key=>['panelOpen','tabs','activeTab'].includes(key)))void load();
 }
 let previous=store.state;
 store.subscribe(event=>{const changedView=['files','changes'].some(type=>event.changed?.includes(type)&&(event.state[type].file!==previous[type].file||event.state[type].directory!==previous[type].directory||event.state[type].filterOpen!==previous[type].filterOpen||event.state[type].explorerOpen!==previous[type].explorerOpen||JSON.stringify(event.state[type].expanded)!==JSON.stringify(previous[type].expanded)||event.state[type].wrap!==previous[type].wrap||event.state[type].diffLayout!==previous[type].diffLayout));previous=event.state;event.changedView=changedView;sync(event);});
 toggle.addEventListener('click',()=>{if(store.id)store.update({panelOpen:!store.state.panelOpen});});
 const saveWidth=()=>{if(store.id)store.update({panelWidth:Math.round(sidebar.getBoundingClientRect().width)});};resize.addEventListener('lostpointercapture',saveWidth);resize.addEventListener('keydown',saveWidth);resize.addEventListener('dblclick',saveWidth);
 api.onEvent(event=>{if(event.event==='tool_end'&&store.state.panelOpen&&store.state.activeTab!=='rewind'&&store.state.activeTab!=='boxes'){clearTimeout(refreshTimer);refreshTimer=setTimeout(refreshPanel,300);}});document.addEventListener('suffice:thread-updated',refreshPanel);
 document.addEventListener('keydown',event=>{if(!store.id||!store.state.panelOpen||!store.state.activeTab||terminalTab(store.state.activeTab)||!(event.ctrlKey||event.metaKey))return;const type=store.state.activeTab;if(event.key.toLowerCase()==='p'){event.preventDefault();focusFilter=true;patchView(type,{explorerOpen:true,filterOpen:true});body.querySelector('.panel-filter')?.focus();}if(event.key==='\\'){event.preventDefault();patchView(type,{explorerOpen:store.state[type].explorerOpen===false});}});
 sync();
}
