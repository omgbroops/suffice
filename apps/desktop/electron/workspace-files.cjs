const fs=require('node:fs/promises');
const path=require('node:path');
const {promisify}=require('node:util');
const exec=promisify(require('node:child_process').execFile);
const limit=256*1024;
async function filterIgnored(root,entries){
 if(!root||!entries.length)return entries;
 // Ask Git about this directory's entries only. Scanning the whole ignored tree
 // and searching that list for every row made expanding many folders quadratic.
 const input=entries.map(entry=>entry.path+(entry.kind==='directory'?'/':'')).join('\0')+'\0';
 try{
  const output=await new Promise((resolve,reject)=>{
   const child=require('node:child_process').execFile('git',['--no-optional-locks','-C',root,'check-ignore','--stdin','-z'],{windowsHide:true,timeout:5000,maxBuffer:2*1024*1024},(error,stdout)=>error&&error.code!==1?reject(error):resolve(stdout));
   child.stdin.on('error',()=>{});child.stdin.end(input);
  });
  const ignored=new Set(output.split('\0').filter(Boolean).map(name=>name.replace(/\/$/,'')));
  return entries.filter(entry=>!ignored.has(entry.path));
 }catch{return entries;}
}
async function inside(root,name=''){
 if(!root)throw new Error('No project selected');
 if(typeof name!=='string'||name.includes('\0')||path.isAbsolute(name))throw new Error('Invalid workspace path');
 const base=await fs.realpath(root),file=await fs.realpath(path.resolve(base,name));
 const relative=path.relative(base,file);
 if(relative==='..'||relative.startsWith('..'+path.sep)||path.isAbsolute(relative))throw new Error('Path is outside this project');
 return {base,file};
}
async function list(root,directory=''){
 const {base,file}=await inside(root,directory);
 const entries=await fs.readdir(file,{withFileTypes:true});
 return {directory,project:path.basename(base),entries:entries.filter(entry=>entry.name!=='.git').map(entry=>({name:entry.name,path:path.relative(base,path.join(file,entry.name)).split(path.sep).join('/'),kind:entry.isSymbolicLink()?'link':entry.isDirectory()?'directory':'file'})).sort((a,b)=>(a.kind==='directory'?0:1)-(b.kind==='directory'?0:1)||a.name.localeCompare(b.name,undefined,{numeric:true}))};
}
async function read(root,name){
 const {file}=await inside(root,name);const handle=await fs.open(file,'r');
 try{
  const info=await handle.stat();if(!info.isFile())throw new Error('This is not a file');
  const buffer=Buffer.alloc(Math.min(info.size,limit));const {bytesRead}=await handle.read(buffer,0,buffer.length,0);
  if(buffer.subarray(0,Math.min(bytesRead,8000)).includes(0))return {path:name,binary:true,text:'',truncated:false};
  return {path:name,text:buffer.subarray(0,bytesRead).toString('utf8'),truncated:info.size>limit};
 }finally{await handle.close();}
}
const git=async(root,args)=>{if(!root)throw new Error('No project selected');return (await exec('git',['--no-optional-locks','-c','core.fsmonitor=false','-C',root,...args],{windowsHide:true,timeout:8000,maxBuffer:2*1024*1024})).stdout;};
function parseNumstat(output){
 const stats=new Map(),records=output.split('\0');
 for(let i=0;i<records.length;i++){const match=records[i].match(/^([\d-]+)\t([\d-]+)\t([\s\S]*)$/);if(!match)continue;let name=match[3];if(!name){i++;name=records[++i];}stats.set(name,{added:match[1]==='-'?null:Number(match[1]),removed:match[2]==='-'?null:Number(match[2]),binary:match[1]==='-'});}
 return stats;
}
async function changes(root,includeStats=true){
 let output;try{output=await git(root,['status','--porcelain=v1','-z','--untracked-files=all']);}catch(error){if(error.stderr?.includes('not a git repository'))return {git:false,entries:[]};throw new Error('Could not read Git changes');}
 const records=output.split('\0'),entries=[];
 for(let i=0;i<records.length;i++){if(!records[i])continue;const status=records[i].slice(0,2),name=records[i].slice(3);const from=/[RC]/.test(status)?records[++i]:undefined;entries.push({path:name,status,from});}
 if(includeStats){
  let stats,unborn=false;const args=['diff','--no-ext-diff','--no-textconv','--numstat','-z'];
  try{stats=parseNumstat(await git(root,[...args,'HEAD','--']));}catch{unborn=true;stats=parseNumstat(await git(root,[...args,'--cached','--']).catch(()=>''));}
  for(const entry of entries)Object.assign(entry,stats.get(entry.path)||{added:0,removed:0});
  const newFiles=entries.filter(entry=>entry.status==='??'||unborn&&entry.status.includes('A'));let next=0;
  await Promise.all(Array.from({length:Math.min(4,newFiles.length)},async()=>{while(next<newFiles.length){const entry=newFiles[next++];try{const result=await read(root,entry.path);Object.assign(entry,{added:result.binary||result.truncated?null:result.text?result.text.split('\n').length-(result.text.endsWith('\n')?1:0):0,removed:0,binary:!!result.binary,statsPartial:result.truncated});}catch{Object.assign(entry,{added:null,removed:null});}}}));
 }
 return {git:true,entries};
}
async function diff(root,name){
 const changed=await changes(root,false),entry=changed.entries.find(entry=>entry.path===name);
 if(!entry)throw new Error('This file no longer has changes');
 if(entry.status==='??')return {...await read(root,name),untracked:true};
 const args=['diff','--no-ext-diff','--no-textconv','--no-color'];
 const paths=entry.from?[entry.from,name]:[name];
 let text;try{text=await git(root,[...args,'HEAD','--',...paths]);}catch{if(entry.status.includes('A'))return {...await read(root,name),untracked:true};const unstaged=await git(root,[...args,'--',...paths]),staged=await git(root,[...args,'--cached','--',...paths]);text=[staged,unstaged].filter(Boolean).join('\n');}
 return {path:name,text:text.slice(0,limit),truncated:text.length>limit};
}
module.exports={list,read,changes,diff,parseNumstat,filterIgnored};
