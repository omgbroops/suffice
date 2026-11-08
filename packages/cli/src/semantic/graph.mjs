import ts from 'typescript';
import {readdirSync, readFileSync, realpathSync, statSync} from 'node:fs';
import {resolve, relative, dirname, isAbsolute, sep, matchesGlob} from 'node:path';
import {createHash} from 'node:crypto';

const digest = value => createHash('sha256').update(value).digest('hex');
const slash = value => value.replaceAll('\\', '/');
const sourcePattern = /\.(?:[cm]?[jt]s|[jt]sx)$/;
const ignored = new Set(['node_modules', 'dist', 'build', 'coverage', 'vendor']);
const relationshipKinds = new Set(['references', 'calls', 'reads', 'writes', 'type_dependency', 'data_flow', 'side_effect', 'imports', 'exports', 'reexports']);
export const CHANGE_KINDS = ['signature', 'return_type', 'parameters', 'exports', 'rename', 'implementation', 'mutation', 'side_effect'];
export const LIMITATIONS = [
  'Static relationships do not prove runtime behavior or test coverage.',
  'Dynamic imports, reflection, runtime injection, monkey-patching and computed accesses may be unresolved.',
  'One root tsconfig/jsconfig is used; project references and external package implementations are not indexed.',
  'Def-use tracks direct initializers, assignments and returns; it is not interprocedural alias or control-flow analysis.',
];

function declarationKind(node) {
  if (ts.isSourceFile(node)) return 'module';
  if (ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node) || ts.isArrowFunction(node)) return 'function';
  if (ts.isMethodDeclaration(node) || ts.isMethodSignature(node) || ts.isGetAccessor(node) || ts.isSetAccessor(node)) return 'method';
  if (ts.isClassDeclaration(node) || ts.isClassExpression(node)) return 'class';
  if (ts.isInterfaceDeclaration(node)) return 'interface';
  if (ts.isTypeAliasDeclaration(node) || ts.isEnumDeclaration(node)) return 'type';
  if (ts.isParameter(node) && ts.isIdentifier(node.name)) return 'parameter';
  if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) return node.initializer && ts.isFunctionLike(node.initializer) ? 'function' : 'binding';
  if (ts.isBindingElement(node) && ts.isIdentifier(node.name)) return 'binding';
  if ((ts.isPropertyDeclaration(node) || ts.isPropertySignature(node)) && node.name && !ts.isComputedPropertyName(node.name)) return 'binding';
  if (ts.isImportSpecifier(node) || ts.isImportClause(node) && node.name || ts.isNamespaceImport(node) || ts.isImportEqualsDeclaration(node)) return 'import';
  return null;
}

export class SemanticGraph {
  constructor(workspace, policy = {}) {
    this.root = realpathSync(workspace);
    this.policy = {maxFiles:800, maxBytes:12 * 1024 ** 2, maxFileBytes:512 * 1024, maxNodes:30000, maxEdges:100000, maxEntries:12000, ...policy};
    for (const value of Object.values(this.policy)) if (!Number.isInteger(value) || value < 1) throw new Error('Index bounds must be positive integers');
    this.files = new Map(); this.nodes = new Map(); this.cache = new Map(); this.modules = new Map();
    this.generation = 0; this.metrics = []; this.disposed = false;
    this.io={scans:0,bytes:0,files:0,scanMs:0};
  }

  path(file) { return slash(relative(this.root, file)); }
  within(file) { const p = relative(this.root, file); return !isAbsolute(p) && p !== '..' && !p.startsWith('..' + sep); }
  location(node) {
    const sf = node.getSourceFile(), start = node.getStart(sf), point = sf.getLineAndCharacterOfPosition(start);
    return {path:this.path(sf.fileName), line:point.line + 1, column:point.character + 1, start, length:node.getWidth(sf)};
  }

