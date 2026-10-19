// Native test adapter: emit decorators and redirect the source import without
// modifying the tracked TypeScript tests or requiring a persistent daemon.
import {registerHooks} from 'node:module';
import {readFileSync} from 'node:fs';
import ts from '/workspace/node_modules/typescript/lib/typescript.js';
registerHooks({
 resolve(specifier,context,next) {
  return next(specifier==='./index.js'&&context.parentURL?.endsWith('/test.ts')?'./index.ts':specifier,context);
 },
 load(url,context,next) {
  if(url.startsWith('file:///workspace/')&&url.endsWith('.ts'))return {format:'module',shortCircuit:true,
   source:ts.transpileModule(readFileSync(new URL(url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText};
  return next(url,context);
 }
});
