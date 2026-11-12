// The upstream manifest handles compound extensions and special filenames too.
let assets={};
try { assets = import.meta.glob('../../../node_modules/material-icon-theme/icons/*.svg', {eager:true, query:'?url&no-inline', import:'default'}); } catch { /* Node-only diff parser tests do not load visual assets. */ }
const urls = new Map(Object.entries(assets).map(([path,url])=>[path.split('/').pop(),url]));
export function fileIcon(path){
 const name=path.split(/[\\/]/).pop().toLowerCase(),manifest=__FILE_ICON_MANIFEST__;
 let key=manifest.fileNames[name];
 const parts=name.split('.');
 for(let index=1;!key&&index<parts.length;index++)key=manifest.fileExtensions[parts.slice(index).join('.')];
 const definition=manifest.iconDefinitions[key||manifest.file];
 const image=document.createElement('img');image.className='file-type-icon';image.alt='';image.setAttribute('aria-hidden','true');image.draggable=false;
 image.src=urls.get(definition?.iconPath.split('/').pop())||urls.get('file.svg');
 return image;
}
