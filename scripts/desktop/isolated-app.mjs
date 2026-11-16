import {cp,lstat,mkdtemp,readdir,realpath,rm} from 'node:fs/promises';
import {basename,dirname,isAbsolute,join,relative,resolve,sep} from 'node:path';
import {homedir,tmpdir} from 'node:os';

const within=(root,path)=>{const name=relative(root,path);return name===''||(!isAbsolute(name)&&name!=='..'&&!name.startsWith('..'+sep));};
async function cleanAncestors(path){
 for(let current=path;;current=dirname(current)){
  try{await lstat(join(current,'node_modules'));return false;}catch(error){if(error.code!=='ENOENT')throw error;}
  if(dirname(current)===current)return true;
 }
}
async function scratchDirectory(){
 const candidates=[tmpdir(),...(process.platform==='win32'?[join(homedir(),'AppData/Local/Temp'),...(process.env.SystemRoot?[join(process.env.SystemRoot,'Temp')]:[])]:['/tmp'])];
 for(const candidate of [...new Set(candidates)]){
  let base;try{base=await realpath(candidate);}catch{continue;}
  if(!await cleanAncestors(base))continue;
  try{return await realpath(await mkdtemp(join(base,'suffice-installed-smoke-')));}catch{continue;}
 }
 throw Error('No isolated smoke directory without ancestor dependencies is available');
}

// Installed verification must not be able to resolve missing workspace packages
// from an ancestor of the input build. Preserve framework links as literal
// relative links, then reject any link that escapes this private copy.
export async function isolatePackagedApp(input){
 const binary=await realpath(resolve(input));
 const macRoot=dirname(dirname(dirname(binary)));
 const source=/\.app$/i.test(macRoot)?macRoot:dirname(binary);
 const root=await scratchDirectory();
 const destination=join(root,basename(source));
 try{
  await cp(source,destination,{recursive:true,dereference:false,verbatimSymlinks:true,preserveTimestamps:true});
  async function validate(directory){
   for(const item of await readdir(directory,{withFileTypes:true})){
    const path=join(directory,item.name),info=await lstat(path);
    if(info.isSymbolicLink()){
     if(!within(destination,await realpath(path)))throw Error('Packaged application has an external or broken dependency link: '+relative(destination,path));
    }else if(info.isDirectory())await validate(path);
   }
  }
  await validate(destination);
  if(!await cleanAncestors(root))throw Error('Smoke scratch gained ancestor dependencies during copying');
  return {root,application:destination,binary:join(destination,relative(source,binary)),async cleanup(){await rm(root,{recursive:true,force:true});}};
 }catch(error){await rm(root,{recursive:true,force:true});throw error;}
}
