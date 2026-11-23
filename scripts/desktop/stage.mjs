import {existsSync} from 'node:fs';
import {cp,mkdir,readFile,realpath,writeFile,access,chmod} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {dirname,resolve,relative,join,sep} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
const root=fileURLToPath(new URL('../../',import.meta.url));
const read=async file=>JSON.parse(await readFile(file,'utf8'));
const exists=async file=>access(file).then(()=>true,()=>false);
const compatible=(list,value)=>!list||(!list.includes('!'+value)&&(!list.some(x=>!x.startsWith('!'))||list.includes(value)));
// Dead weight in the production closure: source maps, typings, docs, and TypeScript beside its built .js. The pi packages read their own markdown/docs at runtime, so they keep theirs.
const keepDocs=name=>name.startsWith('@earendil-works/')||name==='pi-web-access';
const platformTag=process.platform+'-'+process.arch;
function prune(file,path,name){
 const base=path.split('/').at(-1);
 if(/\.(?:map|d\.[cm]?ts)$/.test(base))return false;
 if(/\.(?:md|markdown)$/i.test(base)&&!/^(?:license|licence)/i.test(base)&&!keepDocs(name)&&base.toLowerCase()!=='skill.md')return false;
 if(/\.[cm]?ts$/.test(base)&&['js','mjs','cjs'].some(x=>existsSync(file.slice(0,-/\.[cm]?ts$/.exec(base)[0].length)+'.'+x)))return false;
 if(!keepDocs(name)&&/^(?:docs|examples|__tests__|\.github)$/.test(base))return false;
 const parts=path.split('/'),i=parts.indexOf('prebuilds');if(i>=0&&parts[i+1]&&parts[i+1]!==platformTag)return false;
 const n=parts.indexOf('native');if(n>=0&&parts[n+1]&&['darwin','linux','win32'].includes(parts[n+1])&&parts[n+1]!==process.platform)return false;
 return true;
}
// Copies exactly what main.mjs needs at runtime into a fresh dir electron-builder packs as-is: built renderer, electron/, shared/, the two workspace packages and the production dependency closure.
export async function stageDesktop(stage,{version}){
 stage=resolve(stage);await mkdir(stage,{recursive:true});if(await exists(join(stage,'package.json')))throw new Error('Stage must be a fresh directory: '+stage);
 if(!await exists(join(root,'apps/desktop/dist/index.html')))throw new Error('Run bun run desktop:build first (apps/desktop/dist missing)');
 const base=await read(join(root,'package.json')),cli=await read(join(root,'packages/cli/package.json'));
 const dependencies={...base.dependencies,...cli.dependencies};
 const manifest={name:'suffice-desktop',productName:'Suffice',version,description:'Suffice desktop coding agent',author:'Suffice',license:'UNLICENSED',type:'module',main:'apps/desktop/electron/main.mjs',dependencies:{...dependencies,'@suffice/harness':'0.1.0'}};
 await writeFile(join(stage,'package.json'),JSON.stringify(manifest,null,2)+'\n');
 const filter=source=>!['.git','node_modules','test','tests','__tests__','dev.mjs','.DS_Store'].includes(source.split(/[\\/]/).at(-1))&&!/^(?:\.env(?:\..*)?|auth\.json|\.npmrc)$/i.test(source.split(/[\\/]/).at(-1));
 for(const path of ['apps/desktop/electron','apps/desktop/dist','apps/desktop/shared','packages/cli/src','packages/harness'])await cp(join(root,path),join(stage,path),{recursive:true,dereference:true,filter});
 await cp(join(root,'packages/cli/package.json'),join(stage,'packages/cli/package.json'));
 // Workspace links point outside the install; expose a proxy package instead (harness re-exports ../cli/src by relative path).
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
   if(!prune(file,path,name))return false;
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
 // Missing automation binaries must fail the build, not the first user.
 const req=createRequire(join(stage,'package.json')),browserRoot=dirname(req.resolve('agent-browser/package.json')),native=await import(pathToFileURL(join(browserRoot,'scripts/native.js'))),browser=native.findNativeBinary(browserRoot,native.nativeTarget());if(!browser)throw new Error('Packaged browser automation binary is missing');
 const desktopRoot=dirname(req.resolve('agent-desktop/package.json')),platform=req(join(desktopRoot,'lib/platform.js')),binary=join(desktopRoot,'bin',platform.resolve(process.platform,process.arch).binaryName);if(!await exists(binary))throw new Error('Packaged desktop automation binary is missing');
 console.log('Staged',packages.length,'runtime packages at',stage);return {stage,browser,desktop:binary,version};
}
