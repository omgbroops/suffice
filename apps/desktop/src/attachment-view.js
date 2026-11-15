import {fileIcon} from './file-icons.js';
import {icon} from './ui.js';
import {createMenu} from './menu.js';
const sizeLabel=size=>size<1024?`${size} B`:size<1048576?`${(size/1024).toFixed(1)} KB`:`${(size/1048576).toFixed(1)} MB`;
export function createAttachmentCard(file,{url,onPreview,onRemove}={}){
 const image=!!url&&file.type.startsWith('image/'),item=document.createElement('div');item.className='attachment-card'+(image?' attachment-image':'');
 if(image){const preview=document.createElement('button');preview.type='button';preview.className='attachment-open';preview.setAttribute('aria-label','Preview '+file.name);const img=document.createElement('img');img.src=url;img.alt=file.name;preview.append(img);preview.onclick=onPreview;item.append(preview);}
 else{item.append(fileIcon(file.name));const info=document.createElement('span');info.className='attachment-info';const name=document.createElement('span');name.textContent=file.name;const size=document.createElement('span');size.textContent=sizeLabel(file.size||0);size.className='attachment-size';info.append(name,size);item.append(info);}
 if(onRemove){const remove=document.createElement('button');remove.type='button';remove.className='attachment-remove';remove.setAttribute('aria-label','Remove '+file.name);remove.innerHTML=icon('close');remove.onclick=onRemove;item.append(remove);}return item;
}
export function attachmentItems(items=[],images=[]){
 if(!items.length)items=images.map((image,i)=>({name:`Image ${i+1}.${image.mimeType?.split('/')[1]||'png'}`,type:image.mimeType,imageIndex:i}));
 return items.map(item=>{const image=images[item.imageIndex];return {...item,...(image?{data:image.data,type:image.mimeType}:{} )};});
}
export function sentAttachmentGrid(items,images=[]){
 const files=attachmentItems(items,images);if(!files.length)return null;
 const grid=document.createElement('div');grid.className='attachment-tray sent-attachments';grid.setAttribute('aria-label','Sent attachments');
 const imageFiles=()=>files.filter(file=>file.data&&file.type?.startsWith('image/')).map(file=>new File([Uint8Array.from(atob(file.data),c=>c.charCodeAt(0))],file.name,{type:file.type}));
 for(const file of files){const url=file.data&&/^image\/(png|jpeg|webp|gif|svg\+xml)$/.test(file.type)?`data:${file.type};base64,${file.data}`:null;const card=createAttachmentCard(file,{url,onPreview:()=>{const all=imageFiles(),index=files.filter(item=>item.data&&item.type?.startsWith('image/')).indexOf(file);showImagePreview(all,all[index],{onClose:()=>card.querySelector('button')?.focus({preventScroll:true})});}});grid.append(card);}return grid;
}
export function showImagePreview(files,selected,{onClose=()=>{}}={}){
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
  dialog.addEventListener('click',event=>{if(event.target===dialog)dialog.close();});dialog.addEventListener('keydown',event=>{if(event.target.closest('.preview-menu'))return;if(event.key==='ArrowLeft'&&index>0){index--;draw();}if(event.key==='ArrowRight'&&index<images.length-1){index++;draw();}});dialog.addEventListener('close',()=>{menu.destroy();URL.revokeObjectURL(currentURL);dialog.remove();onClose();});dialog.showModal();draw();
 }
