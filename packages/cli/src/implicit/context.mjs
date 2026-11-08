import {readFile,stat} from 'node:fs/promises';
import {resolve,posix} from 'node:path';
import {repositoryPath,hash} from '../workspace.mjs';
import {indexJavaScript} from '../navigation.mjs';
import {countTokens,fitsPacket,packetRepresentation,TOKENIZER} from './tokens.mjs';

const sourcePattern=/\.(?:[cm]?[jt]s|[jt]sx)$/;
const testPath=path=>/(?:^|\/)(?:test|tests|__tests__)(?:\/|$)|\.(?:test|spec)\./.test(path);
const rangeKey=(path,line,text)=>`${path}:${line}:${hash(text)}`;
const relationKey=f=>hash([f.from,f.kind,f.to,f.location.path,f.location.line,f.evidenceText??f.excerpt].join('\n'));
const lineText=(text,line)=>text.split(/\r?\n/)[line-1]??'';

export class ImplicitSemanticContext {
  constructor({workspace,mode='semantic',context=false,impact=false,verification=false,maxPacketTokens=400,maxTotalTokens=1200,maxFiles=6,log=()=>{},graphFactory}={}){
    if(!['ast','semantic'].includes(mode))throw new Error('Unknown implicit context mode');
    for(const n of [maxPacketTokens,maxTotalTokens,maxFiles])if(!Number.isInteger(n)||n<1)throw new Error('Context bounds must be positive integers');
    this.workspace=workspace;this.mode=mode;this.flags={context,impact,verification};this.policy={maxPacketTokens:Math.min(maxPacketTokens,400),maxTotalTokens,maxFiles:Math.min(maxFiles,12)};
    this.log=log;this.graphFactory=graphFactory;this.graph=null;this.ast=new Map();this.seenLines=new Set();this.delivered=new Map();this.regions=new Map();this.totalTokens=0;this.serial=0;this.disposed=false;this.pending=Promise.resolve();
  }
  async source(path){const file=await repositoryPath(this.workspace,path);if((await stat(file)).size>128*1024)throw new Error('Implicit source exceeds 128 KiB');return readFile(file,'utf8');}
  noteRead({path,source,startLine=1,endLine=Infinity}){
    const lines=source.split(/\r?\n/);for(let i=Math.max(0,startLine-1);i<Math.min(lines.length,endLine);i++){this.seenLines.add(rangeKey(path,i+1,lines[i]));if(this.seenLines.size>5000)this.seenLines.delete(this.seenLines.values().next().value);}
  }
  eligible(path){return sourcePattern.test(path)&&!testPath(path);}
  async service(){if(!this.graph){const Factory=this.graphFactory??(await import('../semantic/graph.mjs')).SemanticGraph;this.graph=new Factory(this.workspace);}return this.graph;}
  async astEntry(path){const source=await this.source(path),version=hash(source);let entry=this.ast.get(path);if(entry?.version!==version){entry=indexJavaScript(source,path,{withBindings:true});this.ast.set(path,entry);if(this.ast.size>16)this.ast.delete(this.ast.keys().next().value);}return entry;}
  async astRegion(path){
    const entry=await this.astEntry(path),facts=[],unresolved=[];let expanded=[path];
    for(const imported of entry.imports.slice(0,this.policy.maxFiles-1)){
      if(!imported.module.startsWith('.')){unresolved.push({reason:'external_or_alias_module'});continue;}
      const base=posix.normalize(posix.join(posix.dirname(path),imported.module));let target;
      const stem=base.replace(/\.[cm]?js$/,'');
      for(const candidate of [...new Set([base,...['.ts','.js','.mjs','.tsx','/index.ts','/index.js'].map(ext=>stem+ext)])]){try{await repositoryPath(this.workspace,candidate);if((await stat(resolve(this.workspace,candidate))).isFile()){target=candidate;break;}}catch{}}
      if(!target){unresolved.push({reason:'unresolved_syntax_import'});continue;}
      const related=await this.astEntry(target);expanded.push(target);
      // Syntactic candidates only. No checker resolution or name-based call claim.
      for(const binding of imported.bindings??[]){
        const local=related.exportBindings.find(e=>e.exported===binding.imported)?.local,definition=related.symbols.find(s=>s.name===local);
        if(!definition){unresolved.push({reason:'unresolved_syntactic_binding'});continue;}
        facts.push({from:`${path}#module`,to:`${target}#ast:${definition.kind}:${definition.name}:${definition.start}`,kind:'syntax-import',location:{path,line:imported.line},fromNode:{path},toNode:{path:target},excerpt:lineText(related.source,definition.start),excerptLocation:{path:target,line:definition.start},certainty:'syntactic_candidate'});
      }
    }
    return {revision:hash([...this.ast].map(([p,e])=>p+e.version).join('\n')),roots:entry.symbols.map(n=>n.name).slice(0,3),facts,unresolved,expanded,unexpanded:Math.max(0,entry.imports.length-(this.policy.maxFiles-1)),omittedFacts:0,cacheHits:0,limited:false};
  }
  async region(path,span){
    if(this.mode==='ast')return this.astRegion(path);
    const g=await this.service(),r=g.region({path,...span,maxFiles:this.policy.maxFiles});
    return {...r,parseFailed:r.unresolved.some(u=>u.reason==='parse_error'&&u.location.path===path),facts:r.facts.map(f=>{
      let location=f.location,text=lineText(g.files.get(resolve(this.workspace,location.path))?.text??'',location.line);const evidenceText=text;
      if(this.seenLines.has(rangeKey(location.path,location.line,text))&&f.toNode.line){location={path:f.toNode.path,line:f.toNode.line};text=lineText(g.files.get(resolve(this.workspace,location.path))?.text??'',location.line);}
      return {...f,excerpt:text,excerptLocation:location,evidenceText};
    })};
  }
  verificationPlan(region,change){
    const tests=region.expanded.filter(testPath),modules=[...new Set(region.facts.flatMap(f=>[f.fromNode.path,f.toNode.path]))];
    return {tests:tests.slice(0,3),modules:modules.slice(0,6),typecheck:!!change?.typecheck,fullSuite:true,uncertain:region.limited||region.unresolved.length>0,coverage:'candidate imports/static references; no per-test coverage proof'};
  }
  packet(region,{event,path,change,plan}){
    const priorities={calls:0,'syntax-import':0,data_flow:1,type_dependency:2,references:3,exports:4,imports:5,reexports:6},pairs=new Set();
    const ranked=region.facts.map(f=>({...f,key:relationKey(f),alreadyRead:this.seenLines.has(rangeKey(f.excerptLocation.path,f.excerptLocation.line,f.excerpt))})).sort((a,b)=>Number(a.alreadyRead)-Number(b.alreadyRead)||priorities[a.kind]-priorities[b.kind]||a.location.path.localeCompare(b.location.path)||a.location.line-b.location.line||a.key.localeCompare(b.key)).filter(f=>{const pair=f.from+':'+f.to;if(pairs.has(pair))return false;pairs.add(pair);return true;});
    const prior=this.regions.get(path),keys=new Set(ranked.map(f=>f.key)),unseen=ranked.filter(f=>!f.alreadyRead&&!this.delivered.has(f.key));
    const novel=event==='edit'&&!this.flags.impact?[]:unseen.filter(f=>!prior?.observed?.has(f.key)||change?.kind==='contract'),cadenceSuppressed=unseen.length-novel.length;
    const observed=new Set([...(prior?.observed??[]),...keys]);while(observed.size>256)observed.delete(observed.values().next().value);
    const changed=!!prior&&[...prior.keys].some(k=>!keys.has(k));
    const planKey=plan?hash(JSON.stringify({tests:plan.tests,typecheck:plan.typecheck,uncertain:plan.uncertain})):null;
    const novelPlan=plan&&(!prior||prior.planKey!==planKey);
    const redundantFacts=ranked.length-unseen.length;
    const state={path,keys,observed,planKey:planKey??prior?.planKey,revision:region.revision};
    if(!novel.length&&!novelPlan)return {abstain:true,reason:cadenceSuppressed?'initial_region_already_served':ranked.length?'already_known_or_read':'no_cross_file_evidence',redundantFacts,cadenceSuppressed,omitted:unseen.length,_state:state};
    const header=`ctx@${region.revision.slice(0,12)} ${this.mode==='ast'?'syntax candidates':'static'}${event==='edit'?` ${change.kind}`:''}${changed?' delta':''}`;
    const rows=[],included=[];
    const render=omitted=>[header,...rows,`u:${region.unresolved.length} more-files:${region.unexpanded} omitted:${omitted+(region.omittedFacts??0)}${region.limited?' bounded':''}`].join('\n');
    let planDelivered=false;
    if(novelPlan){const row=`verify:${plan.tests.join(',')||'project tests'}${plan.typecheck?'; typecheck':''}; full suite${plan.uncertain?'; unresolved':''}`;rows.push(row);if(!fitsPacket(render(unseen.length),this.policy.maxPacketTokens))rows.pop();else planDelivered=true;}
    for(const fact of novel){
      const excerpt=fact.excerpt.trim(),quoted=excerpt.length>96?excerpt.slice(0,95)+'…':excerpt;
      const row=`${fact.from} ${fact.kind}> ${fact.to}\n${fact.excerptLocation.path}:${fact.excerptLocation.line} ${quoted}`;
      rows.push(row);if(!fitsPacket(render(unseen.length-included.length-1),this.policy.maxPacketTokens)){rows.pop();continue;}included.push(fact);
    }
    if(!rows.length)return {abstain:true,reason:'packet_budget',omitted:unseen.length,_state:state};
    const text=render(unseen.length-included.length),tokens=countTokens(text),visibleTokens=countTokens(packetRepresentation(text))+2;
    if(!fitsPacket(text,this.policy.maxPacketTokens)||this.totalTokens+visibleTokens>this.policy.maxTotalTokens)return {abstain:true,reason:'total_context_budget',omitted:novel.length};
    return {text,tokens,visibleTokens,byteTokenUpperBound:Buffer.byteLength(packetRepresentation(text))+2,tokenizer:TOKENIZER,revision:region.revision,keys:included.map(f=>f.key),omitted:unseen.length-included.length,redundantFacts,cadenceSuppressed,plan:planDelivered?plan:null,deliveredFacts:included.map(f=>({from:f.from,to:f.to,kind:f.kind,location:f.location,excerptLocation:f.excerptLocation,key:f.key})),_included:included,_state:{...state,planKey:planDelivered?planKey:prior?.planKey}};
  }
  commit(output){
    if(output._state){const {path,...state}=output._state;this.regions.set(path,state);}
    for(const fact of output._included??[]){this.delivered.set(fact.key,{revision:output.revision,evidenceHash:hash(fact.excerpt)});this.seenLines.add(rangeKey(fact.excerptLocation.path,fact.excerptLocation.line,fact.excerpt));}
    this.totalTokens+=output.visibleTokens??0;
    while(this.regions.size>64)this.regions.delete(this.regions.keys().next().value);while(this.delivered.size>256)this.delivered.delete(this.delivered.keys().next().value);
  }
  analyze(args){const next=this.pending.then(()=>this._analyze(args));this.pending=next.catch(()=>{});return next;}
  async _analyze({event,path,span,change,expectedHash}){
    const start=performance.now(),cpu=process.cpuUsage(),id=++this.serial;
    const audit={type:'implicit_context',id,event,path,reason:event==='read'?'source_read':'external_change',packetDelivered:false};
    try{
      if(this.disposed||!this.eligible(path)){audit.reason='irrelevant_path';return null;}
      if(event==='read'&&!this.flags.context){audit.reason='context_disabled';return null;}
      if(event==='edit'&&(!change?.external||!this.flags.impact&&!this.flags.verification)){audit.reason=change?.kind??'impact_disabled';return null;}
      const beforeGeneration=this.graph?.generation??0,r=await this.region(path,span),plan=event==='edit'&&this.flags.verification?this.verificationPlan(r,change):null;
      if(r.parseFailed){audit.reason='parse_failure';return null;}
      if(expectedHash&&hash(await this.source(path))!==expectedHash){audit.reason='stale_source_fallback';audit.staleDetected=true;return null;}
      const output=this.packet(r,{event,path,change,plan});
      if(this.graph){this.graph.refresh();if(this.graph.revision!==r.revision){audit.reason='stale_index_fallback';audit.staleDetected=true;return null;}}
      else for(const path of r.expanded)if(hash(await this.source(path))!==this.ast.get(path)?.version){audit.reason='stale_ast_fallback';audit.staleDetected=true;return null;}
      this.commit(output);const {_included,_state,...publicOutput}=output;
      Object.assign(audit,{reason:output.reason??'novel_cross_file_evidence',revision:r.revision,symbols:r.roots,expanded:r.expanded,cacheHits:r.cacheHits,unexpanded:r.unexpanded,unresolved:r.unresolved.length,limited:r.limited,updates:this.graph?.metrics.filter(m=>m.generation>beforeGeneration)??[],...publicOutput,packetDelivered:!!output.text});
      return output.text?publicOutput:null;
    }catch(error){audit.reason='analysis_fallback';audit.error=error.message;return null;}
    finally{audit.latencyMs=performance.now()-start;audit.cpuMicros=process.cpuUsage(cpu);audit.heapUsedBytes=process.memoryUsage().heapUsed;this.log(audit);}
  }
  async read({path,source,startLine=1,endLine=Infinity}){this.noteRead({path,source,startLine,endLine});return this.analyze({event:'read',path,span:{startLine,endLine},expectedHash:hash(source)});}
  async edit({path,before,after}){
    try{const {classifyChange}=await import('./change.mjs');const change=classifyChange(before,after,path);let first=0,last=0;while(first<before.length&&first<after.length&&before[first]===after[first])first++;while(last<before.length-first&&last<after.length-first&&before[before.length-last-1]===after[after.length-last-1])last++;const span={startLine:after.slice(0,first).split('\n').length,endLine:after.slice(0,after.length-last).split('\n').length};this.noteRead({path,source:after,...span});return this.analyze({event:'edit',path,span,change,expectedHash:hash(after)});}
    catch(error){this.log({type:'implicit_context',event:'edit',path,reason:'analysis_fallback',packetDelivered:false,error:error.message});return null;}
  }
  dispose(){this.graph?.dispose();this.ast.clear();this.seenLines.clear();this.delivered.clear();this.regions.clear();this.disposed=true;}
}
