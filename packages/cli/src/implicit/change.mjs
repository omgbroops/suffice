import ts from 'typescript';
import {createHash} from 'node:crypto';
const hash=value=>createHash('sha256').update(value).digest('hex');
const printer=ts.createPrinter({removeComments:true});
const exported=n=>ts.getModifiers(n)?.some(m=>[ts.SyntaxKind.ExportKeyword,ts.SyntaxKind.DefaultKeyword].includes(m.kind));
const scan=text=>{const scanner=ts.createScanner(ts.ScriptTarget.Latest,true,ts.LanguageVariant.JSX,text),tokens=[];let kind;while((kind=scanner.scan())!==ts.SyntaxKind.EndOfFileToken)tokens.push({kind,text:scanner.getTokenText(),start:scanner.getTokenPos()});return tokens;};
export function classifyChange(before,after,path){
  const a=scan(before),b=scan(after);if(JSON.stringify(a.map(t=>[t.kind,t.text]))===JSON.stringify(b.map(t=>[t.kind,t.text])))return {kind:'trivia',external:false,typecheck:false};
  const old=ts.createSourceFile(path,before,ts.ScriptTarget.Latest,true),next=ts.createSourceFile(path,after,ts.ScriptTarget.Latest,true);
  const localBindings=new Map(),identifiers=new Map();let dynamicNames=false;
  const visit=(n,nested=false)=>{
    if(ts.isIdentifier(n))identifiers.set(n.getStart(old),n);
    if((ts.isCallExpression(n)||ts.isNewExpression(n))&&/^(?:eval|Function)$/.test(n.expression.getText(old)))dynamicNames=true;
    if(ts.isVariableDeclaration(n)&&ts.isIdentifier(n.name)&&nested){const bindings=localBindings.get(n.name.text)??[];bindings.push(n);localBindings.set(n.name.text,bindings);}
    ts.forEachChild(n,c=>visit(c,nested||ts.isFunctionLike(n)));
  };visit(old);
  const changed=a.length===b.length?a.map((t,i)=>({a:t,b:b[i]})).filter(p=>p.a.text!==p.b.text):[];
  if(!dynamicNames&&changed.length&&changed.every(p=>p.a.kind===ts.SyntaxKind.Identifier&&p.b.kind===ts.SyntaxKind.Identifier&&localBindings.has(p.a.text))){
    const mapping=new Map(),oldNames=new Set(a.filter(t=>t.kind===ts.SyntaxKind.Identifier).map(t=>t.text));let consistent=true;
    for(const {a,b}of changed){if(mapping.has(a.text)&&mapping.get(a.text)!==b.text)consistent=false;mapping.set(a.text,b.text);}
    const complete=a.every((token,i)=>token.kind!==ts.SyntaxKind.Identifier||!mapping.has(token.text)||b[i].text===mapping.get(token.text));
    const fresh=[...mapping.values()].every(name=>!oldNames.has(name))&&new Set(mapping.values()).size===mapping.size;
    const bindingRenamed=[...mapping].every(([name,nextName])=>localBindings.get(name).every(declaration=>changed.some(p=>p.a.start===declaration.name.getStart(old)&&p.b.text===nextName)&&!(declaration.initializer&&(ts.isFunctionLike(declaration.initializer)||ts.isClassExpression(declaration.initializer)))));
    const bad=changed.some(p=>{const found=identifiers.get(p.a.start);return !found||ts.isPropertyAccessExpression(found.parent)&&found.parent.name===found||ts.isPropertyAssignment(found.parent)&&found.parent.name===found||ts.isShorthandPropertyAssignment(found.parent)||ts.isFunctionDeclaration(found.parent)&&found.parent.name===found;});
    if(consistent&&complete&&fresh&&bindingRenamed&&!bad)return {kind:'local_binding',external:false,typecheck:false};
  }
  const contract=sf=>sf.statements.filter(n=>exported(n)||ts.isImportDeclaration(n)||ts.isExportDeclaration(n)).map(n=>{
    if(ts.isFunctionDeclaration(n))return printer.printNode(ts.EmitHint.Unspecified,ts.factory.updateFunctionDeclaration(n,n.modifiers,n.asteriskToken,n.name,n.typeParameters,n.parameters,n.type,undefined),sf);
    if(ts.isClassDeclaration(n))return `${n.name?.text}:${n.members.map(m=>m.name?.getText(sf)+':'+(m.parameters?.map(p=>p.getText(sf)).join(',')??'')+':'+(m.type?.getText(sf)??'')).join(';')}`;
    if(ts.isVariableStatement(n))return n.declarationList.declarations.map(d=>`${d.name.getText(sf)}:${d.type?.getText(sf)??''}:${d.initializer&&ts.isArrowFunction(d.initializer)?d.initializer.parameters.map(p=>p.getText(sf)).join(',')+':'+d.initializer.type?.getText(sf):d.initializer?.getText(sf)}`).join(';');
    return printer.printNode(ts.EmitHint.Unspecified,n,sf);
  }).join('\n');
  const contractChanged=hash(contract(old))!==hash(contract(next)),hasExports=old.statements.some(exported)||/module\.exports|exports\./.test(before);
  return {kind:contractChanged?'contract':'implementation',external:contractChanged||hasExports,typecheck:/\.[cm]?tsx?$/.test(path)&&(contractChanged||hasExports),uncertainty:'Static signatures do not establish behavioral equivalence.'};
}
