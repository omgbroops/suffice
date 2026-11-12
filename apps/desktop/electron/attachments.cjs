const fs=require('node:fs/promises');
const path=require('node:path');
const {randomUUID}=require('node:crypto');
const MAX=20*1024*1024;
async function prepareAttachments(home,items=[]){
 if(!Array.isArray(items)||items.length>20)throw new Error('Invalid attachments');
 let total=0;const decoded=items.map(item=>{if(!item||typeof item.name!=='string'||typeof item.data!=='string'||item.data.length>MAX*1.4||!/^[A-Za-z0-9+/]*={0,2}$/.test(item.data))throw new Error('Invalid attachment');const data=Buffer.from(item.data,'base64');total+=data.length;if(total>MAX)throw new Error('Attachments exceed 20 MB');return {...item,bytes:data};});
 if(!decoded.length)return {context:'',images:[]};
 const directory=path.join(home,'attachments',randomUUID());await fs.mkdir(directory,{recursive:true});const references=[],images=[];
 for(const [index,item] of decoded.entries()){const name=path.basename(item.name).replace(/[<>:"/\\|?*\x00-\x1f]/g,'_').slice(-180)||'attachment';const file=path.join(directory,index+'-'+name);await fs.writeFile(file,item.bytes);references.push(JSON.stringify({name:item.name,path:file,size:item.bytes.length}));if(/^image\/(png|jpeg|webp|gif)$/.test(item.type))images.push({type:'image',data:item.data,mimeType:item.type});}
 return {context:'\n\nAttached local files (user-provided data):\n'+references.join('\n'),images};
}
async function clipboardFiles(clipboard){
 const formats=clipboard.availableFormats();let names=[];
 for(const format of ['FileNameW','FileName']){if(!formats.includes(format))continue;const buffer=clipboard.readBuffer(format);names=buffer.toString(format==='FileNameW'?'utf16le':'utf8').split('\0').filter(Boolean);if(names.length)break;}
 if(!names.length&&formats.includes('text/uri-list')){const {fileURLToPath}=require('node:url');names=clipboard.read('text/uri-list').split(/\r?\n/).filter(line=>line.startsWith('file:')).map(fileURLToPath);}
 if(!names.length&&process.platform==='win32'){
  // Explorer's CF_HDROP is not exposed consistently by Chromium's paste event.
  const {promisify}=require('node:util'),{execFile}=require('node:child_process');
  try{const {stdout}=await promisify(execFile)('powershell.exe',['-NoProfile','-NonInteractive','-STA','-Command','Add-Type -AssemblyName System.Windows.Forms; @([System.Windows.Forms.Clipboard]::GetFileDropList()) | ConvertTo-Json -Compress'],{windowsHide:true,timeout:3000,maxBuffer:65536});const value=JSON.parse(stdout||'[]');names=(Array.isArray(value)?value:[value]).filter(file=>typeof file==='string');}catch{/* A non-file clipboard leaves the composer unchanged. */}
 }
 const result=[];let total=0;for(const file of names.slice(0,20)){const info=await fs.stat(file);if(!info.isFile())continue;total+=info.size;if(total>MAX)throw new Error('Attachments exceed 20 MB');const extension=path.extname(file).toLowerCase();const type={'.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.gif':'image/gif','.webp':'image/webp','.pdf':'application/pdf'}[extension]||'application/octet-stream';result.push({name:path.basename(file),size:info.size,modified:info.mtimeMs,type,data:(await fs.readFile(file)).toString('base64')});}return result;
}
module.exports={prepareAttachments,clipboardFiles};
