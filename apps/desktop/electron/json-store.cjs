// JSON state files: reads never lose data and writes never leave a half-written file.
const fs=require('node:fs');
const path=require('node:path');
let counter=0;
// A missing file gives the fallback. An unparseable one is moved to <file>.bad and gives the fallback.
function read(file,fallback,onBad=file=>console.error(`Corrupt state file moved aside: ${file}.bad`)){
 let text;
 try{text=fs.readFileSync(file,'utf8');}catch(error){if(error.code==='ENOENT')return fallback;throw error;}
 try{return JSON.parse(text);}catch{
  try{fs.renameSync(file,`${file}.bad`);onBad(file);}catch{}
  return fallback;
 }
}
function write(file,value,space){
 fs.mkdirSync(path.dirname(file),{recursive:true,mode:0o700});
 const tmp=`${file}.${process.pid}.${++counter}.tmp`;
 try{fs.writeFileSync(tmp,JSON.stringify(value,null,space),{mode:0o600});fs.renameSync(tmp,file);}
 catch(error){try{fs.rmSync(tmp,{force:true});}catch{}throw error;}
}
module.exports={read,write};
