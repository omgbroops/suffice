import {icon} from './ui.js';
import {createPanelEditor} from './panel-editor.js';
import {showPopover,hidePopover,keyboardInteraction} from './popover-motion.js';
import {threadViewState as store} from './thread-view-state.js';
import {cloudTabs,isCloudTab,renderCloudTab} from './cloud-ui.js';
import {renderFileTree,renderChanges,renderCode,textElement} from './panel-content.js';

const options={files:{label:'Files',icon:'files'},changes:{label:'Changes',icon:'changes'},...cloudTabs};
export function panelIconButton(label,glyph){const button=document.createElement('button');button.type='button';button.className='button button--ghost';button.setAttribute('aria-label',label);button.title=label;button.innerHTML=icon(glyph);return button;}
const textNode=textElement;
export function connectRightPanel({sidebar,resize,toggle,api}){
 const header=document.createElement('div');header.className='right-panel-header';
 const tabs=document.createElement('div');tabs.className='right-panel-tabs';tabs.setAttribute('role','tablist');tabs.setAttribute('aria-label','Right panel tabs');
 const add=panelIconButton('Add panel tab','plus');add.setAttribute('aria-expanded','false');add.setAttribute('aria-haspopup','menu');
 const menu=document.createElement('div');menu.className='popover panel-tab-menu';menu.hidden=true;menu.setAttribute('role','menu');menu.setAttribute('aria-label','Panel options');document.body.append(menu);
 const body=document.createElement('section');body.id='right-panel-content';body.className='right-panel-content';
 header.append(tabs,add);sidebar.append(header,body);
 let version=0,scrollTimer,refreshTimer,focusFilter=false,directoryThread=null,tabSignature='',renderedViewKey='';
 const directories=new Map();
 const refreshPanel=()=>{directories.clear();void load();};
 function closeMenu(){hidePopover(menu);add.setAttribute('aria-expanded','false');}
 function activate(type){const current=store.state;store.update({tabs:current.tabs.includes(type)?current.tabs:[...current.tabs,type],activeTab:type});closeMenu();}
 function close(type){const current=store.state,remaining=current.tabs.filter(tab=>tab!==type);store.update({tabs:remaining,activeTab:current.activeTab===type?remaining[Math.max(0,current.tabs.indexOf(type)-1)]??null:current.activeTab});}
 function choices(container){for(const [type,option] of Object.entries(options)){if(isCloudTab(type)&&!store.state.cloud)continue;const button=document.createElement('button');button.type='button';button.className='menu-item';if(container.getAttribute('role')==='menu')button.setAttribute('role','menuitem');button.innerHTML=icon(option.icon);button.append(textNode('span','',option.label));button.addEventListener('click',()=>activate(type));container.append(button);}}
 choices(menu);
 add.addEventListener('click',()=>{if(add.getAttribute('aria-expanded')==='true'){closeMenu();return;}menu.replaceChildren();choices(menu);showPopover(menu);const r=add.getBoundingClientRect();menu.style.left=`${Math.max(8,Math.min(r.left,innerWidth-menu.offsetWidth-8))}px`;menu.style.top=`${r.bottom+6}px`;menu.style.setProperty('--popover-origin','top left');add.setAttribute('aria-expanded','true');if(keyboardInteraction())menu.querySelector('button')?.focus();});
 document.addEventListener('pointerdown',event=>{if(!menu.contains(event.target)&&!add.contains(event.target))closeMenu();});
 menu.addEventListener('keydown',event=>{if(event.key==='Escape'){closeMenu();add.focus();}if(['ArrowDown','ArrowUp'].includes(event.key)){event.preventDefault();const items=[...menu.querySelectorAll('button')],index=items.indexOf(document.activeElement);items[(index+(event.key==='ArrowDown'?1:-1)+items.length)%items.length].focus();}});
 tabs.addEventListener('keydown',event=>{if(!['ArrowLeft','ArrowRight','Home','End','Delete'].includes(event.key))return;event.preventDefault();const current=store.state,index=current.tabs.indexOf(current.activeTab);if(event.key==='Delete'){close(current.activeTab);return;}const next=event.key==='Home'?0:event.key==='End'?current.tabs.length-1:(index+(event.key==='ArrowRight'?1:-1)+current.tabs.length)%current.tabs.length;store.update({activeTab:current.tabs[next]});tabs.querySelector('[aria-selected="true"]')?.focus();});
 function drawTabs(){const signature=JSON.stringify([store.state.tabs,store.state.activeTab]);if(signature===tabSignature)return;tabSignature=signature;const refocus=tabs.contains(document.activeElement);add.hidden=store.state.tabs.length===0;tabs.replaceChildren();for(const type of store.state.tabs){const wrap=document.createElement('div');wrap.className='panel-tab';wrap.dataset.active=String(store.state.activeTab===type);const tab=document.createElement('button');tab.className='panel-tab-select';tab.type='button';tab.setAttribute('role','tab');tab.setAttribute('aria-label',options[type].label);tab.title=options[type].label;tab.id='panel-tab-'+type;tab.setAttribute('aria-selected',String(store.state.activeTab===type));tab.setAttribute('aria-controls',body.id);tab.tabIndex=store.state.activeTab===type?0:-1;tab.innerHTML=icon(options[type].icon);tab.append(textNode('span','',options[type].label));tab.addEventListener('click',()=>store.update({activeTab:type}));const dismiss=panelIconButton(`Close ${options[type].label} tab`,'close');dismiss.classList.add('panel-tab-close');dismiss.addEventListener('click',()=>close(type));wrap.addEventListener('auxclick',event=>{if(event.button===1){event.preventDefault();close(type);}});wrap.append(tab,dismiss);tabs.append(wrap);}if(refocus)tabs.querySelector('[aria-selected="true"]')?.focus({preventScroll:true});}
 function message(title,detail='',retry=false){body.replaceChildren();const empty=document.createElement('div');empty.className='panel-empty';empty.append(textNode('p','',title));if(detail)empty.append(textNode('p','panel-empty-detail',detail));if(retry){const button=document.createElement('button');button.type='button';button.className='button button--subtle';button.textContent='Try again';button.addEventListener('click',()=>void load());empty.append(button);}body.append(empty);}
 function patchView(type,patch){store.update({[type]:{...store.state[type],...patch}});}
 async function load(){
  clearTimeout(scrollTimer);
  const request=++version,state=store.state,type=state.activeTab,id=store.id;
  if(!id||!state.panelOpen)return;
  drawTabs();
  if(!type){body.removeAttribute('role');body.removeAttribute('aria-labelledby');body.removeAttribute('aria-busy');body.replaceChildren();const launcher=document.createElement('div');launcher.className='panel-launcher';choices(launcher);body.append(launcher);return;}
  body.setAttribute('role','tabpanel');body.setAttribute('aria-labelledby','panel-tab-'+type);body.setAttribute('aria-busy','true');
  if(isCloudTab(type)){renderCloudTab(body,type,{threadId:id,open:activate});body.setAttribute('aria-busy','false');return;}
  const focusedPath=body.contains(document.activeElement)?document.activeElement.dataset.path:null;
  const viewKey=JSON.stringify([id,type,state[type].file]);
  if(viewKey!==renderedViewKey||!body.querySelector('.panel-scroll'))message('Loading…');
  renderedViewKey=viewKey;
  const valid=()=>request===version&&id===store.id&&store.state.panelOpen;
  try{
   const view=state[type];
   if(directoryThread!==id){directories.clear();directoryThread=id;}
   const expanded=view.expanded??[];
   const [root,changed]=await Promise.all([
    directories.has('')?directories.get(''):api.files(''),
    type==='changes'?api.changes():null,
   ]);
   if(!valid())return;directories.set('',root);
   if(type==='files')await Promise.all(expanded.filter(path=>!directories.has(path)).map(async path=>{try{const value=await api.files(path);if(valid())directories.set(path,value);}catch{/* A removed folder must not prevent opening other files. */}}));
   if(!valid())return;
   const openFile=path=>patchView(type,{file:path,scroll:0,recent:[path,...(store.state[type].recent||[]).filter(value=>value!==path)].slice(0,8)});
   const editor=createPanelEditor({body,type,view,project:root.project,onPatch:patch=>patchView(type,patch),onTab:activate,onRefresh:refreshPanel,onOpen:openFile});
   const {scroller,list}=editor;
   if(type==='files'){
    editor.filter(renderFileTree(list,{directories,expanded,onFolder:path=>patchView(type,{expanded:expanded.includes(path)?expanded.filter(value=>value!==path):[...expanded,path]}),onFile:openFile}));
    if(!root.entries.length)list.append(textNode('p','panel-inline-note','Empty folder'));
   }else{
    editor.filter(renderChanges(list,{entries:changed.entries,collapsed:view.collapsed??[],onGroup:folder=>{const collapsed=view.collapsed??[];patchView(type,{collapsed:collapsed.includes(folder)?collapsed.filter(value=>value!==folder):[...collapsed,folder]});},onFile:openFile}));
    editor.bar.querySelector('.panel-path').textContent=view.file|| (changed.git?`${changed.entries.length} changed files`:'No Git repository');
   }
   editor.select(view.file);
   scroller.addEventListener('scroll',()=>{clearTimeout(scrollTimer);scrollTimer=setTimeout(()=>{if(valid())patchView(type,{scroll:scroller.scrollTop});},120);},{passive:true});
   list.scrollTop=view.treeScroll||0;
   list.addEventListener('scroll',()=>{if(valid())patchView(type,{treeScroll:list.scrollTop});},{passive:true});
   if(editor.input&&(focusFilter||!focusedPath)){focusFilter=false;queueMicrotask(()=>editor.input.focus({preventScroll:true}));}
   if(focusedPath)list.querySelector(`[data-path="${CSS.escape(focusedPath)}"]`)?.focus({preventScroll:true});
   if(view.file){
    try{const result=await (type==='files'?api.file(view.file):api.diff(view.file));if(!valid())return;renderCode(scroller,result,type==='changes');}
    catch(error){if(valid())scroller.append(textNode('p','panel-inline-note',error.message));}
   }else editor.empty(type==='changes'?(changed.git?(changed.entries.length?'Select a changed file':'No changes yet'):'No Git repository'):null);
   if(valid())scroller.scrollTop=view.scroll||0;
  }catch(error){if(valid())message('Couldn’t load '+options[type].label.toLowerCase(),error.message,true);}
  finally{if(valid())body.setAttribute('aria-busy','false');}
 }
 function sync(event){
  const visible=!!store.id&&store.state.panelOpen;
  document.body.classList.toggle('right-panel-open',visible);sidebar.inert=!visible;sidebar.setAttribute('aria-hidden',String(!visible));toggle.setAttribute('aria-expanded',String(visible));
  if(event?.type==='select'||event?.type==='adopt'){
   const width=store.state.panelWidth;
   if(Number.isFinite(width))document.documentElement.style.setProperty('--right-panel-width',`${Math.max(260,Math.min(960,innerWidth-document.querySelector('.sidebar').getBoundingClientRect().width-376,Math.max(360,width)))}px`);
   else document.documentElement.style.removeProperty('--right-panel-width');
   resize.setAttribute('aria-valuenow',String(Math.round(sidebar.getBoundingClientRect().width)));closeMenu();
  }
  if(!store.id)closeMenu();
  if(!event||event.type!=='update'||event.changedView||event.changed.some(key=>['panelOpen','tabs','activeTab'].includes(key)))void load();
 }
 // Scroll-only changes don't rebuild the active view.
 let previous=store.state;
 store.subscribe(event=>{const changedView=['files','changes'].some(type=>event.changed?.includes(type)&&(event.state[type].file!==previous[type].file||event.state[type].directory!==previous[type].directory||event.state[type].filterOpen!==previous[type].filterOpen||event.state[type].explorerOpen!==previous[type].explorerOpen||JSON.stringify(event.state[type].expanded)!==JSON.stringify(previous[type].expanded)||JSON.stringify(event.state[type].collapsed)!==JSON.stringify(previous[type].collapsed)));previous=event.state;event.changedView=changedView;sync(event);});
 toggle.addEventListener('click',()=>{if(store.id)store.update({panelOpen:!store.state.panelOpen});});
 const saveWidth=()=>{if(store.id)store.update({panelWidth:Math.round(sidebar.getBoundingClientRect().width)});};
 resize.addEventListener('lostpointercapture',saveWidth);resize.addEventListener('keydown',saveWidth);resize.addEventListener('dblclick',saveWidth);
 api.onEvent(event=>{if(event.event==='tool_end'&&store.state.panelOpen){clearTimeout(refreshTimer);refreshTimer=setTimeout(refreshPanel,300);}});
 document.addEventListener('suffice:thread-updated',refreshPanel);
 document.addEventListener('keydown',event=>{
  if(!store.id||!store.state.panelOpen||!store.state.activeTab||!(event.ctrlKey||event.metaKey))return;
  const type=store.state.activeTab;
  if(event.key.toLowerCase()==='p'){event.preventDefault();focusFilter=true;patchView(type,{explorerOpen:true,filterOpen:true});body.querySelector('.panel-filter')?.focus();}
  if(event.key==='\\'){event.preventDefault();patchView(type,{explorerOpen:store.state[type].explorerOpen===false});}
 });
 sync();
}
