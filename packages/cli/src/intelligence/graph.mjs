import {readFile,writeFile,mkdir,rename,unlink,realpath} from 'node:fs/promises';
import {resolve,dirname,posix} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {randomUUID} from 'node:crypto';
import {readText,hash} from '../workspace.mjs';
import {analyzeFile} from './parse.mjs';
import {listIntelligenceSources} from './source-files.mjs';
import {createModuleResolution} from './module-resolution.mjs';

export const SCHEMA=2;
const moduleId=path=>`module:${path}`;
const exec=promisify(execFile);
const testFile=p=>/(?:^|\/)(?:test|tests|__tests__)\/|\.(?:test|spec)\.[cm]?[jt]sx?$/.test(p);
export function resolveModule(from,specifier,known){
  if(!specifier.startsWith('.'))return {reason:'external-or-configured-alias'};
  const target=posix.normalize(posix.join(posix.dirname(from),specifier));
  if(target==='..'||target.startsWith('../'))return {reason:'outside-repository'};
  // No guessed extension/index/package mapping: explicit existing paths only.
  return known.has(target)?{path:target}:{reason:'missing-or-implicit-module-path'};
}

export function linkGraph(entries,revision,{resolve:resolvePath=resolveModule}={}){
  const files=Object.values(entries),known=new Set(files.map(f=>f.path)),byPath=new Map(files.map(f=>[f.path,f]));
  const symbols=files.flatMap(f=>f.symbols),byId=new Map(symbols.map(s=>[s.id,s])),edges=[],unresolved=[];
  function exported(path,name,seen=new Set()){
    const key=path+'#'+name;if(seen.has(key))return {reason:'export-cycle'};seen.add(key);
    const f=byPath.get(path),matches=f?.exports.filter(e=>e.name===name)??[];
    if(f?.error)return {reason:'unparsed-module'};
    if(matches.length!==1)return {reason:'missing-or-ambiguous-export'};
    const e=matches[0];
    if(e.module){const m=resolvePath(path,e.module,known);if(!m.path)return m;const result=exported(m.path,e.local,seen);return {...result,via:[{...e.evidence,...(m.resolution?{resolution:m.resolution}:{})},...(result.via??[])]};}
    const ids=f.bindings[e.local]??[];if(ids.length!==1)return {reason:'missing-or-ambiguous-binding'};
    return binding(ids[0],seen,[e.evidence]);
  }
  function binding(id,seen=new Set(),via=[]){
    const symbol=byId.get(id);if(!symbol)return {reason:'missing-binding'};
    if(!symbol.import)return {id,via};
    if(symbol.import.name==='*')return {reason:'namespace-binding'};
    const m=resolvePath(symbol.path,symbol.import.module,known);if(!m.path)return m;
    const result=exported(m.path,symbol.import.name,seen);
    return {...result,via:[...via,{path:symbol.path,line:symbol.start,fileVersion:byPath.get(symbol.path).version,syntax:'ImportBinding',...(m.resolution?{resolution:m.resolution}:{})},...(result.via??[])]};
  }
  for(const f of files){
    for(const u of f.unresolved)unresolved.push({...u,status:'unresolved'});
    for(const symbol of f.symbols)edges.push({kind:'defines',from:moduleId(f.path),to:symbol.id,status:'resolved',evidence:{path:f.path,line:symbol.start,fileVersion:f.version,syntax:'declaration'}});
    for(const i of f.imports){
      const m=resolvePath(f.path,i.module,known),evidence={path:f.path,line:i.line,fileVersion:f.version,syntax:i.kind,...(m.resolution?{resolution:m.resolution}:{})};
      if(m.path)edges.push({kind:'module',from:moduleId(f.path),to:moduleId(m.path),status:'resolved',evidence,specifier:i.module});
      else unresolved.push({kind:'module',specifier:i.module,reason:m.reason,status:'unresolved',evidence});
    }
    for(const e of f.exports){const target=exported(f.path,e.name);if(target.id)edges.push({kind:'exports',name:e.name,from:moduleId(f.path),to:target.id,status:'resolved',evidence:e.evidence,via:target.via});else unresolved.push({kind:'export',name:e.name,reason:target.reason,status:'unresolved',evidence:e.evidence});}
    for(const s of f.symbols.filter(s=>s.import)){
      const target=binding(s.id),evidence={path:f.path,line:s.start,fileVersion:f.version,syntax:'ImportBinding'};
      if(target.id)edges.push({kind:'imports',from:s.id,to:target.id,status:'resolved',evidence,via:target.via});
      else unresolved.push({kind:'import',name:s.name,reason:target.reason,status:'unresolved',evidence});
    }
    for(const r of f.references){
      const target=r.binding?binding(r.binding):{reason:r.reason};
      if(target.id)edges.push({kind:r.kind,from:r.from,to:target.id,binding:r.binding,name:r.name,status:'resolved',semantics:'lexical-binding-not-runtime-value',evidence:r.evidence,via:target.via});
      else unresolved.push({...r,status:'unresolved',reason:target.reason});
    }
  }
  return {schema:SCHEMA,revision,files:files.map(({path,version,error})=>({path,version,...(error?{error}:{})})),symbols,edges,unresolved};
}

