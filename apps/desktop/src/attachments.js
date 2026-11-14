import {fileIcon} from './file-icons.js';
import {icon} from './ui.js';
import {createMenu} from './menu.js';
import {threadViewState as store} from './thread-view-state.js';
const sizeLabel=size=>size<1024?`${size} B`:size<1048576?`${(size/1024).toFixed(1)} KB`:`${(size/1048576).toFixed(1)} MB`;
const dataURL=file=>new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(reader.error);reader.readAsDataURL(file);});
export function connectAttachments({form,prompt,send,input,toast}){
 const tray=form.querySelector('.attachment-chip');tray.className='attachment-tray';input.multiple=true;
 let files=[],urls=[],activeKey=store.id||'new',generation=0;
 const cache=new Map();
 function edges(){tray.dataset.moreLeft=String(tray.scrollLeft>1);tray.dataset.moreRight=String(tray.scrollWidth-tray.clientWidth-tray.scrollLeft>1);}
 tray.addEventListener('scroll',edges,{passive:true});new ResizeObserver(edges).observe(tray);
 tray.addEventListener('wheel',event=>{if(tray.scrollWidth>tray.clientWidth&&Math.abs(event.deltaY)>Math.abs(event.deltaX)){event.preventDefault();tray.scrollLeft+=event.deltaY;}},{passive:false});
 const database=new Promise(resolve=>{const request=indexedDB.open('suffice-attachments',1);request.onupgradeneeded=()=>request.result.createObjectStore('drafts');request.onsuccess=()=>resolve(request.result);request.onerror=()=>resolve(null);});
 // Coalesce per key: a burst of edits queues one write of the newest state, not one blob-cloning transaction per edit that a reload can abort.
const pending=new Map();let flushing=false;
// Blob writes can outlive a reload; this synchronous manifest records which files the draft still holds so restore drops removed ones.
const id=file=>[file.name,file.size,file.lastModified].join('|');
function manifest(key,value){try{if(value)localStorage.setItem('suffice-attachments:'+key,JSON.stringify(value.map(id)));else return JSON.parse(localStorage.getItem('suffice-attachments:'+key));}catch{}return null;}
async function persist(key,value){manifest(key,value);pending.set(key,value);if(flushing)return;flushing=true;try{const db=await database;while(pending.size){const [k,v]=pending.entries().next().value;pending.delete(k);if(!db)continue;await new Promise(done=>{const tx=db.transaction('drafts','readwrite',{durability:'relaxed'});tx.objectStore('drafts').put(v,k);tx.oncomplete=tx.onabort=tx.onerror=done;});}}finally{flushing=false;}}
 async function restore(key){if(cache.has(key))return cache.get(key);const db=await database;if(!db)return [];return new Promise(resolve=>{const request=db.transaction('drafts').objectStore('drafts').get(key);request.onsuccess=()=>{const saved=request.result||[],keep=manifest(key);resolve(keep?saved.filter(file=>keep.includes(id(file))):saved);};request.onerror=()=>resolve([]);});}
 function changed(){cache.set(activeKey,files);void persist(activeKey,files);render();prompt.dispatchEvent(new Event('input'));form.dispatchEvent(new Event('attachments-change'));}
 function render(){urls.forEach(URL.revokeObjectURL);urls=[];tray.replaceChildren();tray.hidden=!files.length;
  files.forEach((file,index)=>{
   const item=document.createElement('div');item.className='attachment-card'+(file.type.startsWith('image/')?' attachment-image':'');
   if(file.type.startsWith('image/')){const url=URL.createObjectURL(file);urls.push(url);const preview=document.createElement('button');preview.type='button';preview.className='attachment-open';preview.setAttribute('aria-label','Preview '+file.name);const image=document.createElement('img');image.src=url;image.alt=file.name;preview.append(image);preview.addEventListener('click',()=>showPreview(file));item.append(preview);}
   else{item.append(fileIcon(file.name));const info=document.createElement('span');info.className='attachment-info';const name=document.createElement('span');name.textContent=file.name;const size=document.createElement('span');size.textContent=sizeLabel(file.size);size.className='attachment-size';info.append(name,size);item.append(info);}
   const remove=document.createElement('button');remove.type='button';remove.className='attachment-remove';remove.setAttribute('aria-label','Remove '+file.name);remove.innerHTML=icon('close');remove.addEventListener('click',()=>{files=files.filter((_,i)=>i!==index);changed();});item.append(remove);tray.append(item);
  });
  if(form.dataset.running!=='true')send.disabled=!prompt.value.trim()&&!files.length;requestAnimationFrame(edges);
 }
 function add(items){const incoming=Array.from(items);if([...files,...incoming].reduce((sum,file)=>sum+file.size,0)>20*1024*1024||files.length+incoming.length>20){toast('Attach up to 20 files, 20 MB total.');return;}for(const file of incoming)if(!files.some(existing=>existing.name===file.name&&existing.size===file.size&&existing.lastModified===file.lastModified))files.push(file);changed();}
 input.addEventListener('change',()=>{add(input.files);input.value='';});
 prompt.addEventListener('paste',event=>{const items=[...event.clipboardData.files];if(items.length){event.preventDefault();add(items);}else if(!event.clipboardData.getData('text/plain')&&window.sufficeDesktop?.clipboardFiles){event.preventDefault();void window.sufficeDesktop.clipboardFiles().then(items=>add(items.map(item=>new File([Uint8Array.from(atob(item.data),c=>c.charCodeAt(0))],item.name,{type:item.type,lastModified:item.modified})))).catch(error=>toast(error.message));}});
 form.addEventListener('dragover',event=>{if(event.dataTransfer.types.includes('Files')){event.preventDefault();form.classList.add('attachment-drag');}});
 form.addEventListener('dragleave',()=>form.classList.remove('attachment-drag'));
 form.addEventListener('drop',event=>{event.preventDefault();form.classList.remove('attachment-drag');add(event.dataTransfer.files);});
 prompt.addEventListener('input',()=>{if(form.dataset.running!=='true')send.disabled=!prompt.value.trim()&&!files.length;});
 store.subscribe(async event=>{if(event.type!=='select'&&event.type!=='adopt')return;const next=event.id||'new';if(next===activeKey)return;cache.set(activeKey,files);if(event.type==='adopt'){activeKey=next;cache.set(next,files);void persist(next,files);return;}const token=++generation;activeKey=next;files=[];render();const saved=await restore(next);if(token===generation){files=saved;render();}});
 const initialKey=activeKey;void restore(initialKey).then(saved=>{if(activeKey===initialKey&&!files.length){files=saved;render();}});
 form.attachments={get count(){return files.length;},async payload(){return Promise.all(files.map(async file=>({name:file.name,type:file.type,size:file.size,data:(await dataURL(file)).split(',')[1]})));},clear(){files=[];changed();}};
 function showPreview(selected){
  const images=files.filter(file=>file.type.startsWith('image/'));let index=images.indexOf(selected),zoom='fit',currentURL;
  const dialog=document.createElement('dialog');dialog.className='image-preview';dialog.setAttribute('aria-label','Image preview');
  const image=document.createElement('img');image.className='image-preview-content';const toolbar=document.createElement('div');toolbar.className='image-preview-toolbar';
  function button(label,glyph,action){const button=document.createElement('button');button.type='button';button.className='button button--ghost';button.setAttribute('aria-label',label);button.innerHTML=icon(glyph);button.addEventListener('click',action);return button;}
  const previous=button('Previous image','back',()=>{index--;draw();}),next=button('Next image','back',()=>{index++;draw();});next.classList.add('preview-next');
  const menuElement=document.createElement('div');menuElement.className='popover preview-menu';menuElement.id='image-preview-options';menuElement.hidden=true;dialog.append(menuElement);const menu=createMenu(menuElement);
  const names=button('Choose preview image','chevron',()=>menu.open(names,images.map((file,i)=>({label:file.name,selected:i===index,action:'preview-image:'+i})),'Images'));names.classList.add('preview-name');
  const scales=button('Image zoom','chevron',()=>menu.open(scales,['fit','50','100','200'].map(value=>({label:value==='fit'?'Fit':value+'%',selected:value===zoom,action:'preview-zoom:'+value})),'Zoom'));scales.classList.add('preview-zoom');
  menuElement.addEventListener('click',event=>{const action=event.target.closest('[data-menu-action]')?.dataset.menuAction;if(!action)return;event.stopPropagation();const [type,value]=action.split(':');if(type==='preview-image')index=Number(value);else zoom=value;menu.close(true);draw();});
  toolbar.append(previous,next,names,scales,button('Close image preview','close',()=>dialog.close()));dialog.append(image,toolbar);document.body.append(dialog);
  function sizing(){image.style.maxWidth=zoom==='fit'?'calc(100vw - 80px)':'none';image.style.maxHeight=zoom==='fit'?'calc(100vh - 140px)':'none';image.style.width=zoom==='fit'?'auto':image.naturalWidth*Number(zoom)/100+'px';}
  image.addEventListener('load',sizing);
  function draw(){if(currentURL)URL.revokeObjectURL(currentURL);currentURL=URL.createObjectURL(images[index]);image.src=currentURL;image.alt=images[index].name;names.replaceChildren(document.createTextNode(images[index].name));names.insertAdjacentHTML('beforeend',icon('chevron'));scales.replaceChildren(document.createTextNode(zoom==='fit'?'Fit':zoom+'%'));scales.insertAdjacentHTML('beforeend',icon('chevron'));previous.disabled=index===0;next.disabled=index===images.length-1;sizing();}
  dialog.addEventListener('click',event=>{if(event.target===dialog)dialog.close();});dialog.addEventListener('keydown',event=>{if(event.target.closest('.preview-menu'))return;if(event.key==='ArrowLeft'&&index>0){index--;draw();}if(event.key==='ArrowRight'&&index<images.length-1){index++;draw();}});dialog.addEventListener('close',()=>{menu.destroy();URL.revokeObjectURL(currentURL);dialog.remove();prompt.focus();});dialog.showModal();draw();
 }
}
