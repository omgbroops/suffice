import {cp,mkdir,readFile,realpath,writeFile,access,chmod} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {dirname,resolve,relative,join,sep} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {nativeArtifactFiles} from '../rust-migration/native-artifact.mjs';
const root=fileURLToPath(new URL('../../',import.meta.url));
const read=async file=>JSON.parse(await readFile(file,'utf8'));
const exists=async file=>access(file).then(()=>true,()=>false);
const compatible=(list,value)=>!list||(!list.includes('!'+value)&&(!list.some(x=>!x.startsWith('!'))||list.includes(value)));
export async function stageDesktop(stage,{version='0.1.0-preview.20261115.1'}={}){
 stage=resolve(stage);await mkdir(stage,{recursive:true});if(await exists(join(stage,'package.json')))throw new Error('Stage must be a fresh directory: '+stage);
 const app=await read(join(root,'apps/desktop/package.json')),base=await read(join(root,'package.json')),cli=await read(join(root,'packages/cli/package.json'));
 const dependencies={...base.dependencies,...cli.dependencies,...Object.fromEntries(Object.entries(app.dependencies).filter(([name])=>name.startsWith('@fontsource/')))};delete dependencies['@suffice/harness'];
 const manifest={name:'suffice-desktop',productName:'Suffice',version,description:'Suffice desktop coding agent',author:'Suffice',license:'UNLICENSED',type:'module',main:'apps/desktop/electron/main.cjs',dependencies:{...dependencies,'@suffice/harness':'0.1.0'}};
 await writeFile(join(stage,'package.json'),JSON.stringify(manifest,null,2)+'\n');
 const filter=source=>!['.git','node_modules','test','tests','__tests__'].includes(source.split(/[\\/]/).at(-1))&&!/^(?:\.env(?:\..*)?|auth\.json|\.npmrc)$/i.test(source.split(/[\\/]/).at(-1));
 for(const path of ['apps/desktop/electron','apps/desktop/dist','apps/desktop/assets','apps/desktop/shared','packages/cli/src','packages/cli/bin','packages/harness'])await cp(join(root,path),join(stage,path),{recursive:true,dereference:true,filter});
 for(const name of await nativeArtifactFiles(join(root,'packages/cli/native'))){
  const source=join(root,'packages/cli/native',name);
  await mkdir(join(stage,'packages/cli/native'),{recursive:true});await cp(source,join(stage,'packages/cli/native',name));
 }
 for(const path of ['apps/desktop/src/settings-data.js','apps/desktop/src/backgrounds/presets.js','packages/cli/package.json','packages/cli/README.md','packages/cli/THIRD-PARTY-NOTICES.md']){await mkdir(dirname(join(stage,path)),{recursive:true});await cp(join(root,path),join(stage,path));}
 // Internal source imports keep their monorepo-relative layout. Expose a package
 // proxy instead of shipping workspace links that point outside the installation.
 const proxy=join(stage,'node_modules/@suffice/harness');await mkdir(proxy,{recursive:true});await writeFile(join(proxy,'package.json'),JSON.stringify({name:'@suffice/harness',version:'0.1.0',type:'module',exports:'./index.mjs'}));await writeFile(join(proxy,'index.mjs'),"export * from '../../../packages/harness/index.mjs';\n");
 const globals=new Map(),packages=[];
 async function locate(name,from){const req=createRequire(join(from,'package.json'));for(const directory of req.resolve.paths(name)||[]){const candidate=join(directory,name,'package.json');if(await exists(candidate))return realpath(dirname(candidate));}throw new Error('Missing runtime dependency '+name+' from '+from);}
 async function copyPackage(name,from,parent,optional=false){
  let source;try{source=await locate(name,from);}catch(error){if(optional)return;throw error;}
  const info=await read(join(source,'package.json'));if(!compatible(info.os,process.platform)||!compatible(info.cpu,process.arch)){if(optional)return;throw new Error('Runtime dependency does not support this host: '+name);}
  const current=globals.get(name);if(current?.source===source)return;
  const destination=join(current?parent:stage,'node_modules',name);if(!current)globals.set(name,{source,destination});
  if(packages.some(p=>p.destination===relative(stage,destination)))return;
  packages.push({name,version:info.version,destination:relative(stage,destination)});
  await mkdir(dirname(destination),{recursive:true});
  await cp(source,destination,{recursive:true,dereference:true,filter:file=>{
   if(!filter(file))return false;const path=relative(source,file).split(sep).join('/');
   if(name==='node-pty'&&path.startsWith('prebuilds/'))return path==='prebuilds'||path.split('/')[1]===process.platform+'-'+process.arch;
   if(name==='agent-desktop'&&path.startsWith('bin/')){const entry=path.split('/')[1];return entry==='agent-desktop'||entry.includes(process.platform+'-'+process.arch);}
   return true;
  }});
  for(const dependency of Object.keys(info.dependencies||{}))await copyPackage(dependency,source,destination);
  for(const dependency of Object.keys(info.optionalDependencies||{}))if(!Object.hasOwn(info.dependencies||{},dependency))await copyPackage(dependency,source,destination,true);
  for(const dependency of Object.keys(info.peerDependencies||{}))if(!Object.hasOwn(info.dependencies||{},dependency))await copyPackage(dependency,source,destination,true);
 }
 for(const name of Object.keys(dependencies))await copyPackage(name,root,stage);
 if(process.platform==='darwin')for(const path of ['build/Release/spawn-helper',`prebuilds/darwin-${process.arch}/spawn-helper`]){const helper=join(stage,'node_modules/node-pty',path);if(await exists(helper))await chmod(helper,0o755);}
 await writeFile(join(stage,'runtime-manifest.json'),JSON.stringify({version,platform:process.platform,arch:process.arch,packages},null,2)+'\n');
 // Missing optional automation packages must be caught before producing an installer.
 const req=createRequire(join(stage,'package.json')),browserRoot=dirname(req.resolve('agent-browser/package.json')),native=await import(pathToFileURL(join(browserRoot,'scripts/native.js'))),browser=native.findNativeBinary(browserRoot,native.nativeTarget());if(!browser)throw new Error('Packaged browser automation binary is missing');
 const desktopRoot=dirname(req.resolve('agent-desktop/package.json')),platform=req(join(desktopRoot,'lib/platform.js')),binary=join(desktopRoot,'bin',platform.resolve(process.platform,process.arch).binaryName);if(!await exists(binary))throw new Error('Packaged desktop automation binary is missing');
 console.log('Staged',packages.length,'runtime packages at',stage);return {stage,browser,desktop:binary,version};
}