  // Hash all admitted inputs on every request. Timestamps alone miss same-size edits.
  // Symlinks and excluded directories are never followed; omissions are visible.
  scan() {
    const files = new Map(), metadata = new Map(), omitted = []; let bytes = 0, visited = 0;
    const visit = directory => {
      for (const entry of readdirSync(directory, {withFileTypes:true}).sort((a,b) => a.name.localeCompare(b.name))) {
        if (++visited > this.policy.maxEntries) { omitted.push({path:this.path(directory), reason:'entry_limit'}); return; }
        if (entry.name.startsWith('.') || ignored.has(entry.name)) continue;
        const file = resolve(directory, entry.name), path = this.path(file);
        if (entry.isSymbolicLink()) { omitted.push({path, reason:'symlink'}); continue; }
        if (entry.isDirectory()) { visit(file); if (visited > this.policy.maxEntries) return; continue; }
        const source = sourcePattern.test(path), config = /(?:^|\/)(?:[jt]sconfig[^/]*\.json|package\.json|jest\.config\.json)$/.test(path);
        if (!source && !config) continue;
        const size = statSync(file).size;
        if (size > this.policy.maxFileBytes || bytes + size > this.policy.maxBytes || files.size + metadata.size >= this.policy.maxFiles) {
          omitted.push({path, reason:'input_limit'}); continue;
        }
        const text = readFileSync(file, 'utf8'); bytes += size;
        (source ? files : metadata).set(file, {text, hash:digest(text)});
      }
    };
    visit(this.root);
    const coverage=resolve(this.root,'coverage/coverage-final.json');
    try {
      if(this.within(realpathSync(coverage))&&statSync(coverage).isFile()) {
        const size=statSync(coverage).size;
        if(size<=this.policy.maxFileBytes&&bytes+size<=this.policy.maxBytes&&files.size+metadata.size<this.policy.maxFiles){const text=readFileSync(coverage,'utf8');metadata.set(coverage,{text,hash:digest(text)});bytes+=size;}
        else omitted.push({path:'coverage/coverage-final.json',reason:'coverage_input_limit'});
      }
    } catch(error){if(!['ENOENT','ENOTDIR'].includes(error.code))throw error;}
    return {files, metadata, omitted, bytes};
  }

