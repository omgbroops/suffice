import {mkdir,readFile,writeFile,cp} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {createRequire} from 'node:module';
import {implicitTasks} from '../benchmarks/implicit/tasks.mjs';
import {filesIn,hash,runNodeTests} from '../src/workspace.mjs';
import {SemanticGraph} from '../packages/cli/src/semantic/graph.mjs';
const root=resolve(import.meta.dirname,'..'),require=createRequire(import.meta.url),tsPath=require.resolve('typescript'),dependencyReads=[resolve(dirname(tsPath),'..')];
export const gradingOptions={dependencyReads,heapMb:512,timeoutMs:30000};
for(const task of implicitTasks){
 const dir=dirname(task.workspaceDir),upstream=JSON.parse(await readFile(resolve(dir,'upstream.json'),'utf8')),prefix=task.id.split('-')[0];
 await mkdir(task.workspaceDir,{recursive:true});await cp(resolve(dir,'upstream',task.sourceRoot),resolve(task.workspaceDir,task.sourceRoot),{recursive:true});
 for(const p of ['package.json','LICENSE'])try{await cp(resolve(dir,'upstream',p),resolve(task.workspaceDir,p));}catch(e){if(e.code!=='ENOENT')throw e;}
 await mkdir(resolve(task.workspaceDir,'tests'),{recursive:true});
 await writeFile(resolve(task.workspaceDir,'tests/load.cjs'),(await readFile(resolve(root,'benchmarks/implicit/loader.cjs'),'utf8')).replace('__TYPESCRIPT_PATH__',tsPath.replaceAll('\\','/')));
 await cp(resolve(root,`benchmarks/implicit/${prefix}-visible.mjs`),resolve(task.workspaceDir,'tests/visible.test.mjs'));
 await cp(resolve(root,`benchmarks/implicit/${prefix}-hidden.mjs`),task.acceptancePath);
 await writeFile(resolve(task.workspaceDir,'README.md'),`# ${task.repo} repair\n\n${task.prompt}\n\nProduction source is the unchanged ${task.sourceRoot}/ tree from ${upstream.base}. The public test tool runs adapted offline Node checks. Original production files may be edited; tests, loader, package and metadata are immutable. The loader transpiles TypeScript in memory with TypeScript 5.9.3. No installation, build, shell or network is needed. Independent acceptance includes further behavior/type checks. This scoped snapshot omits upstream docs, examples and original test-runner dependencies.\n`);
 const reference=resolve(dir,'reference');await cp(task.workspaceDir,reference,{recursive:true});const refs=JSON.parse(await readFile(resolve(dir,'reference-files.json'),'utf8'));for(const [file,source]of Object.entries(refs))await writeFile(resolve(reference,file),source);
 const baseline=await runNodeTests(task.workspaceDir,task.acceptancePath,gradingOptions),fixed=await runNodeTests(reference,task.acceptancePath,gradingOptions),regression=await runNodeTests(task.workspaceDir,resolve(task.workspaceDir,'tests/visible.test.mjs'),gradingOptions),fixedRegression=await runNodeTests(reference,resolve(reference,'tests/visible.test.mjs'),gradingOptions);
 const inventory=await filesIn(task.workspaceDir),sourceFiles=inventory.filter(p=>p.startsWith(task.sourceRoot+'/')&&/\.[cm]?[jt]sx?$/.test(p)),hashes={};for(const p of inventory)hashes[p]=hash(await readFile(resolve(task.workspaceDir,p)));
 const graph=new SemanticGraph(task.workspaceDir);graph.refresh();const relationships=graph.allAnalysis(),graphState=graph.state();graph.dispose();
 const sourceTexts=await Promise.all(sourceFiles.map(p=>readFile(resolve(task.workspaceDir,p),'utf8'))),validation={task:task.id,provenance:task.provenance,base:upstream.base,fix:task.fix,archiveHash:upstream.archiveHash,referenceFiles:task.referenceFiles,sourceFiles,sourceLines:sourceTexts.reduce((n,t)=>n+t.split('\n').length,0),sourceBytes:sourceTexts.reduce((n,t)=>n+Buffer.byteLength(t),0),moduleRelationships:relationships.edges.filter(e=>e.kind==='imports').length,crossFileRelationships:relationships.edges.filter(e=>e.location?.path&&e.from.split('#')[0]!==e.to.split('#')[0]).length,graphState,hashes,acceptanceHash:hash(await readFile(task.acceptancePath)),referenceHashes:Object.fromEntries(Object.entries(refs).map(([p,s])=>[p,hash(s)])),baseline,fixed,regression,fixedRegression,gradingOptions};
 await writeFile(resolve(dir,'validation.json'),JSON.stringify(validation,null,2));
 console.log(JSON.stringify({task:task.id,baseline:baseline.status,fixed:fixed.status,visible:regression.status,fixedVisible:fixedRegression.status,files:sourceFiles.length,lines:validation.sourceLines}));
 if(baseline.status!=='failed'||fixed.status!=='passed'||regression.status!=='passed'||fixedRegression.status!=='passed'){console.log(JSON.stringify({baseline:baseline.stdout.slice(-2500),fixed:fixed.stdout.slice(-4000),stderr:fixed.stderr,visible:regression.stdout.slice(-2000)}));throw new Error('Independent historical task screening failed');}
}
