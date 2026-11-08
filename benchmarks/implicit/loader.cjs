// Trusted public test support: compile original TypeScript in memory, no build writes.
const fs=require('node:fs'),path=require('node:path'),Module=require('node:module');
const ts=require('__TYPESCRIPT_PATH__');
const original=Module._resolveFilename;
Module._resolveFilename=function(specifier,parent,...rest){
 if(specifier.startsWith('.')||path.isAbsolute(specifier)){
  const base=path.resolve(parent?path.dirname(parent.filename):process.cwd(),specifier),stem=base.replace(/\.js$/,'');
  for(const file of [stem+'.ts',path.join(base,'index.ts')])if(fs.existsSync(file))return file;
 }
 return original.call(this,specifier,parent,...rest);
};
Module._extensions['.ts']=(module,file)=>module._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{fileName:file,compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,file);
exports.load=file=>require(path.resolve(process.cwd(),file));
exports.typecheck=source=>{
 const virtual=path.resolve(process.cwd(),'tests/contract-input.ts'),globals=path.resolve(process.cwd(),'tests/runtime-globals.d.ts');
 const options={strict:true,noEmit:true,target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.CommonJS,moduleResolution:ts.ModuleResolutionKind.Node10,skipLibCheck:true,types:[],lib:['lib.es2020.d.ts','lib.dom.d.ts']};
 const host=ts.createCompilerHost(options),read=host.readFile,exists=host.fileExists,get=host.getSourceFile;
 const text=file=>path.resolve(file)===virtual?source:path.resolve(file)===globals?'declare const process: {env: Record<string,string|undefined>};':undefined;
 host.readFile=file=>text(file)??read(file);
 host.fileExists=file=>text(file)!==undefined||exists(file);
 host.getSourceFile=(file,language,...rest)=>text(file)!==undefined?ts.createSourceFile(file,text(file),language,true):get(file,language,...rest);
 const program=ts.createProgram([virtual,globals],options,host);
 return ts.getPreEmitDiagnostics(program).map(d=>`${d.file?path.relative(process.cwd(),d.file.fileName)+':'+(d.file.getLineAndCharacterOfPosition(d.start).line+1):''} TS${d.code} ${ts.flattenDiagnosticMessageText(d.messageText,' ')}`);
};
