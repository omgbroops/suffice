import {resolve,relative,posix,isAbsolute} from 'node:path';
import {hash} from '../workspace.mjs';
const typeScriptSource=path=>/\.(?:ts|mts|cts)$/.test(path);

/** Resolve against the validated snapshot only. Never execute project plugins. */
export async function createModuleResolution(workspace,files,metadata,explicit){
  const typed=Object.keys(files).some(typeScriptSource);
  // Loading the compiler remains opt-in and lazy; off/JS-only CLI work avoids it.
  const ts=typed?(await import('typescript')).default:null;
  const version=hash(JSON.stringify({resolver:ts?.version??'explicit-paths',platform:process.platform,files:Object.entries(metadata).map(([p,v])=>[p,v.version,v.error??null])}));
  const configurationFiles=Object.entries(metadata).map(([path,value])=>({path,version:value.version,...(value.error?{error:value.error}:{})}));
  if(!ts)return {version,configurationFiles,description:'explicit existing paths',resolve:explicit};
  const canonical=path=>ts.sys.useCaseSensitiveFileNames?path:path.toLowerCase();
  const paths=new Map([...Object.keys(files),...Object.keys(metadata)].map(path=>[canonical(path),path])),directories=new Set(['']);
  for(const path of paths.values())for(let dir=posix.dirname(path);dir!=='.';dir=posix.dirname(dir))directories.add(canonical(dir));
  const local=absolute=>{const p=relative(workspace,absolute).replaceAll('\\','/');return p==='..'||p.startsWith('../')||isAbsolute(p)?null:p;};
  const original=absolute=>{const p=local(absolute);return p===null?undefined:paths.get(canonical(p));};
  const nearest=(path,name)=>{for(let dir=posix.dirname(path);;dir=posix.dirname(dir)){const p=paths.get(canonical(dir==='.'?name:dir+'/'+name));if(p&&metadata[p])return p;if(dir==='.')return null;}};
  const configurations=new Map(),memo=new Map();
  function configuration(path){
    if(configurations.has(path))return configurations.get(path);
    const value=metadata[path];let result;
    if(value.error)result={reason:'unreadable-tsconfig'};
    else{
      const parsed=ts.parseConfigFileTextToJson(path,value.source);
      if(parsed.error)result={reason:'invalid-tsconfig'};
      else if(Object.hasOwn(parsed.config,'extends'))result={reason:'tsconfig-extends-not-supported'};
      else if(parsed.config.compilerOptions?.plugins?.length)result={reason:'compiler-plugins-not-executed'};
      else{
        const converted=ts.convertCompilerOptionsFromJson(parsed.config.compilerOptions??{},resolve(workspace,posix.dirname(path)));
        result=converted.errors.length?{reason:'invalid-compiler-options'}:{options:converted.options};
      }
    }
    configurations.set(path,result);return result;
  }
  function resolveTyped(from,specifier,known){
    const direct=explicit(from,specifier,known),configPath=nearest(from,'tsconfig.json');
    // Do not replace an existing literal implementation with a type-source twin
    // (for example a.ts beside the explicitly imported a.js).
    if(direct.path&&!/\.d\.(?:ts|mts|cts)$/.test(direct.path))return direct;
    // A configured language rule is required before extending literal-path lookup.
    if(!configPath)return direct.path?direct:{reason:'typescript-config-not-found'};
    const config=configuration(configPath);if(config.reason)return direct.path?direct:{reason:config.reason};
    const options=config.options;let mode,unreadable=false;
    if([ts.ModuleResolutionKind.Node16,ts.ModuleResolutionKind.NodeNext].includes(options.moduleResolution)||[ts.ModuleKind.Node16,ts.ModuleKind.NodeNext].includes(options.module)){
      if(from.endsWith('.mts'))mode=ts.ModuleKind.ESNext;
      else if(from.endsWith('.cts'))mode=ts.ModuleKind.CommonJS;
      else{
        const packagePath=nearest(from,'package.json');let packageInfo={};
        if(packagePath){try{if(metadata[packagePath].error)throw new Error();packageInfo=JSON.parse(metadata[packagePath].source);}catch{return {reason:'unreadable-package-metadata'};}}
        mode=packageInfo.type==='module'?ts.ModuleKind.ESNext:ts.ModuleKind.CommonJS;
      }
    }else if(options.moduleResolution===ts.ModuleResolutionKind.Bundler||options.module===ts.ModuleKind.Preserve)mode=ts.ModuleKind.ESNext;
    const host={
      fileExists:path=>original(path)!==undefined,
      directoryExists:path=>{const p=local(path);return p!==null&&directories.has(canonical(p));},
      realpath:path=>{const p=original(path);return (p?resolve(workspace,p):path).replaceAll('\\','/');},
      readFile:path=>{const p=original(path),value=p?metadata[p]:undefined;if(value?.error)unreadable=true;return value?.source;},
      useCaseSensitiveFileNames:ts.sys.useCaseSensitiveFileNames
    };
    const found=ts.resolveModuleName(specifier,resolve(workspace,from),options,host,undefined,undefined,mode).resolvedModule;
    if(unreadable)return {reason:'module-metadata-unreadable'};
    if(!found)return {reason:'typescript-unresolved'};
    const path=original(found.resolvedFileName);
    if(!path||!known.has(path))return {reason:'resolved-outside-analyzed-files'};
    if(/\.d\.(?:ts|mts|cts)$/.test(path))return {reason:'declaration-only-resolution'};
    return {path,resolution:{kind:'typescript-compiler-module-path',compilerVersion:ts.version,configurationVersion:version,config:{path:configPath,fileVersion:metadata[configPath].version},mode:mode===ts.ModuleKind.ESNext?'import':mode===ts.ModuleKind.CommonJS?'require':'compiler-default'}};
  }
  return {version,configurationFiles,description:`TypeScript ${ts.version}, nearest in-workspace tsconfig.json; extends/plugins and declaration-only targets abstain`,resolve(from,specifier,known){
    if(!typeScriptSource(from))return explicit(from,specifier,known);
    const key=from+'\0'+specifier;if(!memo.has(key))memo.set(key,resolveTyped(from,specifier,known));return memo.get(key);
  }};
}
