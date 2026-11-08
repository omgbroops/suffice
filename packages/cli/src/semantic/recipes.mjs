import ts from 'typescript';
import {readFileSync,writeFileSync,renameSync,mkdirSync,existsSync,realpathSync,lstatSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {spawn} from 'node:child_process';

const hash = value => createHash('sha256').update(value).digest('hex');
const definitions = [
  {id:'rename_symbol',version:1,languages:['javascript','typescript','jsx','tsx'],parameters:{symbol:'exact symbol ID',newName:'identifier'},
    applicability:'Resolved local declaration with compiler rename locations; no ambiguous or omitted sources.',preconditions:['exact repository revision','complete admitted index','valid identifier','rename permitted by language service'],
    postconditions:['no new compiler diagnostics','new declaration exists','verification command passes']},
  {id:'update_import_path',version:1,languages:['javascript','typescript','jsx','tsx'],parameters:{path:'source path',specifier:'exact old module string',newSpecifier:'exact new module string',targetModule:'expected resolved target path'},
    applicability:'Static import/re-export resolving to an admitted module; caller explicitly selects new target.',preconditions:['exact repository revision','single matching static module literal','new target resolved and explicitly confirmed'],
    postconditions:['new import resolves to specified target','no new compiler diagnostics','verification command passes']},
  {id:'add_call_argument',version:1,languages:['javascript','typescript','jsx','tsx'],parameters:{symbol:'exact function ID',arity:'expected old argument count',argument:'JSON primitive literal'},
    applicability:'Explicit call-site migration adding one trailing literal to direct resolved calls. Signature is prepared separately.',preconditions:['exact repository revision','all matched calls have exact arity','no spread/optional/computed calls','no non-call function references'],
    postconditions:['matched calls each gain one argument','no new compiler diagnostics','verification command passes']},
].map(d=>({...d,parameterSchema:{type:'object',additionalProperties:false,required:Object.keys(d.parameters),properties:Object.fromEntries(Object.keys(d.parameters).map(key=>[key,key==='arity'?{type:'integer',minimum:0,maximum:30}:key==='argument'?{type:['string','number','boolean','null']}:{type:'string',minLength:1}]))},transformation:'TypeScript language-service spans or AST-selected spans',verification:'compiler diagnostic multiset + operation postcondition + explicit command',failure:'rollback only unchanged transaction-owned content; preserve concurrent edits with recovery journal'}));

function verifyCommand({command,args},cwd) {
  if (typeof command!=='string' || !command || !Array.isArray(args) || args.some(a=>typeof a!=='string')) throw new Error('Verification requires command and string args');
  return new Promise((accept,reject)=>{
    const start=performance.now(),child=spawn(command,args,{cwd,shell:false,windowsHide:true,stdio:['ignore','pipe','pipe']}); let output='';
    const timer=setTimeout(()=>child.kill(),60000);
    const collect=data=>{output=(output+String(data)).slice(-12000);}; child.stdout.on('data',collect);child.stderr.on('data',collect);
    child.on('error',e=>{clearTimeout(timer);reject(e);});
    child.on('close',(code,signal)=>{clearTimeout(timer);accept({command,args,code,signal,passed:code===0,output,latencyMs:performance.now()-start});});
  });
}
function diagnosticCounts(diagnostics) {
  const counts=new Map();for(const d of diagnostics){const key=JSON.stringify(d);counts.set(key,(counts.get(key)??0)+1);}return counts;
}

export class RecipeRegistry {
  constructor(graph,{verify=verifyCommand}={}) { this.graph=graph;this.verify=verify;this.busy=false; }
  search(query='') { return {recipes:definitions.filter(d=>JSON.stringify(d).toLowerCase().includes(query.toLowerCase())),candidatePromotion:'manual deterministic validation and regression evidence required; no automatic promotion'}; }
  safePath(path) {
    const file=resolve(this.graph.root,path); if (!this.graph.within(file) || !this.graph.files.has(file) || realpathSync(file)!==file || !lstatSync(file).isFile()) throw new Error('Recipe target is not an admitted regular repository source'); return file;
  }
  plan(recipe,parameters) {
    const g=this.graph, edits=[]; let postcondition;
    const add=(file,start,length,text)=>{file=this.safePath(file);edits.push({file,start,length,text});};
    if (recipe==='rename_symbol') {
      const {symbol,newName}=parameters, declaration=g.declarations.get(g.requireSymbol(symbol).id);
      if (typeof newName!=='string' || !ts.isIdentifierText(newName,ts.ScriptTarget.Latest) || ts.stringToToken(newName)!==undefined) throw new Error('New name must be a non-keyword identifier');
      if (!declaration?.name || !ts.isIdentifier(declaration.name) || newName===declaration.name.text) throw new Error('Rename requires a named, changed declaration');
      const file=declaration.getSourceFile().fileName, position=declaration.name.getStart(), info=g.service.getRenameInfo(file,position,{allowRenameOfImportPath:false});
      if (!info.canRename) throw new Error(info.localizedErrorMessage ?? 'Compiler refused rename');
      const locations=g.service.findRenameLocations(file,position,false,false,true);
      if (!locations?.length) throw new Error('No resolved rename locations');
      for(const location of locations) {
        const sf=g.program.getSourceFile(location.fileName);let at=sf;
        const walk=node=>{if(node.getStart(sf)<=location.textSpan.start&&node.end>=location.textSpan.start+location.textSpan.length){at=node;ts.forEachChild(node,walk);}};walk(sf);
        const collision=g.checker.getSymbolsInScope(at,ts.SymbolFlags.Value|ts.SymbolFlags.Type|ts.SymbolFlags.Namespace).find(s=>s.name===newName);
        if(collision)throw new Error('Rename would collide with an existing visible binding');
      }
      for (const location of locations) add(location.fileName,location.textSpan.start,location.textSpan.length,`${location.prefixText??''}${newName}${location.suffixText??''}`);
      postcondition=()=>[...g.nodes.values()].some(n=>n.path===g.path(file)&&n.name===newName);
    } else if (recipe==='update_import_path') {
      const {path,specifier,newSpecifier,targetModule}=parameters, file=this.safePath(path);
      if ([specifier,newSpecifier,targetModule].some(v=>typeof v!=='string'||!v) || specifier===newSpecifier) throw new Error('Explicit old/new paths and target module required');
      if (!g.resolveModule(specifier,file)) throw new Error('Old import must resolve');
      const target=g.resolveModule(newSpecifier,file); if (!target || g.path(target)!==targetModule) throw new Error('New import does not resolve to explicit target module');
      const sf=g.program.getSourceFile(file), literals=[];
      const walk=node=>{if((ts.isImportDeclaration(node)||ts.isExportDeclaration(node))&&node.moduleSpecifier&&ts.isStringLiteralLike(node.moduleSpecifier)&&node.moduleSpecifier.text===specifier)literals.push(node.moduleSpecifier);ts.forEachChild(node,walk);};walk(sf);
      if(literals.length!==1)throw new Error('Expected exactly one matching static import or re-export');
      const literal=literals[0];add(file,literal.getStart(),literal.getWidth(),JSON.stringify(newSpecifier));
      postcondition=()=>g.resolveModule(newSpecifier,file)===target;
    } else if (recipe==='add_call_argument') {
      const {symbol,arity,argument}=parameters;g.requireSymbol(symbol);
      if(!Number.isInteger(arity)||arity<0||arity>30||!(argument===null||['string','boolean','number'].includes(typeof argument))||typeof argument==='number'&&!Number.isFinite(argument))throw new Error('Expected arity and a finite JSON primitive literal');
      const analysis=g.allAnalysis(); if(analysis.limited)throw new Error('Relationship analysis is incomplete');
      const references=analysis.edges.filter(e=>e.to===symbol&&e.kind==='references'),callSites=[];
      for(const file of g.files.keys()){
        const sf=g.program.getSourceFile(file);if(!sf)continue;
        const walk=node=>{
          if(ts.isCallExpression(node)){
            const expr=node.expression,target=g.symbolId(ts.isPropertyAccessExpression(expr)?expr.name:expr);
            if(target===symbol){
              if(node.questionDotToken||ts.isPropertyAccessChain(expr)||ts.isElementAccessExpression(expr)||node.arguments.hasTrailingComma||node.arguments.length!==arity||node.arguments.some(ts.isSpreadElement))throw new Error('Ambiguous, optional, spread, trailing comma or mismatched call site');
              callSites.push(node);add(file,node.arguments.end,0,`${arity?', ':''}${JSON.stringify(argument)}`);
            }
          }ts.forEachChild(node,walk);
        };walk(sf);
      }
      if(!callSites.length)throw new Error('No matching calls');
      if(references.some(e=>!callSites.some(n=>resolve(n.getSourceFile().fileName)===resolve(g.root,e.location.path)&&e.location.start>=n.expression.getStart()&&e.location.start<n.expression.end)))throw new Error('Non-call references require manual migration');
      const count=callSites.length;
      postcondition=()=>{
        let actual=0;for(const file of g.files.keys()){const sf=g.program.getSourceFile(file);if(!sf)continue;const walk=n=>{if(ts.isCallExpression(n)){const expr=n.expression;if(g.symbolId(ts.isPropertyAccessExpression(expr)?expr.name:expr)===symbol&&n.arguments.length===arity+1)actual++;}ts.forEachChild(n,walk);};walk(sf);}return actual===count;
      };
    } else throw new Error('Unknown recipe');
    const changes=[];
    for(const file of new Set(edits.map(e=>e.file))){
      const before=g.files.get(file).text,ordered=edits.filter(e=>e.file===file).sort((a,b)=>b.start-a.start);let after=before,last=before.length+1;
      for(const e of ordered){if(e.start+e.length>last)throw new Error('Overlapping compiler edits');last=e.start;after=after.slice(0,e.start)+e.text+after.slice(e.start+e.length);}
      changes.push({path:g.path(file),before,after,beforeHash:hash(before),afterHash:hash(after)});
    }
    return {changes,postcondition};
  }
  async apply({recipe,parameters,expectedRevision,apply=false,verification}) {
    if(this.busy)throw new Error('Another recipe transaction is active');this.busy=true;
    const g=this.graph;let journal,plan,applied=[];
    try {
      g.refresh();if(g.revision!==expectedRevision)throw new Error('Revision precondition failed; refresh and review again');
      if(g.state().incomplete)throw new Error('Recipe requires a complete admitted index');
      if([...g.files.keys()].some(f=>g.program.getSyntacticDiagnostics(g.program.getSourceFile(f)).length))throw new Error('Recipe requires syntactically valid admitted sources');
      const definition=definitions.find(d=>d.id===recipe);if(!definition)throw new Error('Unknown recipe');
      if(!parameters||typeof parameters!=='object'||Array.isArray(parameters))throw new Error('Parameters must be an object');
      const allowed=Object.keys(definition.parameters);if(Object.keys(parameters).some(k=>!allowed.includes(k))||allowed.some(k=>!Object.hasOwn(parameters,k)))throw new Error('Parameters do not match recipe schema');
      plan=this.plan(recipe,parameters);
      if(!apply)return {revision:g.revision,recipe,version:definition.version,preview:true,changes:plan.changes,verificationRequired:true};
      if(!verification)throw new Error('Application requires an explicit independent verification command');
      const beforeDiagnostics=diagnosticCounts(g.diagnostics()),directory=resolve(g.root,'.suffice/recipes');
      // Reject directory links before writing a journal outside the source boundary.
      for(const p of [resolve(g.root,'.suffice'),directory])if(existsSync(p)&&realpathSync(p)!==p)throw new Error('Journal directory is a link');
      mkdirSync(directory,{recursive:true});journal={version:1,id:randomUUID(),recipe,recipeVersion:definition.version,parameters,sourceRevision:g.revision,createdAt:new Date().toISOString(),status:'prepared',changes:plan.changes};
      journal.path=resolve(directory,`${journal.id}.json`);this.record(journal);
      // A verifier is allowed to read the repository; changes it makes are detected.
      g.refresh();if(g.revision!==expectedRevision)throw new Error('Source changed while preparing recipe');
      for(const change of plan.changes){const file=this.safePath(change.path);if(hash(readFileSync(file))!==change.beforeHash)throw new Error('Concurrent edit before write');this.atomic(file,change.after);applied.push(change);}
      g.refresh();
      const afterDiagnostics=diagnosticCounts(g.diagnostics());
      if([...afterDiagnostics].some(([key,count])=>count>(beforeDiagnostics.get(key)??0)))throw new Error('Postcondition failed: new compiler diagnostics');
      if(!plan.postcondition())throw new Error('Operation postcondition failed');
      const transformedRevision=g.revision;
      journal.verification=await this.verify(verification,g.root);if(!journal.verification.passed)throw new Error('Independent verification failed');
      for(const c of plan.changes)if(hash(readFileSync(this.safePath(c.path)))!==c.afterHash)throw new Error('Verification changed transformed source');
      g.refresh();if(g.revision!==transformedRevision)throw new Error('Repository changed during verification');
      journal.status='candidate';journal.resultRevision=g.revision;journal.promotion={trusted:false,requirements:['deterministic applicability validation','regression tests','explicit review']};this.record(journal);
      return {revision:g.revision,applied:true,recipe,version:definition.version,changed:plan.changes.map(c=>c.path),candidate:journal.path,verification:journal.verification};
    } catch(error) {
      const rollback=[];
      for(const c of applied.reverse()){
        try{const file=this.safePath(c.path);if(hash(readFileSync(file))!==c.afterHash){rollback.push({path:c.path,status:'conflict_preserved'});continue;}this.atomic(file,c.before);rollback.push({path:c.path,status:'restored'});}catch(e){rollback.push({path:c.path,status:'recovery_required',error:e.message});}
      }
      if(journal){journal.status=rollback.some(r=>r.status!=='restored')?'recovery_required':'rolled_back';journal.error=error.message;journal.rollback=rollback;this.record(journal);}
      g.refresh();return {revision:g.revision,applied:false,error:error.message,rollback,journal:journal?.path};
    } finally {this.busy=false;}
  }
  atomic(file,text) {const temp=resolve(dirname(file),`.suffice-${randomUUID()}.tmp`);writeFileSync(temp,text,{flag:'wx',mode:lstatSync(file).mode});renameSync(temp,file);}
  record(journal) {writeFileSync(journal.path,JSON.stringify(journal,null,2),{mode:0o600});}
  inspectCandidate(path) {
    const directory=resolve(this.graph.root,'.suffice/recipes'),file=resolve(path);
    if(dirname(file)!==directory||realpathSync(file)!==file)throw new Error('Candidate must be a local regular recipe journal');
    const candidate=JSON.parse(readFileSync(file,'utf8')),definition=definitions.find(d=>d.id===candidate.recipe&&d.version===candidate.recipeVersion);
    const checks={knownRecipe:!!definition,successful:candidate.status==='candidate'&&candidate.verification?.passed===true,
      sourceRevision:typeof candidate.sourceRevision==='string'&&candidate.sourceRevision.length===64,
      patchHashes:Array.isArray(candidate.changes)&&candidate.changes.length>0&&candidate.changes.every(c=>hash(c.before)===c.beforeHash&&hash(c.after)===c.afterHash),
      provenance:typeof candidate.createdAt==='string'&&!!candidate.parameters};
    return {candidate:file,checks,validFoundation:Object.values(checks).every(Boolean),trusted:false,remaining:['independent deterministic regression examples','reviewed applicability boundaries','explicit promotion implementation (deferred)']};
  }
}