const empty=(path,version,error)=>({path,version,error,symbols:[],imports:[],exports:[],references:[],unresolved:[],bindings:{}});
export function changedSymbols(before,after){
  const a=new Map(before.symbols.map(s=>[s.id,s])),b=new Map(after.symbols.map(s=>[s.id,s]));
  return [...new Set([...a.keys(),...b.keys()])].filter(id=>a.get(id)?.hash!==b.get(id)?.hash).map(id=>({id,path:(b.get(id)??a.get(id)).path,name:(b.get(id)??a.get(id)).name,change:!a.has(id)?'added':!b.has(id)?'deleted':'modified'}));
}

/** Every public query refreshes; persisted entries only avoid reparsing, not validation. */
export function createIntelligence({workspace,cacheDir,log=()=>{}}){
  let entries={},loaded=false,queue=Promise.resolve(),baseline,current;
  let selection;
  const serialize=fn=>{const task=queue.then(fn);queue=task.catch(()=>{});return task;};
  async function scan(){
    const result={},metadata={};
    const sources=await listIntelligenceSources(workspace);selection=sources.selection;
    for(const path of sources.paths){
      try{const source=await readText(workspace,path);result[path]={source,version:hash(source)};}
      catch(e){if(e.code==='ENOENT')throw new Error('Repository changed during indexing; retry the query');result[path]={version:null,error:e.message};}
    }
    for(const path of sources.configurationPaths){try{const source=await readText(workspace,path);metadata[path]={source,version:hash(source)};}catch(e){if(e.code==='ENOENT')throw new Error('Repository changed during indexing; retry the query');metadata[path]={version:null,error:e.message};}}
    return {contents:result,metadata};
  }
  const manifest=contents=>hash(JSON.stringify(Object.entries(contents).map(([p,v])=>[p,v.version,v.error??null])));
  async function refresh(){
    const start=performance.now(),heapBefore=process.memoryUsage().heapUsed;
    const root=await realpath(workspace),cachePath=cacheDir?resolve(cacheDir,hash(root)+'.json'):null;
    if(!loaded){loaded=true;if(cachePath)try{const saved=JSON.parse(await readFile(cachePath,'utf8'));if(saved.schema===SCHEMA&&saved.root===root&&saved.nodeVersion===process.versions.node)entries=saved.entries;}catch(e){if(e.code!=='ENOENT')log({type:'graph_cache_ignored',reason:e.name});}}
    const {contents,metadata}=await scan(),next={};let parsedFiles=0;
    for(const [path,value]of Object.entries(contents)){
      if(value.error)next[path]=empty(path,null,value.error);
      else if(entries[path]?.version===value.version)next[path]=entries[path];
      else{parsedFiles++;try{next[path]=analyzeFile(value.source,path);}catch(e){next[path]=empty(path,value.version,`parse-failed: ${e.message}`);}}
    }
    const verification=await scan();if(manifest(contents)!==manifest(verification.contents)||manifest(metadata)!==manifest(verification.metadata))throw new Error('Repository changed during indexing; retry the query');
    const resolution=await createModuleResolution(workspace,contents,metadata,resolveModule);
    let head=null;try{head=(await exec('git',['-C',root,'rev-parse','HEAD'],{windowsHide:true,timeout:3000})).stdout.trim();}catch{}
    const revision={head,sourceContentVersion:manifest(contents),configurationVersion:resolution.version,contentVersion:hash(manifest(contents)+'\0'+resolution.version)};
    const unchanged=current?.revision.contentVersion===revision.contentVersion&&current?.revision.head===head;
    const graph=unchanged?{...current}:linkGraph(next,revision,resolution);
    graph.fileSelection=selection;
    graph.configurationFiles=resolution.configurationFiles;graph.moduleResolution=resolution.description;
    const entriesChanged=Object.keys(entries).length!==Object.keys(next).length||Object.keys(next).some(p=>next[p]!==entries[p]);
    entries=next;current=graph;baseline??=graph;
    let cacheBytes=0;
    if(cachePath&&(!unchanged||entriesChanged)){
      const data=JSON.stringify({schema:SCHEMA,nodeVersion:process.versions.node,root,entries});cacheBytes=Buffer.byteLength(data);
      const temp=cachePath+'.'+randomUUID()+'.tmp';
      try{await mkdir(dirname(cachePath),{recursive:true});await writeFile(temp,data,{mode:0o600});await rename(temp,cachePath);}catch(e){log({type:'graph_cache_write_error',reason:e.name});}finally{await unlink(temp).catch(()=>{});}
    }
    if(unchanged)cacheBytes=current.metrics?.cacheBytes??cacheBytes;
    const graphBytes=unchanged?current.metrics.graphBytes:Buffer.byteLength(JSON.stringify(graph));
    graph.metrics={latencyMs:performance.now()-start,parsedFiles,fileCount:graph.files.length,cacheBytes,heapDeltaBytes:process.memoryUsage().heapUsed-heapBefore,graphBytes};
    log({type:'graph_refresh',revision,...graph.metrics});return graph;
  }
  function header(g){const unparsed=g.files.filter(f=>f.error);return {revision:g.revision,coverage:{indexedFiles:g.files.length,unparsed:unparsed.slice(0,20),omittedUnparsed:Math.max(0,unparsed.length-20),unresolvedCount:g.unresolved.length,fileSelection:g.fileSelection,moduleResolution:g.moduleResolution,configurationFiles:g.configurationFiles.slice(0,20),omittedConfigurationFiles:Math.max(0,g.configurationFiles.length-20),scope:'nonhidden nonsymlink JS/TS <=128 KiB; ignored untracked files excluded in independent Git roots; configured TS compiler paths or explicit ESM paths; no runtime coverage guarantee'},metrics:g.metrics};}
  function context(g,{name='',path,limit=12}={}){
    const matches=g.symbols.filter(s=>(!path||s.path===path)&&s.name.toLowerCase().includes(name.toLowerCase())),selected=matches.slice(0,limit),ids=new Set(selected.map(s=>s.id));
    const relationships=g.edges.filter(e=>ids.has(e.from)||ids.has(e.to));
    return {...header(g),symbols:selected,total:matches.length,omitted:Math.max(0,matches.length-limit),relationships:relationships.slice(0,80),omittedRelationships:Math.max(0,relationships.length-80),unresolved:g.unresolved.filter(e=>!path||e.evidence.path===path).slice(0,20)};
  }
  function impact(g,{paths,limit=40,offset=0}={},bounded=true){
    if(bounded&&(!Number.isSafeInteger(limit)||limit<1||limit>40||!Number.isSafeInteger(offset)||offset<0))throw new Error('Impact pagination requires limit 1-40 and a nonnegative integer offset');
    const changed=changedSymbols(baseline,g),versions=new Map(baseline.files.map(f=>[f.path,f.version]));
    const changedFiles=[...new Set([...baseline.files,...g.files].map(f=>f.path))].filter(p=>versions.get(p)!==g.files.find(f=>f.path===p)?.version);
    const configurationChanged=baseline.revision.configurationVersion!==g.revision.configurationVersion;
    const beforeConfig=new Map((baseline.configurationFiles??[]).map(f=>[f.path,f.version])),afterConfig=new Map(g.configurationFiles.map(f=>[f.path,f.version]));
    const configurationFilesChanged=[...new Set([...beforeConfig.keys(),...afterConfig.keys()])].filter(p=>beforeConfig.get(p)!==afterConfig.get(p));
    const configurationSeeds=configurationChanged?[...new Set([...baseline.files,...g.files].filter(f=>/\.(?:ts|mts|cts)$/.test(f.path)).map(f=>f.path))]:[];
    const seeds=[...new Set([...(paths??changedFiles),...configurationSeeds])],distances=new Map(seeds.map(p=>[p,{path:p,depth:0,status:'seed',evidence:[]}])),pending=[...seeds];
    // Include previous edges for deleted symbols/modules and removed imports.
    const edges=[...g.edges,...baseline.edges].filter(e=>e.kind==='module');
    for(let n=0;n<pending.length;n++)for(const e of edges)if(e.to===moduleId(pending[n])){
      const from=e.from.slice(7);if(!distances.has(from)){distances.set(from,{path:from,depth:distances.get(pending[n]).depth+1,status:'inferred',reason:'reverse-static-module-reachability',evidence:[e,...distances.get(pending[n]).evidence]});pending.push(from);}
    }
    const impacted=[...distances.values()];
    if(!bounded)return {seeds,impacted};
    const page=values=>values.slice(offset,offset+limit),total={seeds:seeds.length,changedFiles:changedFiles.length,changedSymbols:changed.length,impacted:impacted.length,configurationFilesChanged:configurationFilesChanged.length};
    return {...header(g),baselineRevision:baseline.revision,configurationChanged,configurationFilesChanged:page(configurationFilesChanged),seedReason:paths?'explicit-paths':configurationChanged?'changed-files-and-conservative-configuration-invalidation':'changed-files',seeds:page(seeds),changedFiles:page(changedFiles),changedSymbols:page(changed),impacted:page(impacted),total,omitted:impacted.length-page(impacted).length,omittedSeeds:seeds.length-page(seeds).length,omittedChangedFiles:changedFiles.length-page(changedFiles).length,omittedChangedSymbols:changed.length-page(changed).length,page:{offset,limit,nextOffset:Math.max(...Object.values(total))>offset+limit?offset+limit:null},warning:'Potential impact, not behavioral correctness. Unresolved dependencies may hide consumers. Configuration changes conservatively seed TS files. Arrays are paginated; check totals and omitted counts.'};
  }
  return {
    resetBaseline:()=>{baseline=undefined;},
    snapshot:()=>serialize(refresh),
    begin:()=>serialize(async()=>{baseline=await refresh();return header(baseline);}),
    get_symbol_context:args=>serialize(async()=>context(await refresh(),args)),
    get_impact_analysis:args=>serialize(async()=>impact(await refresh(),args)),
    get_relevant_tests:args=>serialize(async()=>{
      const g=await refresh(),result=impact(g,args,false),candidates=result.impacted.filter(i=>testFile(i.path));
      const tests=candidates.slice(0,args?.limit??30);
      const seedLimit=args?.limit??30;
      return {...header(g),seeds:result.seeds.slice(0,seedLimit),omittedSeeds:Math.max(0,result.seeds.length-seedLimit),tests,omitted:Math.max(0,candidates.length-tests.length),fallback:tests.length?'Run recommended tests and the project suite; static reachability is incomplete.':'No statically reachable tests. Use search and the project test suite.',commands:tests.map(t=>({runner:'unknown',path:t.path,reason:'Infer the runner from package/config; filenames do not establish an execution command.'}))};
    }),
    initial:query=>serialize(async()=>{
      // Generic CLI tasks often delegate the contract to README.md.
      let readme='';try{readme=(await readText(workspace,'README.md')).slice(0,12000);}catch{}
      query+='\n'+readme;
      const g=await refresh(),terms=[...new Set(query.toLowerCase().match(/[a-z_$][\w$]*/g)??[])].filter(t=>t.length>2);
      const ranked=g.symbols.map(s=>({s,score:terms.reduce((n,t)=>n+(s.name.toLowerCase().includes(t)?4:0)+(s.path.toLowerCase().includes(t)?1:0),0)})).filter(x=>x.score>0).sort((a,b)=>b.score-a.score||a.s.id.localeCompare(b.s.id)).slice(0,8);
      return {...header(g),selection:'inferred lexical task match; inspect source and search if irrelevant',symbols:ranked.map(x=>x.s),relationships:g.edges.filter(e=>ranked.some(x=>x.s.id===e.to)).slice(0,24)};
    }),
    get current(){return current;}
  };
}
