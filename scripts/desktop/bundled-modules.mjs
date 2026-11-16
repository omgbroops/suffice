import {cp,lstat,mkdir,readFile,readdir,realpath,rm,writeFile} from 'node:fs/promises';
import {dirname,extname,join,relative,sep} from 'node:path';
import {parse} from 'acorn';

// electron-builder collects registry dependencies separately from source files.
// Install our workspace entry points after that collection, before code signing.
export async function writeBundledModules(directory){
 const root=await realpath(directory);
 const manifest=JSON.parse(await readFile(join(root,'package.json'),'utf8'));
 if(manifest.name!=='suffice-desktop'||manifest.main!=='apps/desktop/electron/main.cjs')throw Error('Expected the packaged Suffice application');
 await readFile(join(root,'packages/harness/index.mjs'));
 const cli=JSON.parse(await readFile(join(root,'packages/cli/package.json'),'utf8'));
 async function parent(path){
  let current=root;
  for(const part of relative(root,path).split(sep)){
   if(!part||part==='.'||part==='..')throw Error('Invalid bundled module path');
   current=join(current,part);
   try{const info=await lstat(current);if(!info.isDirectory()||info.isSymbolicLink())throw Error('Bundled module parent must be a real directory');}
   catch(error){if(error.code!=='ENOENT')throw error;await mkdir(current);}
  }
 }
 const harness=join(root,'node_modules/@suffice/harness');
 await parent(join(root,'node_modules/@suffice'));await rm(harness,{recursive:true,force:true});await mkdir(harness);
 await writeFile(join(harness,'package.json'),JSON.stringify({name:'@suffice/harness',version:'0.1.0',type:'module',exports:'./index.mjs'})+'\n');
 await writeFile(join(harness,'index.mjs'),"export * from '../../../packages/harness/index.mjs';\n");
 const self=join(root,'node_modules/@bycontinuity/suffice');
 await parent(join(root,'node_modules/@bycontinuity'));await rm(self,{recursive:true,force:true});
 await cp(join(root,'packages/cli'),self,{recursive:true,dereference:false,verbatimSymlinks:true});
 async function forward(directory){
  for(const entry of await readdir(directory,{withFileTypes:true})){
   const file=join(directory,entry.name);
   if(entry.isDirectory()){await forward(file);continue;}
   if(!entry.isFile()||!['.mjs','.cjs','.js'].includes(extname(file)))continue;
   const canonical=join(root,'packages/cli',relative(self,file));
   let target=relative(dirname(file),canonical).split(sep).join('/');if(!target.startsWith('.'))target='./'+target;
   const source=await readFile(canonical,'utf8'),hashbang=source.startsWith('#!')?source.slice(0,source.indexOf('\n')+1):'';
   const esm=extname(file)==='.mjs'||(extname(file)==='.js'&&cli.type==='module');
   if(esm){
    const body=parse(source,{ecmaVersion:'latest',sourceType:'module',allowHashBang:true}).body;
    const hasDefault=body.some(node=>node.type==='ExportDefaultDeclaration'||node.exported?.name==='default'||node.exported?.value==='default'||node.specifiers?.some(s=>s.exported?.name==='default'||s.exported?.value==='default'));
    await writeFile(file,hashbang+'export * from '+JSON.stringify(target)+';\n'+(hasDefault?'export {default} from '+JSON.stringify(target)+';\n':''));
   }else await writeFile(file,hashbang+'module.exports=require('+JSON.stringify(target)+');\n');
  }
 }
 await forward(self);
 return {harness:'0.1.0',cli:cli.version};
}
