import {copyFile,readFile,writeFile,stat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {dirname,basename,join} from 'node:path';

// Replace only existing PE icon resources. No executable code or shared runtime is changed.
export function patchExecutableIcons(pe,ico){
 if(pe.toString('ascii',0,2)!=='MZ'||ico.readUInt16LE(2)!==1)throw new Error('Invalid executable or icon');
 const header=pe.readUInt32LE(60);if(pe.toString('ascii',header,header+4)!=='PE\0\0')throw new Error('Invalid PE header');
 const optional=header+24,table=optional+pe.readUInt16LE(header+20),dataDirectory=optional+(pe.readUInt16LE(optional)===0x20b?112:96),resourceRva=pe.readUInt32LE(dataDirectory+16),sections=[];
 for(let i=0;i<pe.readUInt16LE(header+6);i++){const at=table+40*i;sections.push({size:pe.readUInt32LE(at+16),rva:pe.readUInt32LE(at+12),offset:pe.readUInt32LE(at+20)});}
 const offset=rva=>{const section=sections.find(s=>rva>=s.rva&&rva<s.rva+s.size);if(!section)throw new Error('Icon resource is outside PE sections');return section.offset+rva-section.rva;};
 const base=offset(resourceRva),resourceSize=pe.readUInt32LE(dataDirectory+20),resources=[];
 function visit(at,path=[]){const count=pe.readUInt16LE(base+at+12)+pe.readUInt16LE(base+at+14);for(let i=0;i<count;i++){const row=base+at+16+i*8,name=pe.readUInt32LE(row),target=pe.readUInt32LE(row+4);if(name&0x80000000)continue;const next=[...path,name];if(target&0x80000000)visit(target&0x7fffffff,next);else{const entry=base+target,start=offset(pe.readUInt32LE(entry)),size=pe.readUInt32LE(entry+4);if(start<base||start+size>Math.min(pe.length,base+resourceSize))throw new Error('Icon resource is outside the resource section');resources.push({path:next,entry,start,size});}}}
 visit(0);
 const images=[];for(let i=0;i<ico.readUInt16LE(4);i++){const row=6+16*i,size=ico.readUInt32LE(row+8),start=ico.readUInt32LE(row+12);if(start+size>ico.length)throw new Error('Truncated ICO image');images.push({width:ico[row]||256,height:ico[row+1]||256,row,data:ico.subarray(start,start+size)});}
 const groups=resources.filter(r=>r.path[0]===14);if(!groups.length)throw new Error('Executable has no icon group');const plans=[];
 for(const group of groups){const count=pe.readUInt16LE(group.start+4);if(6+14*count>group.size)throw new Error('Invalid icon group');for(let i=0;i<count;i++){const row=group.start+6+14*i,id=pe.readUInt16LE(row+12),icon=resources.find(r=>r.path[0]===3&&r.path[1]===id&&r.path[2]===group.path[2]);if(!icon)throw new Error('Missing icon image');const width=pe[row]||256;const image=images.filter(image=>image.data.length<=icon.size).sort((a,b)=>Math.abs(a.width-width)-Math.abs(b.width-width))[0];if(!image)throw new Error('Suffice icon does not fit the existing resource');plans.push({row,icon,image});}}
 for(const {row,icon,image} of plans){pe.fill(0,icon.start,icon.start+icon.size);image.data.copy(pe,icon.start);pe.writeUInt32LE(image.data.length,icon.entry+4);ico.copy(pe,row,image.row,image.row+8);pe.writeUInt32LE(image.data.length,row+8);}
 return plans.length;
}
export async function prepareWindowsDevExecutable(electronPath,iconPath){
 if(basename(electronPath).toLowerCase()!=='electron.exe')throw new Error('Expected the development Electron runtime');
 const target=join(dirname(electronPath),'Suffice.exe'),stamp=target+'.icon.json',source=await stat(electronPath),icon=await readFile(iconPath),key=createHash('sha256').update(icon).update(String(source.size)+':'+source.mtimeMs).digest('hex');
 try{if((await readFile(stamp,'utf8'))===key&&(await stat(target)).size===source.size)return target;}catch{}
 await copyFile(electronPath,target);const executable=await readFile(target);patchExecutableIcons(executable,icon);await writeFile(target,executable);await writeFile(stamp,key);return target;
}