  refresh() {
    if (this.disposed) throw new Error('Semantic graph is disposed');
    const start = performance.now(), scan = this.scan();
    this.io.scans++;this.io.bytes+=scan.bytes;this.io.files+=scan.files.size+scan.metadata.size;this.io.scanMs+=performance.now()-start;
    const revision = digest([...scan.files, ...scan.metadata].map(([f,v]) => `${this.path(f)}:${v.hash}`).join('\n') + JSON.stringify(scan.omitted));
    if (revision === this.revision) return this.lastUpdate;
    const previous = this.files, previousGlobals=this.globalFiles??new Set(), first = !this.revision;
    const cachedDependencies=[...this.cache].map(([file,entry])=>[file,[...new Set(entry.edges.map(edge=>this.nodes.get(edge.to)?.path).filter(Boolean).map(path=>resolve(this.root,path)))]]);
    const changed = [...new Set([...previous.keys(), ...scan.files.keys()])].filter(f => previous.get(f)?.hash !== scan.files.get(f)?.hash);
    const metadataHash = digest([...scan.metadata].map(([f,v]) => `${f}:${v.hash}`).join('\n'));
    const configChanged = metadataHash !== this.metadataHash;
    this.files = scan.files; this.metadata = scan.metadata; this.omitted = scan.omitted; this.inputBytes = scan.bytes;
    this.revision = revision; this.metadataHash = metadataHash; this.generation++;
    if (!this.service || configChanged) {
      this.service?.dispose(); this.cache.clear();
      const configFile = ['tsconfig.json','jsconfig.json'].map(p => resolve(this.root,p)).find(p => scan.metadata.has(p));
      const configHost = {
        useCaseSensitiveFileNames:ts.sys.useCaseSensitiveFileNames,
        readDirectory:() => [...this.files.keys()],
        fileExists:f => this.files.has(resolve(f)) || this.metadata.has(resolve(f)),
        readFile:f => this.files.get(resolve(f))?.text ?? this.metadata.get(resolve(f))?.text,
      };
      let configured = {}, errors = [];
      if (configFile) {
        const json = ts.parseConfigFileTextToJson(slash(configFile), scan.metadata.get(configFile).text);
        if (json.error) errors.push(json.error);
        else { const parsed = ts.parseJsonConfigFileContent(json.config, configHost, dirname(configFile)); configured = parsed.options; errors.push(...parsed.errors); }
      }
      this.configErrors = errors.map(e => ({code:e.code, message:ts.flattenDiagnosticMessageText(e.messageText,' ')}));
      this.options = {target:ts.ScriptTarget.ESNext, module:ts.ModuleKind.NodeNext, moduleResolution:ts.ModuleResolutionKind.NodeNext,
        jsx:ts.JsxEmit.Preserve, ...configured, allowJs:true, checkJs:true, noEmit:true, noLib:true, skipLibCheck:true, disableSizeLimit:false};
      const host = {
        ...configHost, getCompilationSettings:() => this.options, getCurrentDirectory:() => this.root,
        getScriptFileNames:() => [...this.files.keys()], getScriptVersion:f => this.files.get(resolve(f))?.hash ?? '',
        getProjectVersion:() => String(this.generation),
        getScriptSnapshot:f => { const text = this.files.get(resolve(f))?.text; return text === undefined ? undefined : ts.ScriptSnapshot.fromString(text); },
        getDefaultLibFileName:() => '', directoryExists:d => [...this.files.keys()].some(f => f.startsWith(resolve(d) + sep)),
        realpath:f => resolve(f), getDirectories:() => [],
      };
      this.host = host; this.service = ts.createLanguageService(host, ts.createDocumentRegistry());
    }
    this.program = this.service.getProgram(); this.checker = this.program.getTypeChecker();
    this.nodes = new Map(); this.declarations = new Map(); this.nodeIds = new Map(); this.nodeLimit = false;
    this.testConfig={patterns:[],commands:[],unsupported:[]};this.coverageMetadata={status:'unavailable'};
    for(const [file,input]of this.metadata){
      try {
        const data=JSON.parse(input.text);
        if(this.path(file)==='package.json'&&typeof data.scripts?.test==='string')this.testConfig.commands.push(data.scripts.test);
        const config=this.path(file)==='package.json'?data.jest:this.path(file)==='jest.config.json'?data:null;
        if(config){if(Array.isArray(config.testMatch))this.testConfig.patterns.push(...config.testMatch.filter(p=>typeof p==='string'&&!p.startsWith('!')).map(p=>p.replace('<rootDir>/','')));if(config.testRegex)this.testConfig.unsupported.push('testRegex is not evaluated');}
        if(this.path(file)==='coverage/coverage-final.json')this.coverageMetadata={status:'istanbul_present_without_per_test_attribution',sourceFiles:Object.keys(data).length,sourceHash:input.hash};
      }catch{if(this.path(file)==='coverage/coverage-final.json')this.coverageMetadata={status:'malformed_coverage'};}
    }
    for (const file of this.files.keys()) {
      const sf = this.program.getSourceFile(file); if (!sf) continue;
      const fileId = this.path(file), test = /(?:^|\/)(?:test|tests|__tests__)(?:\/|$)|\.(?:test|spec)\.[^.]+$/.test(fileId)||this.testConfig.patterns.some(p=>matchesGlob(fileId,p));
      this.nodes.set(fileId, {id:fileId, name:fileId, kind:'file', path:fileId, line:1, test}); this.nodeIds.set(sf,fileId);
      const counts = new Map();
      const walk = (node, scope = fileId) => {
        const kind = declarationKind(node);
        if (kind && !ts.isSourceFile(node)) {
          // Function expressions assigned to variables share that binding's identity.
          const assigned = (ts.isFunctionExpression(node) || ts.isArrowFunction(node)) && ts.isVariableDeclaration(node.parent);
          if (assigned) this.nodeIds.set(node,this.nodeIds.get(node.parent));
          else {
            const name = node.name?.getText(sf) ?? 'default', base = `${scope}/${kind}:${name}`, count = counts.get(base) ?? 0;
            counts.set(base,count + 1); const id = `${base}:${count}`;
            if (this.nodes.size < this.policy.maxNodes) {
              this.nodes.set(id, {id,name,kind,...this.location(node)}); this.declarations.set(id,node); this.nodeIds.set(node,id);
            } else this.nodeLimit = true;
          }
        }
        const own = this.nodeIds.get(node), nextScope = own && !['parameter','import'].includes(kind) ? own : scope;
        ts.forEachChild(node, child => walk(child,nextScope));
      };
      ts.forEachChild(sf, node => walk(node));
    }
    const oldModules = this.modules; this.modules = new Map();
    for (const file of this.files.keys()) {
      const sf = this.program.getSourceFile(file), imports = [];
      const walk = node => {
        if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteralLike(node.moduleSpecifier)) {
          const target = this.resolveModule(node.moduleSpecifier.text, file);
          if (target) imports.push(target);
        }
        if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'require' && ts.isStringLiteralLike(node.arguments[0])) {
          const target = this.resolveModule(node.arguments[0].text,file); if (target) imports.push(target);
        }
        // Dynamic behavior remains unresolved, but a literal module is still an
        // invalidation dependency. Import types/JSDoc can affect checker results.
        if(ts.isCallExpression(node)&&node.expression.kind===ts.SyntaxKind.ImportKeyword&&ts.isStringLiteralLike(node.arguments[0])) {
          const target=this.resolveModule(node.arguments[0].text,file);if(target)imports.push(target);
        }
        if(ts.isImportTypeNode(node)&&ts.isLiteralTypeNode(node.argument)&&ts.isStringLiteralLike(node.argument.literal)) {
          const target=this.resolveModule(node.argument.literal.text,file);if(target)imports.push(target);
        }
        for(const doc of node.jsDoc??[])walk(doc);
        ts.forEachChild(node,walk);
      };
      if (sf) {walk(sf);for(const ref of sf.referencedFiles??[]){const target=resolve(dirname(file),ref.fileName);if(this.files.has(target))imports.push(target);}}this.modules.set(file,[...new Set(imports)]);
    }
    this.globalFiles=new Set([...this.files.keys()].filter(f=>{
      const sf=this.program.getSourceFile(f);if(!sf)return false;if(!ts.isExternalModule(sf))return true;
      let augmentation=false;const walk=node=>{if(ts.isModuleDeclaration(node)&&(ts.isStringLiteral(node.name)||node.flags&ts.NodeFlags.GlobalAugmentation))augmentation=true;ts.forEachChild(node,walk);};walk(sf);return augmentation;
    }));
    const invalidated = new Set(changed), globalChange = changed.some(f => previousGlobals.has(f)||this.globalFiles.has(f));
    // Global scripts can change ambient bindings anywhere. Invalidate conservatively.
    if (configChanged || globalChange) for (const f of this.files.keys()) invalidated.add(f);
    let grew = true;
    while (grew) { grew = false; for (const [f,deps] of [...oldModules,...this.modules,...cachedDependencies]) if (!invalidated.has(f) && deps.some(d => invalidated.has(d))) { invalidated.add(f); grew = true; } }
    for (const f of invalidated) this.cache.delete(f);
    // Reused entries contain immutable IDs/locations, never compiler AST objects.
    const metric = {kind:first?'initial':'incremental', generation:this.generation,revision, changed:changed.map(f=>this.path(f)), invalidated:[...invalidated].map(f=>this.path(f)),
      files:this.files.size, cachedFiles:this.cache.size, indexingMs:performance.now()-start, inputBytes:this.inputBytes,
      heapUsedBytes:process.memoryUsage().heapUsed, rssBytes:process.memoryUsage().rss};
    this.lastUpdate = metric; this.metrics.push(metric); if (this.metrics.length > 100) this.metrics.shift(); return metric;
  }

  resolveModule(specifier, file) {
    const target = ts.resolveModuleName(specifier, file, this.options, this.host).resolvedModule?.resolvedFileName;
    return target && this.files.has(resolve(target)) ? resolve(target) : null;
  }
  symbol(node) {
    if(!node)return null;
    let symbol = this.checker.getSymbolAtLocation(node);
    const seen = new Set();
    while (symbol?.flags & ts.SymbolFlags.Alias) { if (seen.has(symbol)) return null; seen.add(symbol); symbol = this.checker.getAliasedSymbol(symbol); }
    return symbol;
  }
  symbolId(node) {
    const symbol = this.symbol(node);
    for (const d of [symbol?.valueDeclaration,...(symbol?.declarations ?? [])]) if (d && this.nodeIds.has(d)) return this.nodeIds.get(d);
    return null;
  }
  owner(node) {
    for (let current = node; current; current = current.parent) if (this.nodeIds.has(current) && !['parameter','import'].includes(this.nodes.get(this.nodeIds.get(current))?.kind)) return this.nodeIds.get(current);
    return this.path(node.getSourceFile().fileName);
  }
  callOwner(node) {
    for(let current=node.parent;current;current=current.parent) {
      const id=this.nodeIds.get(current),kind=this.nodes.get(id)?.kind;
      if(['function','method','file'].includes(kind))return id;
    }
    return this.path(node.getSourceFile().fileName);
  }
  callTarget(node) {
    const declaration=this.checker.getResolvedSignature(node)?.declaration;
    if(declaration&&this.nodeIds.has(declaration))return this.nodeIds.get(declaration);
    const expression=node.expression;
    return this.symbolId(ts.isPropertyAccessExpression(expression)?expression.name:expression);
  }

  analyze(file) {
    if (this.cache.has(file)) return this.cache.get(file);
    const sf = this.program.getSourceFile(file), edges = [], unresolved = [], seen = new Set(), fileId = this.path(file);
    let limited = false;
    const add = (from,to,kind,node,evidence = 'compiler_symbol') => {
      if (!from || !to || !this.nodes.has(to)) return;
      const location = this.location(node), key = `${from}:${to}:${kind}:${location.start}`;
      if (seen.has(key)) return;
      if (edges.length >= this.policy.maxEdges) { limited = true; return; }
      seen.add(key); edges.push({from,to,kind,certainty:'resolved',evidence,location});
    };
    const unknown = (node,reason) => { if (unresolved.length < 100) unresolved.push({reason,certainty:'unresolved',location:this.location(node)}); else limited = true; };
    if (!sf) return {edges,unresolved:[{reason:'source_unavailable',location:{path:fileId}}],limited:true};
    const walk = node => {
      const id = this.nodeIds.get(node);
      if (id && node !== sf) { add(fileId,id,'defines',node,'declaration'); const parentOwner = this.owner(node.parent); if (parentOwner !== fileId && parentOwner !== id) add(parentOwner,id,'defines',node,'declaration'); }
      if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteralLike(node.moduleSpecifier)) {
        const target = this.resolveModule(node.moduleSpecifier.text,file);
        if (target) add(fileId,this.path(target),ts.isExportDeclaration(node)?'reexports':'imports',node.moduleSpecifier,'compiler_module_resolution');
        else unknown(node.moduleSpecifier,'external_or_unresolved_module');
      }
      if (id && this.nodes.get(id)?.kind === 'import' && node.name) { const target = this.symbolId(node.name); if (target) add(id,target,'imports',node.name); else unknown(node.name,'unresolved_import'); }
      if (ts.isCallExpression(node) || ts.isNewExpression(node)) {
        const expr = node.expression;
        if (expr.kind === ts.SyntaxKind.ImportKeyword || ts.isElementAccessExpression(expr)) unknown(node,'dynamic_call');
        else if (ts.isIdentifier(expr) && expr.text === 'require' && ts.isStringLiteralLike(node.arguments?.[0])) {
          const target = this.resolveModule(node.arguments[0].text,file);
          if (target) add(this.owner(node),this.path(target),'imports',node,'compiler_module_resolution'); else unknown(node,'external_or_unresolved_module');
        } else {
          const target = this.callTarget(node);
          if (target) add(this.callOwner(node),target,'calls',node); else unknown(node,'unresolved_call_or_external_effect');
        }
      }
      if (ts.isElementAccessExpression(node)) unknown(node,'computed_access');
      if (ts.isIdentifier(node) || ts.isPrivateIdentifier(node)) {
        const parent = node.parent, isName = parent.name === node && declarationKind(parent);
        if (!isName && !ts.isImportSpecifier(parent) && !ts.isExportSpecifier(parent)) {
          const target = this.symbolId(node);
          if (target) {
            let type = false; for (let p = node.parent; p && !ts.isStatement(p); p = p.parent) if (ts.isTypeNode(p)) { type = true; break; }
            const from = this.owner(node);
            add(from,target,type?'type_dependency':'references',node);
            const assignment = ts.isBinaryExpression(parent) && parent.left === node && parent.operatorToken.kind >= ts.SyntaxKind.FirstAssignment && parent.operatorToken.kind <= ts.SyntaxKind.LastAssignment;
            const update = (ts.isPrefixUnaryExpression(parent) || ts.isPostfixUnaryExpression(parent)) && [ts.SyntaxKind.PlusPlusToken,ts.SyntaxKind.MinusMinusToken].includes(parent.operator);
            const accessUpdate=ts.isPropertyAccessExpression(parent)&&parent.name===node&&(ts.isPrefixUnaryExpression(parent.parent)||ts.isPostfixUnaryExpression(parent.parent))&&[ts.SyntaxKind.PlusPlusToken,ts.SyntaxKind.MinusMinusToken].includes(parent.parent.operator);
            const propertyWrite = accessUpdate || ts.isPropertyAccessExpression(parent) && parent.name === node && ts.isBinaryExpression(parent.parent) && parent.parent.left === parent && parent.parent.operatorToken.kind >= ts.SyntaxKind.FirstAssignment && parent.parent.operatorToken.kind <= ts.SyntaxKind.LastAssignment;
            const write = assignment || update || propertyWrite;
            if(!type){add(from,target,write?'writes':'reads',node);if(update||accessUpdate||assignment&&parent.operatorToken.kind!==ts.SyntaxKind.EqualsToken)add(from,target,'reads',node);}
            if (write && from !== target && !target.startsWith(from + '/')) add(from,target,'side_effect',node,'potential_nonlocal_write');
            for (let p = node.parent; p && p !== sf; p = p.parent) {
              if (ts.isVariableDeclaration(p) && p.initializer && p.initializer.pos <= node.pos) { add(this.nodeIds.get(p),target,'data_flow',node,'initializer_def_use'); break; }
              if (ts.isReturnStatement(p)) { add(from,target,'data_flow',node,'return_value_dependency'); break; }
              if (ts.isBinaryExpression(p) && p.operatorToken.kind === ts.SyntaxKind.EqualsToken && p.right.pos <= node.pos) { add(this.symbolId(p.left),target,'data_flow',node,'assignment_def_use'); break; }
            }
          }
        }
      }
      if (ts.isBindingElement(node) && ts.isIdentifier(node.name) && ts.isObjectBindingPattern(node.parent)) {
        const declaration = node.parent.parent;
        if (ts.isVariableDeclaration(declaration) && declaration.initializer) {
          const prop = this.checker.getTypeAtLocation(declaration.initializer).getProperty((node.propertyName ?? node.name).getText(sf));
          const target = prop?.valueDeclaration && this.nodeIds.get(prop.valueDeclaration);
          if (target) add(id,target,'data_flow',node,'destructured_property');
        }
      }
      ts.forEachChild(node,walk);
    };
    walk(sf);
    const moduleSymbol = this.checker.getSymbolAtLocation(sf);
    if (moduleSymbol) for (const exported of this.checker.getExportsOfModule(moduleSymbol)) {
      const symbol = exported.flags & ts.SymbolFlags.Alias ? this.checker.getAliasedSymbol(exported) : exported;
      const declaration = symbol.valueDeclaration ?? symbol.declarations?.[0], target = this.nodeIds.get(declaration);
      if (target) add(fileId,target,'exports',exported.declarations?.[0] ?? declaration,'compiler_export');
    }
    for (const d of this.program.getSyntacticDiagnostics(sf)) unresolved.push({reason:'parse_error',code:d.code,message:ts.flattenDiagnosticMessageText(d.messageText,' '),location:{path:fileId,start:d.start??0,length:d.length??0}});
    const result = {edges, unresolved, limited}; this.cache.set(file,result); return result;
  }

  state() { return {revision:this.revision, incomplete:!!(this.omitted.length || this.nodeLimit || this.configErrors.length), omitted:this.omitted.slice(0,20), omittedCount:this.omitted.length, nodeLimit:this.nodeLimit, configErrors:this.configErrors, limitations:LIMITATIONS}; }
  symbols({query='',path,limit=30} = {}) {
    this.refresh(); const cap = this.bound(limit,80);
    const matches = [...this.nodes.values()].filter(n => n.kind !== 'file' && n.name.toLowerCase().includes(query.toLowerCase()) && (!path || n.path === path));
    return {...this.state(),matches:matches.slice(0,cap),total:matches.length,omittedMatches:Math.max(0,matches.length-cap)};
  }
  bound(value,max) { if (!Number.isInteger(value) || value < 1 || value > max) throw new Error(`Limit must be 1-${max}`); return value; }
  /** Passive retrieval: analyze a bounded one-hop file neighborhood, never allAnalysis. */
  region({path,startLine=1,endLine=Infinity,maxFiles=6,maxFacts=80}={}) {
    this.refresh();this.bound(maxFiles,12);this.bound(maxFacts,160);
    const file=resolve(this.root,path);if(!this.files.has(file))throw new Error('Source is outside the admitted index');
    const seedCached=this.cache.has(file),seed=this.analyze(file),exported=new Set(seed.edges.filter(e=>e.kind==='exports').map(e=>e.to));
    const symbols=[...this.nodes.values()].filter(n=>n.path===path&&['function','method','class','interface','type','binding'].includes(n.kind)&&n.line<=endLine&&this.program.getSourceFile(file).getLineAndCharacterOfPosition(n.start+n.length).line+1>=startLine);
    const candidates=symbols.filter(n=>exported.has(n.id)||[...exported].some(id=>n.id.startsWith(id+'/'))).sort((a,b)=>Math.abs(a.line-startLine)-Math.abs(b.line-startLine)||a.length-b.length||a.id.localeCompare(b.id));
    const roots=candidates.slice(0,3);
    const selected=new Set(roots.map(n=>n.id));if(!selected.size)selected.add(path);
    const rootSymbols=new Set(roots.map(n=>this.declarations.get(n.id)?.name).filter(Boolean).map(n=>this.symbol(n)).filter(Boolean));
    const touches=id=>selected.has(id)||[...selected].some(root=>id.startsWith(root+'/'))||rootSymbols.has(this.symbol(this.declarations.get(id)?.name));
    const distances=new Map([[file,0]]),queue=[file];let candidateLimit=false;
    for(let i=0;i<queue.length;i++){
      const current=queue[i],distance=distances.get(current);if(distance>=2)continue;
      const adjacent=[...this.modules].filter(([,deps])=>deps.includes(current)).map(([p])=>p).concat(this.modules.get(current)??[]).sort();
      for(const next of adjacent)if(!distances.has(next)){if(distances.size>=32){candidateLimit=true;break;}distances.set(next,distance+1);queue.push(next);}
    }
    const test=f=>this.nodes.get(this.path(f))?.test?1:0;
    const neighbors=queue.slice(1).sort((a,b)=>test(a)-test(b)||distances.get(a)-distances.get(b)||a.localeCompare(b));
    const chosen=neighbors.slice(0,maxFiles-1),testFile=neighbors.find(test);if(testFile&&!chosen.some(test)&&chosen.length>1)chosen[chosen.length-1]=testFile;
    const files=[file,...chosen],facts=[],unresolved=[];let cacheHits=0,limited=false;
    for(const candidate of files){
      if(candidate===file?seedCached:this.cache.has(candidate))cacheHits++;const entry=candidate===file?seed:this.analyze(candidate);limited ||= entry.limited;unresolved.push(...entry.unresolved);
      for(const e of entry.edges){
        if(!['calls','references','type_dependency','data_flow','imports','reexports','exports'].includes(e.kind))continue;
        const from=this.nodes.get(e.from),to=this.nodes.get(e.to);if(!from||!to||from.path===to.path)continue;
        if(!(from.path===path&&touches(e.from)||to.path===path&&touches(e.to)))continue;
        facts.push({...e,fromNode:from,toNode:to});
      }
    }
    const priority={calls:0,data_flow:1,type_dependency:2,references:3,reexports:4,imports:5,exports:6};
    const seen=new Set(),ranked=facts.sort((a,b)=>priority[a.kind]-priority[b.kind]||a.location.path.localeCompare(b.location.path)||a.location.line-b.location.line||a.to.localeCompare(b.to)).filter(e=>{const key=`${e.from}:${e.kind}:${e.to}`;if(seen.has(key))return false;seen.add(key);return true;});
    return {revision:this.revision,roots:roots.map(n=>n.id),omittedSymbols:Math.max(0,candidates.length-roots.length),facts:ranked.slice(0,maxFacts),omittedFacts:Math.max(0,ranked.length-maxFacts),unresolved,expanded:files.map(f=>this.path(f)),unexpanded:Math.max(0,neighbors.length-chosen.length),cacheHits,limited:limited||this.state().incomplete||candidateLimit||candidates.length>roots.length};
  }
  requireSymbol(id) { const symbol = this.nodes.get(id); if (!symbol) throw new Error('Unknown symbol identity; refresh semantic_symbols'); return symbol; }
  allAnalysis() {
    const start = performance.now(), edges = [], unresolved = []; let limited = false;
    for (const file of this.files.keys()) {
      const result = this.analyze(file); limited ||= result.limited;
      if (edges.length + result.edges.length > this.policy.maxEdges) { limited = true; break; }
      edges.push(...result.edges); unresolved.push(...result.unresolved);
    }
    // Bound retained relationship memory as well as returned results.
    if ([...this.cache.values()].reduce((n,e)=>n+e.edges.length,0) > this.policy.maxEdges) { this.cache.clear(); limited = true; }
    this.lastLookup = {analysisMs:performance.now()-start,edges:edges.length,unresolved:unresolved.length,limited};
    return {edges,unresolved,limited};
  }
  dependencies({symbol,direction='dependencies',depth=1,limit=30,kinds} = {}) {
    this.refresh(); this.requireSymbol(symbol); this.bound(limit,80);
    if (!['dependencies','dependents'].includes(direction) || !Number.isInteger(depth) || depth < 1 || depth > 5) throw new Error('Invalid direction or depth (1-5)');
    const analysis = direction === 'dependencies' && depth === 1 ? this.analyze(resolve(this.root,this.nodes.get(symbol).path)) : this.allAnalysis();
    const accepted = new Set(kinds ?? [...relationshipKinds]), adjacency = new Map();
    for (const e of analysis.edges) if (accepted.has(e.kind)) { const key = direction === 'dependencies' ? e.from : e.to; if (!adjacency.has(key)) adjacency.set(key,[]); adjacency.get(key).push(e); }
    const queue = [{id:symbol,path:[]}], seen = new Set([symbol]), matches = []; let truncated = false;
    for (let i=0;i<queue.length;i++) {
      const current = queue[i]; if (current.path.length >= depth) continue;
      for (const edge of adjacency.get(current.id) ?? []) {
        const id = direction === 'dependencies' ? edge.to : edge.from;
        if (seen.has(id)) continue; seen.add(id);
        const path = [...current.path,edge]; matches.push({symbol:this.nodes.get(id),direct:path.length===1,path});
        if (matches.length >= limit) { truncated = true; break; } queue.push({id,path});
      }
      if (truncated) break;
    }
    return {...this.state(),symbol,direction,matches,truncated,analysisLimited:!!analysis.limited,unresolved:analysis.unresolved.slice(0,20),unresolvedCount:analysis.unresolved.length};
  }
  callers(args) { return this.dependencies({...args,direction:'dependents',kinds:['calls']}); }
  impact({symbol,change,depth=3,limit=40} = {}) {
    if (!CHANGE_KINDS.includes(change)) throw new Error(`Change must be one of ${CHANGE_KINDS.join(', ')}`);
    const found = this.dependencies({symbol,direction:'dependents',depth,limit});
    const contracts = ['signature','return_type','parameters','exports','rename'].includes(change);
    const {matches,...context}=found;
    return {...context,change,affected:matches.map(match => ({...match,categories:[
      {category:'structural',certainty:'resolved',evidence:'compiler_dependency_path'},
      ...(contracts?[{category:'type',certainty:'possible',evidence:'contract_change_requires_typecheck'}]:[]),
      ...(match.path.some(e=>e.kind==='data_flow')?[{category:'data_flow',certainty:'resolved',evidence:'direct_def_use_path'}]:[]),
      {category:'behavioral',certainty:'possible',evidence:'static_reachability_only'},
    ]})),verification:{targets:[...new Set([this.requireSymbol(symbol).path,...found.matches.map(m=>m.symbol.path)])],typecheck:contracts,fullSuiteRecommended:true,tests:this.affectedTests({symbols:[symbol],limit:Math.min(limit,80)})},
      unresolvedPossibilities:['Business-rule consequences require independent tests or runtime evidence.','Unresolved calls and omitted sources can hide additional consumers.']};
  }
  affectedTests({symbols,limit=40} = {}) {
    this.refresh(); this.bound(limit,80); if (!Array.isArray(symbols) || !symbols.length || symbols.length > 30) throw new Error('Provide 1-30 exact symbol identities');
    symbols.forEach(id=>this.requireSymbol(id)); const analysis = this.allAnalysis(), sourceFiles = new Set(symbols.map(id=>this.nodes.get(id).path));
    const tests = [...this.nodes.values()].filter(n=>n.kind==='file' && n.test), direct = [], inferred = [], uncertain = [], unmapped = [];
    for (const test of tests) {
      const directEdges = analysis.edges.filter(e=>symbols.includes(e.to) && e.location.path===test.path && relationshipKinds.has(e.kind));
      if (directEdges.length || sourceFiles.has(test.path)) { direct.push({path:test.path,certainty:'resolved_reference',evidence:directEdges.slice(0,5),coverageProven:false}); continue; }
      const queue = [{file:resolve(this.root,test.path),path:[]}], seen = new Set(); let found;
      for (let i=0;i<queue.length;i++) { const current=queue[i]; if (seen.has(current.file)) continue; seen.add(current.file);
        if (sourceFiles.has(this.path(current.file))) { found=current.path; break; }
        for (const target of this.modules.get(current.file)??[]) queue.push({file:target,path:[...current.path,{from:this.path(current.file),to:this.path(target),evidence:'compiler_module_resolution'}]});
      }
      if (found) inferred.push({path:test.path,certainty:'possible',evidence:found,coverageProven:false});
      else if (analysis.unresolved.some(u=>u.location.path===test.path)) uncertain.push({path:test.path,certainty:'unresolved',reason:'unresolved_test_dependencies'});
      else unmapped.push(test.path);
    }
    return {...this.state(),direct:direct.slice(0,limit),inferred:inferred.slice(0,limit),uncertain:uncertain.slice(0,limit),unmapped:unmapped.slice(0,limit),
      counts:{direct:direct.length,inferred:inferred.length,uncertain:uncertain.length,unmapped:unmapped.length},analysisLimited:analysis.limited,
      fullSuiteRecommended:true,coverageMetadata:this.coverageMetadata,testDiscovery:{conventionalPaths:true,...this.testConfig,limitations:'Only JSON/package Jest testMatch patterns are read. Executable runner configs are not evaluated; whole-suite Istanbul coverage cannot establish per-test ownership.'}};
  }
  diagnostics() {
    const result=[];
    for (const file of this.files.keys()) { const sf=this.program.getSourceFile(file); if (!sf) continue;
      for (const d of [...this.program.getSyntacticDiagnostics(sf),...this.program.getSemanticDiagnostics(sf)]) result.push({path:this.path(file),code:d.code,message:ts.flattenDiagnosticMessageText(d.messageText,' ')});
    } return result;
  }
  dispose() {
    if(this.disposed)return;this.service?.dispose();this.service=null;
    for(const map of [this.files,this.metadata,this.cache,this.nodes,this.declarations,this.nodeIds,this.modules,this.globalFiles])map?.clear();
    this.metrics=[];this.program=null;this.checker=null;this.host=null;this.disposed=true;
  }
}
