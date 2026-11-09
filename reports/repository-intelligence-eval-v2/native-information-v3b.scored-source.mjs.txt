import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,relative} from 'node:path';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import {hash} from '../src/workspace.mjs';
import {snapshot,initializeWorkspaceGit} from '../src/intelligence-eval.mjs';
import {copySource,linkDependencies} from '../src/native-intelligence-eval.mjs';
import {createNavigation} from '../packages/cli/src/navigation.mjs';
import {createIntelligence} from '../packages/cli/src/intelligence/graph.mjs';
import {pilotRoot,pilotTask} from '../benchmarks/intelligence-hard-pilot/tasks.mjs';
import {svelteRoot,record as svelteRecord} from '../src/svelte-intelligence-pilot.mjs';
const root=process.cwd(),ledger=JSON.parse(await readFile(resolve(root,'reports/repository-intelligence-eval-v2/spending.json'),'utf8'));
if(ledger.entries.some(e=>e.state==='dispatched'))throw new Error('Run information measurements after all active inference, not alongside benchmark attempts');
// Independent semantic oracle: the actual compiler version provisioned for Svelte.
const require=createRequire(import.meta.url),ts=require(resolve(svelteRoot,'dependencies/node_modules/typescript/lib/typescript.js'));
if(typeof ts.isTypeNode!=='function')throw new Error('Oracle compiler lacks type-context classification; do not label type-only uses as runtime references');
const normalize=p=>p.replaceAll('\\','/');
// A shorthand property's own symbol names the property, not the value binding.
// Ask the checker for that binding before following import aliases.
const bindingSymbol=(checker,node)=>node.parent?.kind===ts.SyntaxKind.ShorthandPropertyAssignment&&node.parent.name===node?checker.getShorthandAssignmentValueSymbol(node.parent):checker.getSymbolAtLocation(node);
const score=(predicted,gold)=>{const p=new Set(predicted),g=new Set(gold),tp=[...p].filter(x=>g.has(x)).length;return {predicted:[...p].sort(),gold:[...g].sort(),tp,fp:p.size-tp,fn:g.size-tp,precision:p.size?tp/p.size:null,recall:g.size?tp/g.size:null};};
function runtimeIdentifier(node){
  for(let p=node.parent;p;p=p.parent){
    if([ts.SyntaxKind.InterfaceDeclaration,ts.SyntaxKind.TypeAliasDeclaration].includes(p.kind))return false;
    if(p.kind===ts.SyntaxKind.HeritageClause&&p.token===ts.SyntaxKind.ImplementsKeyword)return false;
    const classExtends=p.kind===ts.SyntaxKind.ExpressionWithTypeArguments&&p.parent?.token===ts.SyntaxKind.ExtendsKeyword&&p.parent.parent?.kind===ts.SyntaxKind.ClassDeclaration;
    if(!classExtends&&typeof ts.isTypeNode==='function'&&ts.isTypeNode(p))return false;
  }
  return true;
}
// Validate the oracle/filter against known alias, type-only, shadow and property
// cases before using it to label a production tree. No model participates.
const checkRoot=resolve(svelteRoot,'oracle-self-check');await mkdir(checkRoot,{recursive:true});
await writeFile(resolve(checkRoot,'a.ts'),'export class Target {}\nexport default Target;\n');
await writeFile(resolve(checkRoot,'b.ts'),"import DefaultTarget, {Target as Aliased} from './a';\nnew DefaultTarget();\ntype Only = Aliased;\nfunction local(Aliased:()=>void){Aliased();}\nconst key={Target:1};\nkey.Target;\nconst text='Target';\nexport {Aliased as Exported};\nclass Child extends DefaultTarget {}\nclass Shape implements Aliased {}\nconst object = { Aliased };\n");
const checkProgram=ts.createProgram(['a.ts','b.ts'].map(p=>resolve(checkRoot,p)),{noLib:true,noEmit:true,module:ts.ModuleKind.ES2015,moduleResolution:ts.ModuleResolutionKind.NodeJs});
const checkChecker=checkProgram.getTypeChecker(),checkA=checkProgram.getSourceFile(resolve(checkRoot,'a.ts')),checkB=checkProgram.getSourceFile(resolve(checkRoot,'b.ts'));
const checkTarget=checkChecker.getSymbolAtLocation(checkA.statements[0].name),checkLines=new Set();
function checkVisit(node){
  if(node.kind===ts.SyntaxKind.Identifier&&runtimeIdentifier(node)){
    let symbol=bindingSymbol(checkChecker,node);const seen=new Set();
    while(symbol&&(symbol.flags&ts.SymbolFlags.Alias)&&!seen.has(symbol)){seen.add(symbol);symbol=checkChecker.getAliasedSymbol(symbol);}
    if(symbol===checkTarget)checkLines.add(checkB.getLineAndCharacterOfPosition(node.getStart(checkB)).line+1);
  }
  ts.forEachChild(node,checkVisit);
}
checkVisit(checkB);
const oracleSelfCheck={expectedLines:[1,2,8,9,11],observedLines:[...checkLines].sort((a,b)=>a-b)};
if(JSON.stringify(oracleSelfCheck.expectedLines)!==JSON.stringify(oracleSelfCheck.observedLines))throw new Error('Compiler oracle self-check failed: '+JSON.stringify(oracleSelfCheck));
const reports=[];
for(const corpus of [{id:'axios',directory:pilotRoot,production:p=>p.startsWith('lib/'),repository:pilotTask.repository},{id:'svelte',directory:svelteRoot,production:p=>p.startsWith('src/')&&!p.endsWith('/__test__.js'),repository:svelteRecord.repo}]){
  const receipt=JSON.parse(await readFile(resolve(corpus.directory,'validation.json'),'utf8'));
  if(!receipt.valid)throw new Error('Unvalidated information corpus');
  const baseline=resolve(corpus.directory,'baseline'),workspace=resolve(corpus.directory,'information-corpus-'+Date.now());await mkdir(workspace,{recursive:true});await copySource(baseline,workspace);
  if(JSON.stringify(await snapshot(workspace))!==JSON.stringify(receipt.baselineHashes))throw new Error('Information input differs from frozen source');
  await initializeWorkspaceGit(workspace);await linkDependencies(workspace,resolve(corpus.directory,'dependencies'));
  const sourcePaths=Object.keys(receipt.baselineHashes).filter(p=>corpus.production(p)&&/\.[jt]s$/.test(p)),sources=new Set(sourcePaths);
  const options={allowJs:true,checkJs:false,noEmit:true,target:ts.ScriptTarget.ES2017,module:ts.ModuleKind.ES2015,moduleResolution:ts.ModuleResolutionKind.NodeJs,skipLibCheck:true};
  const started=performance.now(),program=ts.createProgram(sourcePaths.map(p=>resolve(workspace,p)),options),checker=program.getTypeChecker();
  const pathOf=sf=>normalize(relative(workspace,sf.fileName));
  const alias=symbol=>{const seen=new Set();while(symbol&&(symbol.flags&ts.SymbolFlags.Alias)&&!seen.has(symbol)){seen.add(symbol);symbol=checker.getAliasedSymbol(symbol);}return symbol;};
  const candidates=new Map();
  for(const sf of program.getSourceFiles().filter(sf=>sources.has(pathOf(sf)))){
    if(!sf.symbol)continue;
    for(const exported of checker.getExportsOfModule(sf.symbol)){
      const symbol=alias(exported);
      const declaration=symbol?.declarations?.find(d=>d.name?.kind===ts.SyntaxKind.Identifier&&[ts.SyntaxKind.FunctionDeclaration,ts.SyntaxKind.ClassDeclaration,ts.SyntaxKind.VariableDeclaration].includes(d.kind));
      if(!declaration)continue;
      const file=declaration.getSourceFile(),path=pathOf(file);if(!sources.has(path))continue;
      const offset=declaration.name.getStart(file),name=declaration.name.text,id=path+':'+offset+':'+name;
      candidates.set(symbol,{id,name,path,line:file.getLineAndCharacterOfPosition(offset).line+1,offset,kind:ts.SyntaxKind[declaration.kind],gold:new Set(),oracleEvidence:[]});
    }
  }
  for(const sf of program.getSourceFiles().filter(sf=>sources.has(pathOf(sf)))){
    const path=pathOf(sf),visit=node=>{
      if(node.kind===ts.SyntaxKind.Identifier&&runtimeIdentifier(node)){
        const target=candidates.get(alias(bindingSymbol(checker,node)));
        if(target&&target.path!==path){const offset=node.getStart(sf),line=sf.getLineAndCharacterOfPosition(offset).line+1;target.gold.add(path+':'+line);target.oracleEvidence.push({path,line,offset,length:node.getWidth(sf),syntax:ts.SyntaxKind[node.parent.kind],fileVersion:receipt.baselineHashes[path]});}
      }
      ts.forEachChild(node,visit);
    };visit(sf);
  }
  const ordered=[...candidates.values()].sort((a,b)=>hash(corpus.id+'/'+a.id).localeCompare(hash(corpus.id+'/'+b.id)));
  const selected=[...ordered.filter(c=>c.gold.size).slice(0,8),...ordered.filter(c=>!c.gold.size).slice(0,4)];
  const oracleMs=performance.now()-started;
  const navigation=createNavigation({workspace,includeTypeScript:true}),tool=navigation.find(t=>t.name==='symbol_references');
  const engine=createIntelligence({workspace,cacheDir:resolve(corpus.directory,'information-cache')}),graph=await engine.snapshot(),rows=[];
  for(const target of selected){
    let globalStatus;try{const value=(await tool.execute('global-information',{name:target.name,limit:80})).structuredContent;globalStatus={status:'returned',total:value.total,omitted:value.omitted};}catch(e){globalStatus={status:'error',error:e.message};}
    const before=performance.now(),out={references:[],errors:[],unparsed:[],omitted:0};
    // The existing global AST query aborts on an oversized file. Its existing
    // per-path API permits a production-only fallback, evaluated separately.
    for(const path of sourcePaths){try{const value=(await tool.execute('path-information',{name:target.name,path,limit:80})).structuredContent;out.references.push(...value.references);out.unparsed.push(...value.unparsed);out.omitted+=value.omitted;}catch(e){out.errors.push({path,error:e.message});}}
    const astMs=performance.now()-before;
    const kinds=target.kind==='FunctionDeclaration'?['function']:target.kind==='ClassDeclaration'?['class']:['const','let','var'];
    const matches=graph.symbols.filter(s=>s.path===target.path&&s.name===target.name&&!s.import&&kinds.includes(s.kind));
    const symbol=matches.length===1?matches[0]:null;
    const predicted=symbol?graph.edges.filter(e=>['reference','call','imports','exports'].includes(e.kind)&&e.to===symbol.id&&e.evidence.path!==target.path&&sources.has(e.evidence.path)).map(e=>e.evidence.path+':'+e.evidence.line):[];
    const baseline=(out.references??[]).filter(r=>r.path!==target.path&&sources.has(r.path)).map(r=>r.path+':'+r.line);
    const literal=[];for(const path of sourcePaths)if(path!==target.path){const lines=(await readFile(resolve(workspace,path),'utf8')).split('\n');for(let i=0;i<lines.length;i++)if(lines[i].includes(target.name))literal.push(path+':'+(i+1));}
    rows.push({...target,gold:undefined,baseline:score(baseline,target.gold),literal:score(literal,target.gold),graph:score(predicted,target.gold),graphSymbolStatus:symbol?'indexed':matches.length?'ambiguous':'unparsed-or-missing',astMs,baselineGlobal:globalStatus,baselineScopedQueries:sourcePaths.length,baselineMetadata:Object.fromEntries(Object.entries(out).filter(([k])=>k!=='references'))});
  }
  const relativeResolved=graph.edges.filter(e=>e.kind==='module'&&sources.has(e.evidence.path)&&e.specifier?.startsWith('.')).length;
  const relativeUnresolved=graph.unresolved.filter(e=>e.kind==='module'&&sources.has(e.evidence.path)&&e.specifier?.startsWith('.'));
  const totals=Object.fromEntries(['baseline','literal','graph'].map(arm=>{const sum=k=>rows.reduce((n,r)=>n+r[arm][k],0),tp=sum('tp'),fp=sum('fp'),fn=sum('fn');return [arm,{tp,fp,fn,precision:tp+fp?tp/(tp+fp):null,recall:tp+fn?tp/(tp+fn):null}];}));
  reports.push({corpus:corpus.id,repository:corpus.repository,baselineManifestSha256:hash(JSON.stringify(receipt.baselineHashes)),compilerVersion:ts.version,compilerOptions:options,selection:'Hash-ordered first eight exported named definitions with cross-file runtime references and first four with none, selected by oracle before retrieving either candidate tool. Not a random repository population sample.',candidateCount:candidates.size,selectedCount:selected.length,oracleMs,graphMetrics:graph.metrics,coverage:{productionFiles:sources.size,relativeResolved,relativeUnresolved:relativeUnresolved.length,reasons:Object.fromEntries([...new Set(relativeUnresolved.map(e=>e.reason))].map(reason=>[reason,relativeUnresolved.filter(e=>e.reason===reason).length])),unparsedProductionFiles:graph.files.filter(f=>sources.has(f.path)&&f.error)},totals,cases:rows});
}
const implementation={sourceHead:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),node:process.version,files:{}};
for(const path of ['scripts/intelligence-native-information.mjs','packages/cli/src/navigation.mjs','packages/cli/src/intelligence/graph.mjs','packages/cli/src/intelligence/parse.mjs','packages/cli/src/intelligence/source-files.mjs','packages/cli/src/intelligence/module-resolution.mjs','package-lock.json'])implementation.files[path]=hash(await readFile(resolve(root,path)));
const report={kind:'compiler-resolved-source-binding-line-retrieval',implementation,oracleSelfCheck,reports,limitations:['Compiler symbol identity is a static-analysis oracle, not runtime behavioral proof.','Scopes cover named exported definitions in two pinned production trees; anonymous exports and dynamic dispatch are not covered.','Oracle labels omit identifiers in type-only AST positions. Syntactic import/reexport bindings count as source linkage evidence; they are not necessarily emitted at runtime.','The AST tool returns syntactic candidates, which an LLM can inspect; false-positive candidates are not false exactness claims.','Global AST failure on oversized files is recorded separately. The baseline score aggregates its existing per-path API over production files, capped at 80 results per file; literal search is a separate source-line diagnostic.','Graph predictions use stored resolved edges. This is information accuracy analysis, not a resource-matched tool-call comparison.','Oracle 2.7.2 full symbol checking and engine 5.9.3 module-path resolution share the TypeScript resolver family and could share bugs. Engine lexical analysis remains Acorn-based.','An empty graph prediction is not a proof of no dependencies; missing/unparsed definitions are explicitly reported.','Line retrieval does not validate every individual relationship on a line containing multiple references.','No foundation model is used to construct or score these labels.']};
await writeFile(resolve(process.argv[2]??'reports/repository-intelligence-eval-v2/native-information-v3.json'),JSON.stringify(report,null,2),{flag:'wx'});
console.log(JSON.stringify(reports.map(r=>({corpus:r.corpus,totals:r.totals,coverage:r.coverage,selected:r.selectedCount}))));
