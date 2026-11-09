import {parseJavaScript} from '../navigation.mjs';
import {hash} from '../workspace.mjs';

const functions=new Set(['FunctionDeclaration','FunctionExpression','ArrowFunctionExpression']);
const children=node=>Object.entries(node).filter(([key])=>!['loc','start','end'].includes(key)).flatMap(([,v])=>Array.isArray(v)?v.filter(x=>x?.type):v?.type?[v]:[]);
const names=pattern=>!pattern?[]:pattern.type==='Identifier'?[pattern]:pattern.type==='RestElement'?names(pattern.argument):pattern.type==='AssignmentPattern'?names(pattern.left):pattern.type==='ObjectPattern'?pattern.properties.flatMap(p=>names(p.type==='RestElement'?p.argument:p.value)):pattern.type==='ArrayPattern'?pattern.elements.flatMap(names):[];

/** Lexical binding analysis; call edges target bindings, never predicted runtime values. */
export function analyzeFile(source,path){
  const ast=parseJavaScript(source,path), version=hash(source);
  const symbols=[],imports=[],exports=[],references=[],unresolved=[];
  const scopes=new WeakMap(),owners=new WeakMap(),parameterContexts=new WeakSet(),declarations=new WeakSet(),symbolNodes=new WeakMap();
  const root={id:'module',bindings:new Map(),parent:null,fn:true};
  let dynamicScope=false;
  const scope=(parent,label,fn=false)=>{parent.counts??=new Map();const n=parent.counts.get(label)??0;parent.counts.set(label,n+1);return {id:`${parent.id}/${label}:${n}`,bindings:new Map(),parent,fn};};
  const bind=(s,id,kind,node)=>{
    declarations.add(id);
    const list=s.bindings.get(id.name)??[];
    const symbol={id:`${path}#${s.id}/${kind}:${id.name}:${list.length}`,name:id.name,kind,path,start:node.loc.start.line,end:node.loc.end.line,hash:hash(source.slice(node.start,node.end))};
    list.push(symbol.id);s.bindings.set(id.name,list);symbols.push(symbol);symbolNodes.set(id,symbol);return symbol;
  };
  const lookup=(s,name)=>{for(;s;s=s.parent)if(s.bindings.has(name))return s.bindings.get(name);return [];};
  // First establish every scope and binding, then resolve uses (including hoisted uses).
  function build(node,s,parent,owner=null,parameterContext=false){
    if(node.type==='FunctionDeclaration'&&node.id)owner=bind(s,node.id,'function',node).id;
    if(node.type==='ClassDeclaration'&&node.id)owner=bind(s,node.id,'class',node).id;
    if(node.type==='MethodDefinition'&&!node.computed){
      const name=String(node.key.name??node.key.value),id=`${path}#${s.id}/method:${node.static?'static:':''}${node.kind}:${name}`;
      symbols.push({id,name,kind:'method',path,start:node.loc.start.line,end:node.loc.end.line,hash:hash(source.slice(node.start,node.end))});owner=id;
    }
    if(functions.has(node.type)){
      const label=node.id?.name??(parent?.type==='VariableDeclarator'?parent.id.name:null)??(parent?.type==='MethodDefinition'?parent.key.name:null)??'anonymous';
      s=scope(s,`function:${label}`,true);
      if(node.type==='FunctionExpression'&&node.id)owner=bind(s,node.id,'function',node).id;
      if(parent?.type==='VariableDeclarator')owner=symbolNodes.get(parent.id)?.id??owner;
      for(const p of node.params)for(const id of names(p))bind(s,id,'parameter',p);
    }else if(node.type==='BlockStatement'||node.type==='CatchClause'||['ForStatement','ForInStatement','ForOfStatement','SwitchStatement','ClassExpression','ClassDeclaration','StaticBlock'].includes(node.type)){
      s=scope(s,node.type+(node.type.startsWith('Class')?`:${node.id?.name??'anonymous'}`:''),node.type==='StaticBlock');
      if(node.type==='CatchClause')for(const id of names(node.param))bind(s,id,'parameter',node.param);
      if(node.type==='ClassExpression'&&node.id)bind(s,node.id,'class',node);
    }
    scopes.set(node,s);
    owners.set(node,owner);
    if(parameterContext)parameterContexts.add(node);
    if(node.type==='VariableDeclarator'){
      let target=s;if(parent?.kind==='var')while(!target.fn)target=target.parent;
      for(const id of names(node.id))bind(target,id,functions.has(node.init?.type)?'function':'binding',node);
    }
    if(node.type==='ImportDeclaration'){
      imports.push({module:node.source.value,line:node.loc.start.line,kind:'import'});
      for(const spec of node.specifiers){
        const symbol=bind(s,spec.local,'import',spec);
        symbol.import={module:node.source.value,name:spec.type==='ImportDefaultSpecifier'?'default':spec.type==='ImportNamespaceSpecifier'?'*':spec.imported.name??spec.imported.value};
        symbol.hash=hash(source.slice(node.start,node.end));
      }
    }
    if(node.type==='WithStatement'||(node.type==='CallExpression'&&node.callee.name==='eval'))dynamicScope=true;
    for(const child of children(node))build(child,s,node,owner,parameterContext||(functions.has(node.type)&&node.params.includes(child)));
  }
  build(ast,root);
  const evidence=node=>({path,line:node.loc.start.line,column:node.loc.start.column,fileVersion:version,syntax:node.type});
  function visit(node,parent,key){
    const s=scopes.get(node);
    if(node.type==='ExportNamedDeclaration'){
      if(node.source)imports.push({module:node.source.value,line:node.loc.start.line,kind:'reexport'});
      if(node.declaration){const d=node.declaration;const ids=d.type==='VariableDeclaration'?d.declarations.flatMap(x=>names(x.id)):[d.id].filter(Boolean);for(const id of ids)exports.push({name:id.name,local:id.name,evidence:evidence(node)});}
      for(const spec of node.specifiers)exports.push({name:spec.exported.name??spec.exported.value,local:spec.local.name??spec.local.value,...(node.source?{module:node.source.value}:{}),evidence:evidence(node)});
    }
    if(node.type==='ExportDefaultDeclaration'){
      const d=node.declaration;
      const local=d.type==='Identifier'?d.name:d.id?.name;
      if(local)exports.push({name:'default',local,evidence:evidence(node)});
      else unresolved.push({kind:'export',reason:'anonymous-default',evidence:evidence(node)});
    }
    if(node.type==='ExportAllDeclaration'){
      imports.push({module:node.source.value,line:node.loc.start.line,kind:'reexport'});
      unresolved.push({kind:'export',reason:'wildcard-export',evidence:evidence(node)});
    }
    if(node.type==='ImportExpression'||(node.type==='CallExpression'&&node.callee.name==='require')){
      unresolved.push({kind:'module',reason:node.type==='ImportExpression'?'dynamic-import':'commonjs',specifier:node.source?.value??node.arguments?.[0]?.value??null,evidence:evidence(node)});
    }
    if(node.type==='CallExpression'&&(node.callee.type==='MemberExpression'||node.callee.type==='ChainExpression'))unresolved.push({kind:'call',reason:'dynamic-dispatch',evidence:evidence(node)});
    if(node.type==='Identifier'&&!declarations.has(node)){
      const property=(parent?.type==='MemberExpression'&&key==='property'&&!parent.computed)||(['Property','MethodDefinition','PropertyDefinition'].includes(parent?.type)&&key==='key'&&!parent.computed);
      const syntax=['ImportSpecifier','ImportDefaultSpecifier','ImportNamespaceSpecifier','ExportSpecifier','LabeledStatement','BreakStatement','ContinueStatement','MetaProperty'].includes(parent?.type);
      if(!property&&!syntax){
        // Default parameter environments differ from body var environments.
        // Abstain here instead of pretending the simplified body scope applies.
        const reason=dynamicScope?'dynamic-scope':parameterContexts.has(node)?'parameter-initializer':null;
        const candidates=reason?[]:lookup(s,node.name);
        references.push({name:node.name,from:owners.get(node)??`module:${path}`,kind:parent?.type==='CallExpression'&&key==='callee'?'call':'reference',binding:candidates.length===1?candidates[0]:null,reason:reason??(candidates.length>1?'ambiguous-binding':candidates.length?'lexical-binding':'unbound'),evidence:evidence(node)});
      }
    }
    for(const [k,v]of Object.entries(node))if(k!=='loc'){if(Array.isArray(v)){for(const child of v)if(child?.type)visit(child,node,k);}else if(v?.type)visit(v,node,k);}
  }
  visit(ast);
  return {path,version,symbols,imports,exports,references,unresolved,bindings:Object.fromEntries(root.bindings)};
}
