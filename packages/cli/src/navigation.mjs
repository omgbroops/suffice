import {parse} from 'acorn';import {fullAncestor} from 'acorn-walk';import {stripTypeScriptTypes} from 'node:module';import {Type} from 'typebox';import {readText,hash,filesIn} from './workspace.mjs';
const textResult=data=>({content:[{type:'text',text:JSON.stringify(data)}],structuredContent:data,details:{}});
const functionTypes=new Set(['FunctionDeclaration','FunctionExpression','ArrowFunctionExpression']);
export function indexJavaScript(source,path,{withBindings=false}={}){
  const parseSource=/\.(?:ts|mts|cts)$/.test(path)?stripTypeScriptTypes(source,{mode:'strip'}):source;
  let ast;try{ast=parse(parseSource,{ecmaVersion:'latest',sourceType:'script',locations:true,allowHashBang:true});}catch{ast=parse(parseSource,{ecmaVersion:'latest',sourceType:'module',locations:true,allowHashBang:true});}
  const symbols=[],imports=[],references=[],exportBindings=[],lines=source.split('\n');
  const add=(name,kind,node)=>symbols.push({name,kind,path,start:node.loc.start.line,end:node.loc.end.line,startOffset:node.start,endOffset:node.end});
  fullAncestor(ast,(node,_state,ancestors)=>{
    const parent=ancestors.at(-2),outer=ancestors.slice(0,-1);
    if(node.type==='FunctionDeclaration'&&node.id)add(node.id.name,'function',node);
    else if(node.type==='ClassDeclaration'&&node.id)add(node.id.name,'class',node);
    else if(node.type==='MethodDefinition'){
      const klass=[...outer].reverse().find(n=>n.type==='ClassDeclaration'||n.type==='ClassExpression');
      if(!node.computed)add(`${klass?.id?.name??'(class)'}.${node.key.name??node.key.value}`,'method',node);
    }else if(node.type==='VariableDeclarator'&&node.id.type==='Identifier'){
      if(functionTypes.has(node.init?.type))add(node.id.name,'function',parent?.type==='VariableDeclaration'?parent:node);
      else if(!outer.some(n=>functionTypes.has(n.type)))add(node.id.name,'binding',parent?.type==='VariableDeclaration'?parent:node);
    }
    if(node.type==='ImportDeclaration')imports.push({module:node.source.value,line:node.loc.start.line,text:source.slice(node.start,node.end),...(withBindings?{bindings:node.specifiers.map(s=>({imported:s.type==='ImportDefaultSpecifier'?'default':s.type==='ImportNamespaceSpecifier'?'*':s.imported.name??s.imported.value,local:s.local.name}))}:{})});
    if(withBindings&&node.type==='ExportDefaultDeclaration')exportBindings.push({exported:'default',local:node.declaration.id?.name??(node.declaration.type==='Identifier'?node.declaration.name:null)});
    if(withBindings&&node.type==='ExportNamedDeclaration'){
      if(node.declaration?.id?.name)exportBindings.push({exported:node.declaration.id.name,local:node.declaration.id.name});
      for(const d of node.declaration?.declarations??[])if(d.id.type==='Identifier')exportBindings.push({exported:d.id.name,local:d.id.name});
      if(!node.source)for(const s of node.specifiers)exportBindings.push({exported:s.exported.name??s.exported.value,local:s.local.name});
    }
    if(node.type==='VariableDeclarator'&&node.init?.type==='CallExpression'&&node.init.callee.name==='require'&&typeof node.init.arguments[0]?.value==='string')imports.push({module:node.init.arguments[0].value,line:node.loc.start.line,text:source.slice(parent?.start??node.start,parent?.end??node.end)});
    if(node.type==='Identifier'){
      if((parent?.type==='VariableDeclarator'&&parent.id===node)||(functionTypes.has(parent?.type)&&(parent.id===node||parent.params.includes(node)))||(parent?.type==='ClassDeclaration'&&parent.id===node))return;
      references.push({symbol:node.name,path,line:node.loc.start.line,text:lines[node.loc.start.line-1]?.trim()});
    }
  });
  symbols.sort((a,b)=>a.start-b.start||a.name.localeCompare(b.name));
  return {path,version:hash(source),source,symbols,imports,references,...(withBindings?{exportBindings}:{})};
}
export function createNavigation({workspace,log=()=>{},includeTypeScript=false}){
  const cache=new Map();
  const load=async path=>{const source=await readText(workspace,path),version=hash(source);const old=cache.get(path);if(old?.version===version)return old;
    let entry;try{entry=indexJavaScript(source,path);}catch{entry={path,version,source,symbols:[],imports:[],references:[],parseError:true};}cache.set(path,entry);return entry;};
  const all=async path=>{const paths=path?[path]:(await filesIn(workspace)).filter(p=>(includeTypeScript?/\.(?:js|mjs|cjs|ts|mts|cts)$/:/\.(?:js|mjs|cjs)$/).test(p));const values=[];for(const p of paths)values.push(await load(p));return values;};
  const make=(name,description,parameters,operation)=>({name,label:name,description,parameters,outputSchema:Type.Unknown(),async execute(_id,args){const start=performance.now();const value=await operation(args);log({type:'navigation',tool:name,args,latencyMs:performance.now()-start,characters:JSON.stringify(value).length});return textResult(value);}});
  return [
    make('symbols','Find JavaScript functions, class methods, classes and top-level bindings by name. Returns exact paths and line ranges, not source bodies. Query is a case-insensitive name substring; path is optional. Parser-based, no model calls.',Type.Object({query:Type.Optional(Type.String()),path:Type.Optional(Type.String()),limit:Type.Optional(Type.Integer({minimum:1,maximum:80}))}),async({query='',path,limit=30})=>{
      const entries=await all(path),matches=entries.flatMap(e=>e.symbols).filter(s=>s.name.toLowerCase().includes(query.toLowerCase()));
      return {matches:matches.slice(0,limit).map(({startOffset,endOffset,...s})=>s),total:matches.length,omitted:Math.max(0,matches.length-limit),unparsed:entries.filter(e=>e.parseError).map(e=>e.path)};
    }),
    make('symbol_read','Read one exact function/method/binding plus the file imports. Names come from symbols. Returns numbered source and explicit remaining-line count; use offset for additional pages. Reindexes after edits.',Type.Object({path:Type.String(),name:Type.String(),offset:Type.Optional(Type.Integer({minimum:0})),limit:Type.Optional(Type.Integer({minimum:1,maximum:500}))}),async({path,name,offset=0,limit=180})=>{
      const entry=await load(path);if(entry.parseError)return {error:'parse_failed',path,fallback:'Use read or a bash search.'};
      let matches=entry.symbols.filter(s=>s.name===name);if(!matches.length)matches=entry.symbols.filter(s=>s.name.endsWith(`.${name}`));
      if(matches.length!==1)return {error:matches.length?'ambiguous_symbol':'not_found',matches:matches.map(s=>({name:s.name,start:s.start,end:s.end})),fallback:'Use symbols with a narrower query, or read.'};
      const s=matches[0],lines=entry.source.split('\n'),start=s.start+offset,end=Math.min(s.end,start+limit-1);
      return {path,name:s.name,kind:s.kind,start,end,symbolStart:s.start,symbolEnd:s.end,remaining:Math.max(0,s.end-end),imports:entry.imports,text:lines.slice(start-1,end).map((line,i)=>`${start+i}: ${line}`).join('\n')};
    }),
    make('symbol_references','Find syntactic identifier references in production and test JavaScript. These are candidate references, not a fully resolved call graph; inspect the returned source before relying on a name match.',Type.Object({name:Type.String(),path:Type.Optional(Type.String()),limit:Type.Optional(Type.Integer({minimum:1,maximum:80}))}),async({name,path,limit=30})=>{
      const entries=await all(path),leaf=name.split('.').at(-1),found=entries.flatMap(e=>e.references.filter(r=>r.symbol===leaf));
      return {references:found.slice(0,limit),total:found.length,omitted:Math.max(0,found.length-limit),unparsed:entries.filter(e=>e.parseError).map(e=>e.path)};
    }),
  ];
}
