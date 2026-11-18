import {createFileOpenButton} from './file-open-menu.js';
import {savePreference} from './settings-preferences.js';
import {icon} from './ui.js';
import {textElement} from './panel-content.js';
import {fileIcon} from './file-icons.js';
import {connectScrollEdges} from './components/ui/scroll-edges.js';

function control(label,glyph,action){const button=document.createElement('button');button.type='button';button.className='button button--ghost editor-control';button.setAttribute('aria-label',label);button.title=label;button.innerHTML=icon(glyph);button.addEventListener('click',action);return button;}

// Files and Changes share one explorer/preview composition and control recipe.
export function createPanelEditor({body,type,view,project,onPatch,onTab,onRefresh,onOpen,review}){
 body.replaceChildren();const shell=document.createElement('div');shell.className='panel-editor';shell.dataset.explorer=String(view.explorerOpen!==false);
 const explorer=document.createElement('aside');explorer.className='editor-explorer';explorer.setAttribute('aria-label',type==='files'?'File explorer':'Changed files');explorer.hidden=view.explorerOpen===false;
 const tools=document.createElement('div');tools.className='editor-toolbar';
 const files=control('Browse files','files',()=>onTab('files')),search=control('Filter '+type,'search',()=>onPatch({filterOpen:!view.filterOpen,query:''})),changes=control('Browse changes','changes',()=>onTab('changes'));
 files.setAttribute('aria-pressed',String(type==='files'));changes.setAttribute('aria-pressed',String(type==='changes'));search.setAttribute('aria-expanded',String(!!view.filterOpen));
 tools.append(files,search,changes,control('Refresh '+type,'refresh',onRefresh),control('Hide explorer','panel',()=>onPatch({explorerOpen:false})));
 const heading=textElement('div','editor-project panel-path',project||'Project');heading.title=project||'Project';explorer.append(tools,heading);
 let input;
 if(view.filterOpen||view.query){input=document.createElement('input');input.className='panel-filter editor-search';input.setAttribute('aria-label','Filter '+type);input.placeholder=type==='files'?'Search files…':'Search changes…';input.value=view.query||'';explorer.append(input);}
 const list=document.createElement('div');list.className='editor-tree-scroll';list.tabIndex=0;explorer.append(list);
 const stopEdges=connectScrollEdges(list);
 const preview=document.createElement('section');preview.className='editor-preview';
 const bar=document.createElement('div');bar.className='panel-content-bar';
 const scroller=document.createElement('div');scroller.className='panel-scroll';scroller.tabIndex=0;scroller.setAttribute('aria-label',type==='files'?'File preview':'Change preview');preview.append(bar,scroller);shell.append(explorer,preview);body.append(shell);
 function drawBar(){
  bar.replaceChildren();const toggle=control('Show explorer','panel',()=>onPatch({explorerOpen:true}));toggle.hidden=view.explorerOpen!==false;bar.append(toggle);
  const path=textElement('span','panel-path',view.file||(type==='changes'?'All changes':''));path.title=view.file||'';if(view.file)bar.append(fileIcon(view.file));bar.append(path);if(type==='changes'&&review)bar.append(review[0]);preview.querySelector('.review-strip')?.remove();if(review[1])bar.after(review[1]);
  if(view.file){
   const options=document.createElement('div');options.className='editor-view-options';const wrap=control('Wrap lines','wrap',()=>void savePreference('wrap-lines',!view.wrap));wrap.setAttribute('aria-pressed',String(!!view.wrap));options.append(wrap);
   if(type==='changes'){
    const split=control('Split diff','split',()=>void savePreference('diff-layout',view.diffLayout==='split'?'Unified':'Split'));split.setAttribute('aria-pressed',String(view.diffLayout==='split'));options.append(split);
    for(const direction of [-1,1]){const jump=control(direction<0?'Previous change':'Next change','chevron',()=>{const hunks=[...scroller.querySelectorAll('.hunk')],top=scroller.getBoundingClientRect().top;const target=direction>0?hunks.find(hunk=>hunk.getBoundingClientRect().top>top+8)||hunks[0]:[...hunks].reverse().find(hunk=>hunk.getBoundingClientRect().top<top-8)||hunks.at(-1);if(target)scroller.scrollTo({top:scroller.scrollTop+target.getBoundingClientRect().top-top-6});});jump.dataset.changeNav=String(direction);options.append(jump);}
   }
   options.append(createFileOpenButton(view.file));
   bar.append(options,control('Back','close',()=>onPatch({file:null,scroll:0})));
  }
 }
 drawBar();
 const splitter=document.createElement('div');splitter.className='editor-splitter';splitter.tabIndex=0;splitter.setAttribute('role','separator');splitter.setAttribute('aria-label','Resize file explorer');splitter.setAttribute('aria-orientation','vertical');explorer.append(splitter);
 const maximum=()=>Math.max(140,shell.clientWidth-160);
 function setWidth(value){const width=Math.round(Math.max(140,Math.min(maximum(),value)));explorer.style.width=width+'px';explorer.style.flexBasis=width+'px';splitter.setAttribute('aria-valuemin','140');splitter.setAttribute('aria-valuemax',String(maximum()));splitter.setAttribute('aria-valuenow',String(width));return width;}
 let startX=0,startWidth=0,pending=0,frame=0,preferredWidth=view.explorerWidth;
 if(Number.isFinite(view.explorerWidth))setWidth(view.explorerWidth);
 else splitter.setAttribute('aria-valuenow',String(Math.round(explorer.getBoundingClientRect().width)));
 splitter.addEventListener('pointerdown',event=>{if(event.button!==0)return;event.preventDefault();startX=event.clientX;startWidth=explorer.getBoundingClientRect().width;pending=startWidth;splitter.setPointerCapture(event.pointerId);splitter.dataset.dragging='true';shell.dataset.splitting='true';});
 splitter.addEventListener('pointermove',event=>{if(!splitter.hasPointerCapture(event.pointerId))return;pending=startWidth+event.clientX-startX;if(!frame)frame=requestAnimationFrame(()=>{frame=0;setWidth(pending);});});
 splitter.addEventListener('pointerup',event=>{if(splitter.hasPointerCapture(event.pointerId))splitter.releasePointerCapture(event.pointerId);});
 splitter.addEventListener('lostpointercapture',()=>{cancelAnimationFrame(frame);frame=0;const width=setWidth(pending);delete splitter.dataset.dragging;delete shell.dataset.splitting;preferredWidth=width;onPatch({explorerWidth:width});});
 splitter.addEventListener('keydown',event=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();const width=setWidth(event.key==='Home'?140:event.key==='End'?maximum():explorer.getBoundingClientRect().width+(event.key==='ArrowRight'?1:-1)*(event.shiftKey?32:8));preferredWidth=width;onPatch({explorerWidth:width});});
 splitter.addEventListener('dblclick',()=>{explorer.style.removeProperty('width');explorer.style.removeProperty('flex-basis');preferredWidth=null;onPatch({explorerWidth:null});});
 const observer=new ResizeObserver(()=>{if(Number.isFinite(preferredWidth)&&view.explorerOpen!==false)setWidth(preferredWidth);});observer.observe(shell);
 // Disconnect detached editor observers when the parent is rebuilt.
 const cleanup=new MutationObserver(()=>{if(!shell.isConnected){observer.disconnect();stopEdges();cleanup.disconnect();}});cleanup.observe(body,{childList:true});
 let apply=()=>{};
 input?.addEventListener('input',()=>{onPatch({query:input.value});apply(input.value);});
 input?.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();onPatch({filterOpen:false,query:''});}});
 function empty(title){
  const wrap=document.createElement('div');wrap.className='editor-welcome';
  const recent=view.recent||[];
  if(type==='files'&&recent.length){wrap.append(textElement('p','editor-recent-label','Recent files'));for(const path of recent.slice(0,5)){const row=document.createElement('button');row.type='button';row.className='panel-file-row editor-recent';row.append(fileIcon(path),textElement('span','panel-file-name',path));row.addEventListener('click',()=>onOpen(path));wrap.append(row);}}
  if(type==='changes'){wrap.append(textElement('p','editor-empty-title',title||'Select a changed file'));}
  else{for(const [label,key,action] of [['Go to file','Ctrl P',()=>{if(view.explorerOpen===false||!view.filterOpen)onPatch({explorerOpen:true,filterOpen:true});else input?.focus();}],['Toggle explorer','Ctrl \\',()=>onPatch({explorerOpen:view.explorerOpen===false})]]){const button=document.createElement('button');button.type='button';button.className='editor-shortcut';button.append(textElement('span','',label),textElement('kbd','',key));button.addEventListener('click',action);wrap.append(button);}}
  scroller.append(wrap);
 }
 return {shell,scroller,list,bar,input,empty,setPreview(next){view=next;drawBar();scroller.replaceChildren();},filter(callback){apply=callback;apply(view.query||'');},select(path){for(const row of list.querySelectorAll('[data-path]')){row.classList.toggle('is-selected',row.dataset.path===path);if(row.getAttribute('role')==='treeitem'&&row.dataset.folder!=='true')row.setAttribute('aria-selected',String(row.dataset.path===path));}}};
}
