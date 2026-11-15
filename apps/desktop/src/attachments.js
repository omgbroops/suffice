import {createAttachmentCard,showImagePreview} from './attachment-view.js';
import {threadViewState as store} from './thread-view-state.js';
const dataURL=file=>new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(reader.error);reader.readAsDataURL(file);});
export function connectAttachments({form,prompt,send,input,toast}){
 const tray=form.querySelector('.attachment-chip');tray.className='attachment-tray';input.multiple=true;
 let files=[],urls=[],activeKey=store.id||'new',generation=0;
 const cache=new Map();let persistence=Promise.resolve(),pendingWrites=0;
 function edges(){tray.dataset.moreLeft=String(tray.scrollLeft>1);tray.dataset.moreRight=String(tray.scrollWidth-tray.clientWidth-tray.scrollLeft>1);}
 tray.addEventListener('scroll',edges,{passive:true});new ResizeObserver(edges).observe(tray);
 tray.addEventListener('wheel',event=>{if(tray.scrollWidth>tray.clientWidth&&Math.abs(event.deltaY)>Math.abs(event.deltaX)){event.preventDefault();tray.scrollLeft+=event.deltaY;}},{passive:false});
 const database=new Promise(resolve=>{const request=indexedDB.open('suffice-attachments',1);request.onupgradeneeded=()=>request.result.createObjectStore('drafts');request.onsuccess=()=>resolve(request.result);request.onerror=()=>resolve(null);});
 function persist(key,value){const snapshot=[...value];pendingWrites++;form.dataset.attachmentsSaving='true';const job=persistence.then(async()=>{const db=await database;if(!db)throw new Error('Attachment storage is unavailable');await new Promise((resolve,reject)=>{const tx=db.transaction('drafts','readwrite');tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||new Error('Attachment save interrupted'));tx.objectStore('drafts').put(snapshot,key);});});persistence=job.catch(()=>{}).finally(()=>{pendingWrites--;form.dataset.attachmentsSaving=String(pendingWrites>0);});return job;}
 async function restore(key){if(cache.has(key))return cache.get(key);const db=await database;if(!db)return [];return new Promise(resolve=>{const request=db.transaction('drafts').objectStore('drafts').get(key);request.onsuccess=()=>resolve(request.result||[]);request.onerror=()=>resolve([]);});}
 function changed(){cache.set(activeKey,files);void persist(activeKey,files).catch(()=>toast('Could not save attachments.'));render();prompt.dispatchEvent(new Event('input'));form.dispatchEvent(new Event('attachments-change'));}
 function render(){urls.forEach(URL.revokeObjectURL);urls=[];tray.replaceChildren();tray.hidden=!files.length;
  files.forEach((file,index)=>{
   const url=file.type.startsWith('image/')?URL.createObjectURL(file):null;if(url)urls.push(url);
   tray.append(createAttachmentCard(file,{url,onPreview:()=>showImagePreview(files,file,{onClose:()=>prompt.focus()}),onRemove:()=>{files=files.filter((_,i)=>i!==index);changed();}}));
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
 store.subscribe(async event=>{if(event.type!=='select'&&event.type!=='adopt')return;const next=event.id||'new';if(next===activeKey)return;cache.set(activeKey,files);if(event.type==='adopt'){activeKey=next;cache.set(next,files);void persist(next,files).catch(()=>toast('Could not save attachments.'));return;}const token=++generation;activeKey=next;files=[];render();const saved=await restore(next);if(token===generation){files=saved;render();}});
 const initialKey=activeKey;void restore(initialKey).then(saved=>{if(activeKey===initialKey&&!files.length){files=saved;render();}});
 form.attachments={addPayload:items=>add(items.map(item=>new File([Uint8Array.from(atob(item.data),c=>c.charCodeAt(0))],item.name,{type:item.type}))),flush:()=>persistence,get count(){return files.length;},async payload(){return Promise.all(files.map(async file=>({name:file.name,type:file.type,size:file.size,data:(await dataURL(file)).split(',')[1]})));},clear(){files=[];changed();}};
}
